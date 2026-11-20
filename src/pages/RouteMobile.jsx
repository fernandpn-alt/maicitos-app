import React, { useMemo, useState } from 'react';
import {
  Truck,
  Zap,
  BookOpen,
  BarChart3,
  MapPin,
  MessageCircle,
  Send,
  CheckCircle2,
  UserPlus,
  Plus,
  Minus,
  AlertTriangle,
  Brain
} from 'lucide-react';
import { ORDER_PRIORITY_META, ORDER_STATUS_META } from '../constants/defaults';
import {
  computeClientBalances,
  computeFinancialSummary,
  getLocalDateKey
} from '../db/ledger';
import {
  addOrderTeamNote,
  recordExpense,
  recordPayment
} from '../db/operations';
import { getDeviceIdentity, setDeviceIdentity } from '../db/dexie';
import { analyzeWhatsAppMessage, evaluateCreditRisk } from '../services/decisionClient';
import { syncNow } from '../services/syncEngine';
import { sounds } from '../utils/audio';
import {
  formatDebtReminder,
  formatMoney,
  formatRouteClosingReport,
  openWhatsApp
} from '../utils/whatsappFormat';
import ClientFormModal from '../components/ClientFormModal';
import SalePaymentModal from '../components/SalePaymentModal';

export default function RouteMobile({
  products = [],
  locations = [],
  clients = [],
  orders = [],
  sales = [],
  payments = [],
  expenses = [],
  stockMap,
  priceTiers
}) {
  const identity = getDeviceIdentity();
  const vehicles = useMemo(
    () => locations.filter((l) => !l.deleted_at && l.active !== false && l.type === 'vehicle'),
    [locations]
  );

  const [selectedVehicleId, setSelectedVehicleId] = useState(
    identity.preferred_location_id || vehicles[0]?.id || 'auto-papa'
  );
  const activeVehicleId = vehicles.some((v) => v.id === selectedVehicleId)
    ? selectedVehicleId
    : vehicles[0]?.id || 'auto-papa';
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) || vehicles[0];

  const [tab, setTab] = useState('deliveries'); // deliveries | sell | fiado | closing

  // Tab 1: Deliveries
  const [showAllVehiclesOrders, setShowAllVehiclesOrders] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [orderAiMap, setOrderAiMap] = useState({});
  const [orderAiBusyId, setOrderAiBusyId] = useState(null);

  // Tab 2: Quick Trunk Sale
  const [saleClientId, setSaleClientId] = useState('');
  const [saleQuantities, setSaleQuantities] = useState({});
  const [showQuickSaleModal, setShowQuickSaleModal] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Tab 3: Fiado
  const [fiadoSearch, setFiadoSearch] = useState('');
  const [paymentClient, setPaymentClient] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');
  const [clientRiskMap, setClientRiskMap] = useState({});
  const [riskBusyId, setRiskBusyId] = useState(null);

  // Tab 4: Closing Expense
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expCategory, setExpCategory] = useState('gasolina');
  const [expConcept, setExpConcept] = useState('');
  const [expAmount, setExpAmount] = useState('');

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => !p.deleted_at && p.active !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );

  const activeClients = useMemo(
    () => clients.filter((c) => !c.deleted_at && c.active !== false),
    [clients]
  );

  const clientById = Object.fromEntries(activeClients.map((c) => [c.id, c]));
  const clientBalances = useMemo(
    () => computeClientBalances(sales, payments),
    [sales, payments]
  );

  const vehicleStock = stockMap?.byLocation?.[activeVehicleId] || {};
  const totalInVehicle = stockMap?.totalsByLocation?.[activeVehicleId] || 0;

  const handleSelectVehicle = async (locId) => {
    setSelectedVehicleId(locId);
    await setDeviceIdentity({ preferred_location_id: locId });
  };

  // Orders for deliveries
  const deliveryOrders = useMemo(() => {
    const statusWeight = { en_auto: 0, armando: 1, nuevo: 2 };
    return orders
      .filter(
        (o) =>
          !o.deleted_at &&
          o.status !== 'entregado' &&
          o.status !== 'cancelado' &&
          (showAllVehiclesOrders || !o.assigned_location_id || o.assigned_location_id === activeVehicleId)
      )
      .sort((a, b) => {
        const sa = statusWeight[a.status] ?? 3;
        const sb = statusWeight[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        const pa = ORDER_PRIORITY_META[a.priority]?.rank ?? 1;
        const pb = ORDER_PRIORITY_META[b.priority]?.rank ?? 1;
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at) - new Date(b.created_at);
      });
  }, [orders, showAllVehiclesOrders, activeVehicleId]);

  const handleAddNote = async (orderId) => {
    const txt = noteDrafts[orderId];
    if (!txt || !txt.trim()) return;
    await addOrderTeamNote(orderId, {
      author: activeVehicle?.driver_name || identity.device_name,
      role: 'ruta',
      text: txt
    });
    setNoteDrafts((prev) => ({ ...prev, [orderId]: '' }));
    syncNow();
  };

  const openClientMaps = (order) => {
    const client = order.client_id ? clientById[order.client_id] : null;
    if (client?.maps_url) {
      window.open(client.maps_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const queryText = client?.address || order.client_name;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  // Quick Trunk Sale Items
  const selectedSaleClient = clientById[saleClientId] || null;
  const quickSaleItems = activeProducts
    .filter((p) => (Number(saleQuantities[p.id]) || 0) > 0)
    .map((p) => ({
      product_id: p.id,
      product_name: p.name,
      emoji: p.emoji,
      qty: Number(saleQuantities[p.id]) || 0,
      unit_price: Number(selectedSaleClient?.unit_price) || Number(p.sale_price) || 20,
      cost_price: Number(p.cost_price) || 12
    }));

  const quickSaleBags = quickSaleItems.reduce((sum, it) => sum + it.qty, 0);
  const quickSaleAmount = quickSaleItems.reduce((sum, it) => sum + it.qty * it.unit_price, 0);

  const adjustSaleQty = (productId, delta) => {
    sounds.playSaleClick(1);
    setSaleQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, (Number(prev[productId]) || 0) + delta)
    }));
  };

  // Fiado List
  const fiadoClients = useMemo(() => {
    const q = fiadoSearch.trim().toLowerCase();
    return activeClients
      .filter((c) => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || String(c.phone || '').includes(q);
      })
      .sort((a, b) => (clientBalances[b.id]?.balance || 0) - (clientBalances[a.id]?.balance || 0));
  }, [activeClients, clientBalances, fiadoSearch]);

  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!paymentClient) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) return;
    await recordPayment({
      client_id: paymentClient.id,
      client_name: paymentClient.name,
      amount: amt,
      method: payMethod,
      note: `Cobro en ruta (${activeVehicle?.name || 'Auto'})`,
      received_by: activeVehicle?.driver_name || identity.device_name
    });
    sounds.playCashChime();
    syncNow();
    setPaymentClient(null);
    setPayAmount('');
  };

  // Daily Closing Summary for active vehicle
  const todayKey = getLocalDateKey();
  const routeSummary = useMemo(
    () =>
      computeFinancialSummary({
        sales,
        payments,
        expenses,
        dateFilter: todayKey,
        locationFilter: activeVehicleId,
        allSales: sales,
        allPayments: payments
      }),
    [sales, payments, expenses, todayKey, activeVehicleId]
  );

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const amt = Number(expAmount) || 0;
    if (!expConcept.trim() || amt <= 0) return;
    await recordExpense({
      category: expCategory,
      concept: expConcept,
      amount: amt,
      payment_method: 'efectivo',
      recorded_by: activeVehicle?.driver_name || identity.device_name
    });
    sounds.playSaleClick(1);
    syncNow();
    setExpConcept('');
    setExpAmount('');
    setShowExpenseForm(false);
  };

  const handleAnalyzeOrder = async (order) => {
    if (!order?.raw_whatsapp_text || orderAiBusyId) return;
    setOrderAiBusyId(order.id);
    try {
      const res = await analyzeWhatsAppMessage(order.raw_whatsapp_text);
      setOrderAiMap((prev) => ({
        ...prev,
        [order.id]: res.ok
          ? res.result
          : { error: res.error || 'No se pudo analizar este mensaje.' }
      }));
      if (res.ok) sounds.playSaleClick(1);
    } finally {
      setOrderAiBusyId(null);
    }
  };

  const handleEvaluateClientRisk = async (client) => {
    if (!client?.id || riskBusyId) return;
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

  return (
    <div className="max-w-lg mx-auto px-3 pt-3 pb-24 space-y-3">
      {/* Top Vehicle Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center justify-between gap-2 flex-wrap shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSelectVehicle(v.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-colors ${
                activeVehicleId === v.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🚚 {v.name}
            </button>
          ))}
        </div>

        <span className="px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-950 text-xs font-black">
          🎒 {totalInVehicle} bls en auto
        </span>
      </div>

      {/* ================= TAB 1: DELIVERIES ================= */}
      {tab === 'deliveries' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-900 text-base">
              Entregas Pendientes ({deliveryOrders.length})
            </h2>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllVehiclesOrders}
                onChange={(e) => setShowAllVehiclesOrders(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>Ver todos los autos</span>
            </label>
          </div>

          {deliveryOrders.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-500 text-sm font-bold">
              No hay entregas pendientes asignadas a este vehículo.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setTab('sell')}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs"
                >
                  ⚡ Hacer Venta Directa del Auto
                </button>
              </div>
            </div>
          ) : (
            deliveryOrders.map((order) => {
              const prio = ORDER_PRIORITY_META[order.priority] || ORDER_PRIORITY_META.media;
              const statusMeta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.nuevo;

              return (
                <div
                  key={order.id}
                  className="bg-white border-2 border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black text-slate-500">
                          {order.folio}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-black ${prio.badge}`}>
                          {prio.emoji} {prio.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusMeta.badge}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 mt-1">
                        {order.client_name}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-emerald-700">
                        {formatMoney(order.total_amount)}
                      </div>
                      <div className="text-xs font-bold text-slate-500">
                        {order.total_bags} bolsas
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(order.items || []).map((it) => (
                      <span
                        key={it.product_id}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-800"
                      >
                        {it.emoji} {it.qty} {it.product_name}
                      </span>
                    ))}
                  </div>

                  {order.raw_whatsapp_text && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-amber-950">
                          <strong>WhatsApp:</strong> {order.raw_whatsapp_text}
                        </div>
                        <button
                          type="button"
                          disabled={orderAiBusyId === order.id}
                          onClick={() => handleAnalyzeOrder(order)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                        >
                          <Brain className="w-3 h-3" />
                          <span>{orderAiBusyId === order.id ? 'IA...' : 'Revisar con IA'}</span>
                        </button>
                      </div>

                      {orderAiMap[order.id] && (
                        orderAiMap[order.id].error ? (
                          <div className="text-[11px] font-bold text-rose-700">
                            {orderAiMap[order.id].error}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 text-[11px] font-bold">
                            <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-900">
                              ✅ {orderAiMap[order.id].intentLabel} ({orderAiMap[order.id].intentConfidencePct}%)
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-rose-200 text-rose-900">
                              {orderAiMap[order.id].urgency === 'urgente' ? '🔥' : '⚡'}{' '}
                              {orderAiMap[order.id].urgencyLabel}
                            </span>
                            {orderAiMap[order.id].mentionsCredit && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-950">
                                📒 Pide fiado
                              </span>
                            )}
                            {orderAiMap[order.id].needsHumanReview && (
                              <span className="px-2 py-0.5 rounded bg-yellow-100 border border-yellow-300 text-yellow-900">
                                👀 Revisar detalles
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {(order.team_notes || []).length > 0 && (
                    <div className="space-y-1">
                      {(order.team_notes || []).map((n) => (
                        <div key={n.id} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          <strong>{n.author}:</strong> {n.text}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={noteDrafts[order.id] || ''}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      placeholder="Nota rápida..."
                      className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddNote(order.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openClientMaps(order)}
                      className="py-2.5 px-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-extrabold text-xs flex items-center justify-center gap-1"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Mapa
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openWhatsApp(order.client_phone, `Hola ${order.client_name}, vamos en camino con tu pedido ${order.folio} de Maicitos 🌽🚚`)
                      }
                      className="py-2.5 px-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-xs flex items-center justify-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Whats
                    </button>

                    <button
                      type="button"
                      onClick={() => setCheckoutOrder(order)}
                      className="py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Entregar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ================= TAB 2: QUICK TRUNK SALE ================= */}
      {tab === 'sell' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-slate-600">
                Cliente de esta venta
              </span>
              <button
                type="button"
                onClick={() => setShowNewClientModal(true)}
                className="text-xs font-extrabold text-amber-700 inline-flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> Nuevo Cliente
              </button>
            </div>
            <select
              value={saleClientId}
              onChange={(e) => setSaleClientId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              <option value="">Público General ($20 base)</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (${c.unit_price}/bls)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5">
            {activeProducts.map((p) => {
              const qty = Number(saleQuantities[p.id]) || 0;
              const stockInAuto = vehicleStock[p.id] || 0;
              const unitPrice = Number(selectedSaleClient?.unit_price) || Number(p.sale_price) || 20;
              const overStock = qty > stockInAuto;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border-2 p-3 space-y-2 ${
                    qty > 0 ? 'bg-amber-50 border-amber-500' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{p.emoji}</span>
                      <div>
                        <div className="font-black text-slate-900 text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500 font-semibold">
                          En auto: <strong className="text-slate-800">{stockInAuto}</strong> • ${unitPrice}/bls
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-black text-amber-700">{qty} bls</div>
                      {qty > 0 && (
                        <div className="text-xs font-bold text-slate-600">
                          {formatMoney(qty * unitPrice)}
                        </div>
                      )}
                    </div>
                  </div>

                  {overStock && (
                    <div className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-lg px-2 py-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Supera el stock registrado en auto ({stockInAuto} bls)</span>
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustSaleQty(p.id, -1)}
                      disabled={qty === 0}
                      className="py-2.5 rounded-xl bg-slate-200 font-black text-sm flex items-center justify-center disabled:opacity-40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustSaleQty(p.id, 1)}
                      className="py-2.5 rounded-xl bg-slate-900 text-white font-black text-sm"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustSaleQty(p.id, 5)}
                      className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-sm"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustSaleQty(p.id, 10)}
                      className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-sm"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustSaleQty(p.id, p.units_per_box || 25)}
                      className="py-2.5 rounded-xl bg-indigo-600 text-white font-black text-sm"
                    >
                      +{p.units_per_box || 25}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {quickSaleBags > 0 && (
            <button
              type="button"
              onClick={() => setShowQuickSaleModal(true)}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg"
            >
              💵 Cobrar Ahora ({quickSaleBags} bls • {formatMoney(quickSaleAmount)})
            </button>
          )}
        </div>
      )}

      {/* ================= TAB 3: FIADO ================= */}
      {tab === 'fiado' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={fiadoSearch}
              onChange={(e) => setFiadoSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
            />
            <button
              type="button"
              onClick={() => setShowNewClientModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Cliente
            </button>
          </div>

          <div className="space-y-2.5">
            {fiadoClients.map((c) => {
              const bal = clientBalances[c.id]?.balance || 0;
              const riskInfo = clientRiskMap[c.id];
              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border-2 p-3.5 space-y-2 ${
                    bal > 0 ? 'bg-rose-50/50 border-rose-300' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-slate-900 text-sm">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        Precio: ${c.unit_price}/bls •{' '}
                        {bal > 0 ? (
                          <strong className="text-rose-700">Debe {formatMoney(bal)}</strong>
                        ) : (
                          <span className="text-emerald-700 font-bold">Sin deuda</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {bal > 0 && (
                        <>
                          <button
                            type="button"
                            disabled={riskBusyId === c.id}
                            onClick={() => handleEvaluateClientRisk(c)}
                            className="px-2.5 py-2 rounded-xl bg-indigo-100 text-indigo-900 font-black text-xs inline-flex items-center gap-1"
                            title="Semáforo de fiado IA"
                          >
                            <Brain className="w-3.5 h-3.5" />
                            <span>{riskBusyId === c.id ? '...' : '🚦 IA'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(c.phone, formatDebtReminder(c, bal))}
                            className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800"
                            title="Recordar por WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentClient(c);
                              setPayAmount(String(bal));
                            }}
                            className="px-3 py-2 rounded-xl bg-rose-600 text-white font-black text-xs"
                          >
                            💵 Abonar
                          </button>
                        </>
                      )}
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
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 4: MI CORTE ================= */}
      {tab === 'closing' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-900 text-base">
                📊 Corte de Hoy — {activeVehicle?.name}
              </h2>
              <span className="text-xs font-bold text-slate-500">{todayKey}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[11px] font-bold text-slate-500 block">Bolsas Vendidas</span>
                <strong className="text-lg font-black text-slate-900">
                  {routeSummary.totalBags}
                </strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[11px] font-bold text-slate-500 block">Venta Total</span>
                <strong className="text-lg font-black text-slate-900">
                  {formatMoney(routeSummary.totalRevenue)}
                </strong>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-[11px] font-bold text-emerald-700 block">
                  Efectivo Esperado
                </span>
                <strong className="text-lg font-black text-emerald-800">
                  {formatMoney(routeSummary.expectedCashInHand)}
                </strong>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5">
                <span className="text-[11px] font-bold text-blue-700 block">Transferencias</span>
                <strong className="text-lg font-black text-blue-800">
                  {formatMoney(routeSummary.expectedBankTransfers)}
                </strong>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span>📒 Dejado a Fiado hoy:</span>
                <strong className="text-rose-700">{formatMoney(routeSummary.creditGenerated)}</strong>
              </div>
              <div className="flex justify-between">
                <span>⛽ Gastos registrados hoy:</span>
                <strong className="text-rose-700">-{formatMoney(routeSummary.totalExpenses)}</strong>
              </div>
              <div className="flex justify-between">
                <span>🏦 Fondo Reinversión ($12):</span>
                <strong className="text-indigo-700">{formatMoney(routeSummary.totalCost)}</strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-sm text-emerald-700">
                <span>✨ Ganancia Neta:</span>
                <span>{formatMoney(routeSummary.netProfit)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowExpenseForm((v) => !v)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs"
            >
              ⛽ {showExpenseForm ? 'Ocultar formulario de gasto' : '+ Registrar Gasto en Ruta (Gasolina / Comida)'}
            </button>

            {showExpenseForm && (
              <form onSubmit={handleSaveExpense} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="gasolina">⛽ Gasolina</option>
                  <option value="envio">🛣️ Casetas / Estacionamiento</option>
                  <option value="otro">📝 Otro gasto</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={expConcept}
                    onChange={(e) => setExpConcept(e.target.value)}
                    placeholder="Concepto"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                  />
                  <input
                    type="number"
                    required
                    min="1"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="$"
                    className="w-20 px-3 py-2 rounded-xl border border-slate-300 text-xs font-black bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-slate-900 text-white font-black text-xs"
                >
                  Guardar Gasto
                </button>
              </form>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="text-xs font-black uppercase text-slate-500">
              🎒 Sobrante actual en {activeVehicle?.name}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activeProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-bold">
                    {p.emoji} {p.short_name}
                  </span>
                  <strong className="font-black text-slate-900">{vehicleStock[p.id] || 0}</strong>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const remainingItems = activeProducts.map((p) => ({
                name: p.name,
                emoji: p.emoji,
                qty: vehicleStock[p.id] || 0
              }));
              openWhatsApp(
                '',
                formatRouteClosingReport(
                  activeVehicle?.name || 'Ruta',
                  routeSummary,
                  remainingItems
                )
              );
            }}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Enviar Corte de Hoy por WhatsApp</span>
          </button>
        </div>
      )}

      {/* Fixed Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5">
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setTab('deliveries')}
            className={`py-2 rounded-xl flex flex-col items-center text-[11px] font-extrabold ${
              tab === 'deliveries' ? 'bg-emerald-600 text-white' : 'text-slate-600'
            }`}
          >
            <Truck className="w-4 h-4 mb-0.5" />
            <span>Entregas ({deliveryOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('sell')}
            className={`py-2 rounded-xl flex flex-col items-center text-[11px] font-extrabold ${
              tab === 'sell' ? 'bg-amber-500 text-slate-950' : 'text-slate-600'
            }`}
          >
            <Zap className="w-4 h-4 mb-0.5" />
            <span>Venta Rápida</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('fiado')}
            className={`py-2 rounded-xl flex flex-col items-center text-[11px] font-extrabold ${
              tab === 'fiado' ? 'bg-rose-600 text-white' : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-4 h-4 mb-0.5" />
            <span>Fiado</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('closing')}
            className={`py-2 rounded-xl flex flex-col items-center text-[11px] font-extrabold ${
              tab === 'closing' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            <BarChart3 className="w-4 h-4 mb-0.5" />
            <span>Mi Corte</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      {checkoutOrder && (
        <SalePaymentModal
          isOpen={Boolean(checkoutOrder)}
          onClose={() => setCheckoutOrder(null)}
          order={checkoutOrder}
          items={checkoutOrder.items}
          clients={activeClients}
          sales={sales}
          payments={payments}
          locations={locations}
          initialLocationId={activeVehicleId}
          priceTiers={priceTiers}
          sellerName={activeVehicle?.driver_name || identity.device_name}
        />
      )}

      {showQuickSaleModal && (
        <SalePaymentModal
          isOpen={showQuickSaleModal}
          onClose={() => setShowQuickSaleModal(false)}
          items={quickSaleItems}
          initialClient={selectedSaleClient}
          clients={activeClients}
          sales={sales}
          payments={payments}
          locations={locations}
          initialLocationId={activeVehicleId}
          priceTiers={priceTiers}
          sellerName={activeVehicle?.driver_name || identity.device_name}
          onCompleted={() => {
            setSaleQuantities({});
          }}
        />
      )}

      {showNewClientModal && (
        <ClientFormModal
          isOpen={showNewClientModal}
          onClose={() => setShowNewClientModal(false)}
          priceTiers={priceTiers}
          onSaved={(saved) => setSaleClientId(saved.id)}
        />
      )}

      {paymentClient && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <form
            onSubmit={handleSavePayment}
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              💵 Abono de {paymentClient.name}
            </h3>
            <p className="text-xs text-slate-500">
              Saldo actual: {formatMoney(clientBalances[paymentClient.id]?.balance || 0)}
            </p>
            <input
              type="number"
              required
              min="1"
              step="0.5"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-lg font-black"
            />
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              <option value="efectivo">💵 Efectivo</option>
              <option value="transferencia">🏦 Transferencia</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentClient(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-sm"
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
