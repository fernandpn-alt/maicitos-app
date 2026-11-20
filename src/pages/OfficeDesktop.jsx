import React, { useMemo, useState } from 'react';
import {
  Boxes,
  MessageSquare,
  Users,
  DollarSign,
  History,
  Plus,
  ArrowLeftRight,
  SlidersHorizontal,
  MapPin,
  MessageCircle,
  Send,
  CheckCircle2,
  Download,
  UserPlus,
  Edit3,
  Brain
} from 'lucide-react';
import {
  ORDER_PRIORITY_META,
  ORDER_STATUS_META
} from '../constants/defaults';
import {
  computeClientBalances,
  computeFinancialSummary,
  getLocalDateKey,
  isSameLocalDay
} from '../db/ledger';
import {
  addOrderTeamNote,
  exportSalesCSV,
  recordExpense,
  recordPayment,
  recordStockAdjustment,
  recordStockIn,
  recordTransfer,
  updateOrderPriority,
  updateOrderStatus
} from '../db/operations';
import { getDeviceIdentity } from '../db/dexie';
import { evaluateCreditRisk } from '../services/decisionClient';
import { syncNow } from '../services/syncEngine';
import { sounds } from '../utils/audio';
import {
  formatDebtReminder,
  formatMoney,
  formatOrderConfirmation,
  openWhatsApp
} from '../utils/whatsappFormat';
import ClientFormModal from '../components/ClientFormModal';
import SalePaymentModal from '../components/SalePaymentModal';

export default function OfficeDesktop({
  products = [],
  locations = [],
  clients = [],
  orders = [],
  sales = [],
  payments = [],
  expenses = [],
  movements = [],
  stockMap,
  priceTiers,
  onOpenQuickOrder,
  onNavigate
}) {
  const identity = getDeviceIdentity();
  const [subView, setSubView] = useState('inventory'); // inventory | orders | clients | closing | kardex

  // Inventory quick actions
  const [invModal, setInvModal] = useState(null); // null | 'in' | 'transfer' | 'adjust'
  const [invProductId, setInvProductId] = useState('fuego');
  const [invQty, setInvQty] = useState(1);
  const [invFromLoc, setInvFromLoc] = useState('bodega');
  const [invToLoc, setInvToLoc] = useState('auto-papa');
  const [invReason, setInvReason] = useState('');

  // Orders
  const [orderFilter, setOrderFilter] = useState('activos'); // activos | entregados | todos
  const [noteDrafts, setNoteDrafts] = useState({});
  const [checkoutOrder, setCheckoutOrder] = useState(null);

  // Clients & Payments
  const [clientSearch, setClientSearch] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [clientModalState, setClientModalState] = useState({ open: false, client: null });
  const [paymentModalClient, setPaymentModalClient] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');
  const [payNote, setPayNote] = useState('');
  const [clientRiskMap, setClientRiskMap] = useState({});
  const [riskBusyId, setRiskBusyId] = useState(null);

  // Daily Closing & Expenses
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey());
  const [expCategory, setExpCategory] = useState('gasolina');
  const [expConcept, setExpConcept] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState('efectivo');

  // Kardex
  const [kardexMode, setKardexMode] = useState('movements'); // movements | sales

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => !p.deleted_at && p.active !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );

  const activeLocations = useMemo(
    () => locations.filter((l) => !l.deleted_at && l.active !== false),
    [locations]
  );

  const activeClients = useMemo(
    () => clients.filter((c) => !c.deleted_at && c.active !== false),
    [clients]
  );

  const clientBalances = useMemo(
    () => computeClientBalances(sales, payments),
    [sales, payments]
  );

  const todaySummary = useMemo(
    () =>
      computeFinancialSummary({
        sales,
        payments,
        expenses,
        dateFilter: getLocalDateKey(),
        allSales: sales,
        allPayments: payments
      }),
    [sales, payments, expenses]
  );

  const selectedDateSummary = useMemo(
    () =>
      computeFinancialSummary({
        sales,
        payments,
        expenses,
        dateFilter: selectedDate,
        allSales: sales,
        allPayments: payments
      }),
    [sales, payments, expenses, selectedDate]
  );

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locationById = Object.fromEntries(locations.map((l) => [l.id, l]));

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => !o.deleted_at)
      .filter((o) => {
        if (orderFilter === 'activos') {
          return o.status !== 'entregado' && o.status !== 'cancelado';
        }
        if (orderFilter === 'entregados') {
          return o.status === 'entregado';
        }
        return true;
      })
      .sort((a, b) => {
        if (orderFilter === 'activos') {
          const ra = ORDER_PRIORITY_META[a.priority]?.rank ?? 1;
          const rb = ORDER_PRIORITY_META[b.priority]?.rank ?? 1;
          if (ra !== rb) return ra - rb;
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [orders, orderFilter]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return activeClients
      .filter((c) => {
        const bal = clientBalances[c.id]?.balance || 0;
        if (onlyDebtors && bal <= 0) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          String(c.phone || '').includes(q) ||
          String(c.address || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (clientBalances[b.id]?.balance || 0) - (clientBalances[a.id]?.balance || 0));
  }, [activeClients, clientBalances, clientSearch, onlyDebtors]);

  const dateExpenses = useMemo(
    () =>
      expenses
        .filter((e) => !e.deleted_at && isSameLocalDay(e.created_at, selectedDate))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [expenses, selectedDate]
  );

  const activeOrdersCount = orders.filter(
    (o) => !o.deleted_at && o.status !== 'entregado' && o.status !== 'cancelado'
  ).length;

  const handleInventoryAction = async (e) => {
    e.preventDefault();
    const qty = Number(invQty) || 0;
    if (qty === 0) return;

    if (invModal === 'in') {
      await recordStockIn({
        items: [{ product_id: invProductId, boxes: Math.abs(qty) }],
        location_id: invToLoc || 'bodega',
        actor_name: identity.device_name,
        note: invReason || 'Entrada desde Oficina'
      });
    } else if (invModal === 'transfer') {
      await recordTransfer({
        items: [{ product_id: invProductId, qty: Math.abs(qty) }],
        from_location_id: invFromLoc,
        to_location_id: invToLoc,
        actor_name: identity.device_name,
        note: invReason
      });
    } else if (invModal === 'adjust') {
      await recordStockAdjustment({
        product_id: invProductId,
        location_id: invFromLoc,
        delta: qty,
        reason: invReason || 'Ajuste desde Oficina',
        movement_type: qty < 0 ? 'merma' : 'adjustment',
        actor_name: identity.device_name
      });
    }

    sounds.playCashChime();
    syncNow();
    setInvModal(null);
    setInvReason('');
  };

  const handleAddTeamNote = async (orderId) => {
    const text = noteDrafts[orderId];
    if (!text || !text.trim()) return;
    await addOrderTeamNote(orderId, {
      author: identity.device_name,
      role: 'oficina',
      text
    });
    setNoteDrafts((prev) => ({ ...prev, [orderId]: '' }));
    syncNow();
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalClient) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) return;
    await recordPayment({
      client_id: paymentModalClient.id,
      client_name: paymentModalClient.name,
      amount: amt,
      method: payMethod,
      note: payNote || 'Abono registrado en Oficina',
      received_by: identity.device_name
    });
    sounds.playCashChime();
    syncNow();
    setPaymentModalClient(null);
    setPayAmount('');
    setPayNote('');
  };

  const handleEvaluateClientRisk = async (client) => {
    setRiskBusyId(client.id);
    try {
      const entry = clientBalances[client.id] || { totalCredit: 0, totalPaid: 0, balance: 0 };
      const salesCount = sales.filter((s) => !s.deleted_at && s.client_id === client.id).length;
      const res = await evaluateCreditRisk({
        clientName: client.name,
        currentBalance: entry.balance,
        totalCredit: entry.totalCredit,
        totalPaid: entry.totalPaid,
        requestedCredit: 500,
        salesCount
      });
      setClientRiskMap((prev) => ({
        ...prev,
        [client.id]: res.ok
          ? res.result
          : { error: res.error || 'No se pudo evaluar el riesgo.' }
      }));
      if (res.ok) sounds.playSaleClick(1);
    } finally {
      setRiskBusyId(null);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = Number(expAmount) || 0;
    if (!expConcept.trim() || amt <= 0) return;
    await recordExpense({
      category: expCategory,
      concept: expConcept,
      amount: amt,
      payment_method: expMethod,
      recorded_by: identity.device_name
    });
    sounds.playSaleClick(1);
    syncNow();
    setExpConcept('');
    setExpAmount('');
  };

  const bodegaTotal = stockMap?.totalsByLocation?.bodega || 0;
  const routesTotal = (stockMap?.grandTotal || 0) - bodegaTotal;

  return (
    <div className="max-w-7xl mx-auto px-3 py-4 pb-12 flex flex-col lg:flex-row gap-4">
      {/* Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-1.5 h-fit">
        <div className="px-2 py-2 border-b border-slate-100 mb-1">
          <div className="font-black text-slate-900 text-sm">💻 Oficina Bodega</div>
          <div className="text-xs text-slate-500">Vista completa BoxHero ERP</div>
        </div>

        <button
          type="button"
          onClick={() => setSubView('inventory')}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold ${
            subView === 'inventory'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Inventario
          </span>
          <span className="text-xs font-black">{stockMap?.grandTotal || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView('orders')}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold ${
            subView === 'orders'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Pedidos WhatsApp
          </span>
          {activeOrdersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black">
              {activeOrdersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubView('clients')}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold ${
            subView === 'clients'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Clientes y Fiado
          </span>
          {todaySummary.totalOutstandingDebt > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-black">
              {formatMoney(todaySummary.totalOutstandingDebt)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubView('closing')}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold ${
            subView === 'closing'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Corte y Gastos
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubView('kardex')}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold ${
            subView === 'kardex'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" /> Kardex / Historial
          </span>
        </button>

        <div className="pt-2 mt-2 border-t border-slate-100 space-y-1.5">
          <button
            type="button"
            onClick={onOpenQuickOrder}
            className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs text-center"
          >
            ⚡ Nuevo Pedido WhatsApp
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/tablet')}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs text-center"
          >
            📟 Abrir Vista Tablet
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top 4 KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-extrabold text-slate-500 uppercase">Stock Total</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {stockMap?.grandTotal || 0} bls
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              🏠 {bodegaTotal} Bodega • 🚚 {routesTotal} en Autos
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-extrabold text-slate-500 uppercase">
              Fondo Reinversión Hoy
            </div>
            <div className="text-2xl font-black text-indigo-700 mt-1">
              {formatMoney(todaySummary.totalCost)}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Capital intocable ($12/bolsa)
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-extrabold text-slate-500 uppercase">
              Ganancia Neta Hoy
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {formatMoney(todaySummary.netProfit)}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Bruta {formatMoney(todaySummary.grossProfit)} - {formatMoney(todaySummary.totalExpenses)} gastos
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-extrabold text-slate-500 uppercase">
              Por Cobrar (Fiado)
            </div>
            <div className="text-2xl font-black text-rose-700 mt-1">
              {formatMoney(todaySummary.totalOutstandingDebt)}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Saldo pendiente en calle
            </div>
          </div>
        </div>

        {/* ================= SUBVIEW: INVENTORY ================= */}
        {subView === 'inventory' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  📦 Inventario Multi-Ubicación (Bodega + Autos)
                </h2>
                <p className="text-xs text-slate-500">
                  Calculado en tiempo real desde el libro de movimientos inmutable.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setInvModal('in');
                    setInvQty(1);
                    setInvToLoc('bodega');
                  }}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Entrada Cajas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvModal('transfer');
                    setInvQty(25);
                    setInvFromLoc('bodega');
                    setInvToLoc(activeLocations.find((l) => l.type === 'vehicle')?.id || 'auto-papa');
                  }}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Traspaso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvModal('adjust');
                    setInvQty(-1);
                    setInvFromLoc('bodega');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Ajuste / Merma
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Sabor</th>
                    <th className="py-2 px-2">Precios</th>
                    {activeLocations.map((loc) => (
                      <th key={loc.id} className="py-2 px-2 text-right">
                        {loc.type === 'warehouse' ? '🏠' : '🚚'} {loc.name}
                      </th>
                    ))}
                    <th className="py-2 pl-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeProducts.map((p) => {
                    const total = stockMap?.totalsByProduct?.[p.id] || 0;
                    const bodegaQty = stockMap?.byLocation?.bodega?.[p.id] || 0;
                    const isLow = bodegaQty < (p.min_stock || 0);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{p.emoji}</span>
                            <div>
                              <div className="font-extrabold text-slate-900">{p.name}</div>
                              <div className="text-[11px] font-mono text-slate-500">{p.sku}</div>
                              {isLow && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black">
                                  ⚠️ Bodega baja (Mín: {p.min_stock})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-xs text-slate-600">
                          <div>Costo: ${p.cost_price}</div>
                          <div>Base: ${p.sale_price}</div>
                        </td>
                        {activeLocations.map((loc) => {
                          const q = stockMap?.byLocation?.[loc.id]?.[p.id] || 0;
                          return (
                            <td
                              key={loc.id}
                              className={`py-3 px-2 text-right font-extrabold ${
                                q < 0 ? 'text-rose-600' : 'text-slate-800'
                              }`}
                            >
                              {q}
                            </td>
                          );
                        })}
                        <td className="py-3 pl-2 text-right font-black text-indigo-700 text-base">
                          {total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= SUBVIEW: ORDERS ================= */}
        {subView === 'orders' && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  💬 Cola de Pedidos WhatsApp
                </h2>
                <p className="text-xs text-slate-500">
                  Sincronizado en vivo con Tablet Bodega y Celulares en Ruta.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {['activos', 'entregados', 'todos'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setOrderFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold capitalize ${
                      orderFilter === f
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 font-bold text-sm">
                No hay pedidos en esta vista.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const prio = ORDER_PRIORITY_META[order.priority] || ORDER_PRIORITY_META.media;
                const statusMeta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.nuevo;
                const vehicles = activeLocations.filter((l) => l.type === 'vehicle');

                return (
                  <div
                    key={order.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-xs text-slate-500">
                            {order.folio}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border text-xs font-black ${prio.badge}`}>
                            {prio.emoji} {prio.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${statusMeta.badge}`}>
                            {statusMeta.label}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(order.created_at).toLocaleString('es-MX', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                        <div className="text-base font-black text-slate-900">
                          {order.client_name} • {order.total_bags} bolsas •{' '}
                          <span className="text-emerald-700">{formatMoney(order.total_amount)}</span>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={order.priority}
                          onChange={(e) => {
                            updateOrderPriority(order.id, e.target.value);
                            syncNow();
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                        >
                          {Object.entries(ORDER_PRIORITY_META).map(([k, m]) => (
                            <option key={k} value={k}>
                              {m.emoji} {m.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={order.status}
                          onChange={(e) => {
                            updateOrderStatus(order.id, e.target.value);
                            syncNow();
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                        >
                          {Object.entries(ORDER_STATUS_META).map(([k, m]) => (
                            <option key={k} value={k}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={order.assigned_location_id || ''}
                          onChange={(e) => {
                            updateOrderStatus(order.id, order.status, {
                              assigned_location_id: e.target.value
                            });
                            syncNow();
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                        >
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              🚚 {v.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            openWhatsApp(order.client_phone, formatOrderConfirmation(order))
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-xs inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </button>

                        {order.status !== 'entregado' && (
                          <button
                            type="button"
                            onClick={() => setCheckoutOrder(order)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cobrar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Items */}
                    <div className="flex flex-wrap gap-1.5">
                      {(order.items || []).map((it) => (
                        <span
                          key={it.product_id}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-800"
                        >
                          {it.emoji} {it.qty}x {it.product_name}
                        </span>
                      ))}
                    </div>

                    {order.raw_whatsapp_text && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-950">
                        <strong className="font-bold">Mensaje original:</strong>{' '}
                        {order.raw_whatsapp_text}
                      </div>
                    )}

                    {/* Team Notes */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      {(order.team_notes || []).length > 0 && (
                        <div className="space-y-1">
                          {(order.team_notes || []).map((n) => (
                            <div
                              key={n.id}
                              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex justify-between gap-2"
                            >
                              <span>
                                <strong className="text-indigo-700">{n.author}:</strong> {n.text}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {new Date(n.created_at).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={noteDrafts[order.id] || ''}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                          }
                          placeholder="Escribir nota interna para bodega o ruta..."
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddTeamNote(order.id)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" /> Nota
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ================= SUBVIEW: CLIENTS & FIADO ================= */}
        {subView === 'clients' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  🤝 Directorio de Clientes, Precios y Fiado
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setClientModalState({ open: true, client: null })}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" /> Nuevo Cliente
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o dirección..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyDebtors}
                  onChange={(e) => setOnlyDebtors(e.target.checked)}
                  className="accent-rose-600"
                />
                <span>Solo con saldo pendiente</span>
              </label>
            </div>

            <div className="space-y-2.5">
              {filteredClients.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm font-bold">
                  No se encontraron clientes.
                </div>
              ) : (
                filteredClients.map((c) => {
                  const bal = clientBalances[c.id]?.balance || 0;
                  const riskInfo = clientRiskMap[c.id];
                  return (
                    <div
                      key={c.id}
                      className={`border rounded-2xl p-3.5 space-y-2 ${
                        bal > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-900">{c.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                              ${c.unit_price}/bls
                            </span>
                            {bal > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-black">
                                Debe: {formatMoney(bal)}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                Al corriente
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.phone ? `📞 ${c.phone}` : 'Sin teléfono'}{' '}
                            {c.address ? `• 📍 ${c.address}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {c.maps_url && (
                            <a
                              href={c.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1"
                            >
                              <MapPin className="w-3.5 h-3.5" /> Maps
                            </a>
                          )}
                          {bal > 0 && (
                            <>
                              <button
                                type="button"
                                disabled={riskBusyId === c.id}
                                onClick={() => handleEvaluateClientRisk(c)}
                                className="px-2.5 py-1.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold text-xs inline-flex items-center gap-1"
                              >
                                <Brain className="w-3.5 h-3.5" />{' '}
                                {riskBusyId === c.id ? 'Evaluando...' : '🚦 Semáforo IA'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openWhatsApp(c.phone, formatDebtReminder(c, bal))}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs inline-flex items-center gap-1"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Recordar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentModalClient(c);
                                  setPayAmount(String(bal));
                                }}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs"
                              >
                                💵 Registrar Abono
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setClientModalState({ open: true, client: c })}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                        </div>
                      </div>

                      {riskInfo && (
                        <div
                          className={`rounded-xl px-3 py-2 text-xs font-bold border ${
                            riskInfo.error
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : riskInfo.level === 'bajo'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : riskInfo.level === 'alto'
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : 'bg-amber-50 border-amber-200 text-amber-950'
                          }`}
                        >
                          {riskInfo.error ? riskInfo.error : riskInfo.label}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= SUBVIEW: DAILY CLOSING & EXPENSES ================= */}
        {subView === 'closing' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-black text-slate-900">💵 Corte y Arqueo Diario</h2>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Bolsas vendidas:</span>
                  <strong>{selectedDateSummary.totalBags} pzas</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Venta total del día:</span>
                  <strong>{formatMoney(selectedDateSummary.totalRevenue)}</strong>
                </div>
                <div className="flex justify-between text-indigo-700">
                  <span>Fondo de Reinversión ($12):</span>
                  <strong>{formatMoney(selectedDateSummary.totalCost)}</strong>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Gastos operativos del día:</span>
                  <strong>-{formatMoney(selectedDateSummary.totalExpenses)}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-base text-emerald-700 font-black">
                  <span>Ganancia Neta Real:</span>
                  <span>{formatMoney(selectedDateSummary.netProfit)}</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="text-xs font-extrabold uppercase text-slate-500">
                  Arqueo de Dinero (Ventas + Abonos - Gastos)
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="font-bold text-emerald-900">💵 Efectivo esperado en mano:</span>
                  <strong className="text-emerald-800">
                    {formatMoney(selectedDateSummary.expectedCashInHand)}
                  </strong>
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="font-bold text-blue-900">🏦 Transferencias en banco:</span>
                  <strong className="text-blue-800">
                    {formatMoney(selectedDateSummary.expectedBankTransfers)}
                  </strong>
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="font-bold text-rose-900">📒 Dejado a crédito (fiado hoy):</span>
                  <strong className="text-rose-800">
                    {formatMoney(selectedDateSummary.creditGenerated)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
              <h2 className="text-lg font-black text-slate-900">⛽ Gastos Operativos</h2>

              <form onSubmit={handleAddExpense} className="space-y-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="gasolina">⛽ Gasolina</option>
                    <option value="empaque">📦 Playo / Bolsas</option>
                    <option value="envio">🚚 Envío / Casetas</option>
                    <option value="otro">📝 Otro gasto</option>
                  </select>
                  <select
                    value={expMethod}
                    onChange={(e) => setExpMethod(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="efectivo">💵 Salió de Efectivo</option>
                    <option value="transferencia">🏦 Salió de Banco</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={expConcept}
                    onChange={(e) => setExpConcept(e.target.value)}
                    placeholder="Concepto (ej. Gasolina Auto Papá)"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  />
                  <input
                    type="number"
                    required
                    min="1"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="$"
                    className="w-24 px-3 py-2 rounded-xl border border-slate-300 text-sm font-black bg-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs"
                >
                  ➕ Registrar Gasto
                </button>
              </form>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {dateExpenses.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs font-bold">
                    No hay gastos registrados en esta fecha.
                  </div>
                ) : (
                  dateExpenses.map((e) => (
                    <div
                      key={e.id}
                      className="border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-sm"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{e.concept}</div>
                        <div className="text-[11px] text-slate-500">
                          {e.category} • {e.payment_method} • {e.recorded_by}
                        </div>
                      </div>
                      <strong className="text-rose-700">-{formatMoney(e.amount)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= SUBVIEW: KARDEX / HISTORY ================= */}
        {subView === 'kardex' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKardexMode('movements')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold ${
                    kardexMode === 'movements'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Movimientos ({movements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setKardexMode('sales')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold ${
                    kardexMode === 'sales'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Ventas ({sales.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => exportSalesCSV(sales)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Exportar Ventas CSV
              </button>
            </div>

            {kardexMode === 'movements' ? (
              <div className="space-y-2 max-h-[540px] overflow-y-auto">
                {[...movements]
                  .filter((m) => !m.deleted_at)
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .slice(0, 100)
                  .map((m) => {
                    const p = productById[m.product_id];
                    const l = locationById[m.location_id];
                    return (
                      <div
                        key={m.id}
                        className="border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs sm:text-sm"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {p?.emoji || '🌽'} {p?.name || m.product_id} • {l?.name || m.location_id}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(m.created_at).toLocaleString('es-MX', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}{' '}
                            • {m.note || m.movement_type} • {m.actor_name}
                          </div>
                        </div>
                        <span
                          className={`font-black px-2.5 py-1 rounded-lg ${
                            m.delta > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="space-y-2 max-h-[540px] overflow-y-auto">
                {[...sales]
                  .filter((s) => !s.deleted_at)
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .slice(0, 100)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm"
                    >
                      <div>
                        <div className="font-black text-slate-900">
                          {s.folio} — {s.client_name} ({s.total_bags} bls)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(s.created_at).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}{' '}
                          • {locationById[s.location_id]?.name || s.location_id} • {s.payment_method}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900">
                          {formatMoney(s.total_amount)}
                        </div>
                        {s.credit_amount > 0 && (
                          <div className="text-[11px] font-bold text-rose-600">
                            Fiado: {formatMoney(s.credit_amount)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inventory Action Modal */}
      {invModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <form
            onSubmit={handleInventoryAction}
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-5 space-y-3 shadow-xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              {invModal === 'in'
                ? '📥 Entrada por Cajas'
                : invModal === 'transfer'
                ? '🔄 Traspaso entre Ubicaciones'
                : '⚖️ Ajuste / Merma'}
            </h3>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Sabor</label>
              <select
                value={invProductId}
                onChange={(e) => setInvProductId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white"
              >
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji} {p.name}
                  </option>
                ))}
              </select>
            </div>

            {invModal !== 'in' && (
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase">
                  {invModal === 'transfer' ? 'Origen' : 'Ubicación'}
                </label>
                <select
                  value={invFromLoc}
                  onChange={(e) => setInvFromLoc(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white"
                >
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {invModal !== 'adjust' && (
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase">Destino</label>
                <select
                  value={invToLoc}
                  onChange={(e) => setInvToLoc(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white"
                >
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">
                {invModal === 'in'
                  ? 'Cantidad de Cajas'
                  : invModal === 'transfer'
                  ? 'Cantidad de Bolsas'
                  : 'Delta de Bolsas (negativo resta, positivo suma)'}
              </label>
              <input
                type="number"
                required
                value={invQty}
                onChange={(e) => setInvQty(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-base font-black"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Motivo / Nota</label>
              <input
                type="text"
                value={invReason}
                onChange={(e) => setInvReason(e.target.value)}
                placeholder="Ej. Llegó pedido Estafeta / Bolsa rota"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInvModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-sm"
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Modal (Abono) */}
      {paymentModalClient && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <form
            onSubmit={handleRecordPayment}
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              💵 Abono de {paymentModalClient.name}
            </h3>
            <p className="text-xs text-slate-500">
              Saldo actual: {formatMoney(clientBalances[paymentModalClient.id]?.balance || 0)}
            </p>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Monto recibido ($)</label>
              <input
                type="number"
                required
                min="1"
                step="0.5"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-lg font-black"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Método</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
              >
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">🏦 Transferencia</option>
              </select>
            </div>

            <input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModalClient(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm"
              >
                Guardar Abono
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client Form Modal */}
      {clientModalState.open && (
        <ClientFormModal
          isOpen={clientModalState.open}
          initialClient={clientModalState.client}
          priceTiers={priceTiers}
          onClose={() => setClientModalState({ open: false, client: null })}
        />
      )}

      {/* Checkout Order Modal */}
      {checkoutOrder && (
        <SalePaymentModal
          isOpen={Boolean(checkoutOrder)}
          onClose={() => setCheckoutOrder(null)}
          order={checkoutOrder}
          items={checkoutOrder.items}
          clients={activeClients}
          sales={sales}
          payments={payments}
          locations={activeLocations}
          initialLocationId={checkoutOrder.assigned_location_id || 'auto-papa'}
          priceTiers={priceTiers}
          sellerName={identity.device_name}
        />
      )}
    </div>
  );
}
