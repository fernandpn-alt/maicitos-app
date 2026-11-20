import React, { useMemo, useState } from 'react';
import {
  PackagePlus,
  PackageCheck,
  Truck,
  History,
  Undo2,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  Camera
} from 'lucide-react';
import {
  ORDER_PRIORITY_META,
  ORDER_STATUS_META,
  getColorTheme
} from '../constants/defaults';
import { getLocalDateKey, isSameLocalDay } from '../db/ledger';
import {
  recordStockAdjustment,
  recordStockIn,
  recordTransfer,
  updateOrderPacking,
  updateOrderStatus
} from '../db/operations';
import { getDeviceIdentity } from '../db/dexie';
import { inspectDamagePhoto } from '../services/decisionClient';
import { syncNow } from '../services/syncEngine';
import { sounds } from '../utils/audio';

export default function TabletWarehouse({
  products = [],
  locations = [],
  orders = [],
  movements = [],
  stockMap
}) {
  const identity = getDeviceIdentity();
  const [tab, setTab] = useState('in'); // in | pack | vehicles | today

  // Tab 1: Stock In (Boxes)
  const [pendingBoxes, setPendingBoxes] = useState({});
  const [undoStack, setUndoStack] = useState([]);
  const [inToast, setInToast] = useState('');

  // Tab 2: Packing Order
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [targetVehicleId, setTargetVehicleId] = useState('');
  const [transferOnClose, setTransferOnClose] = useState(true);

  // Tab 3: Vehicles & Mermas
  const vehicles = useMemo(
    () => locations.filter((l) => !l.deleted_at && l.active !== false && l.type === 'vehicle'),
    [locations]
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id || 'auto-papa');
  const [transferDirection, setTransferDirection] = useState('to_vehicle'); // to_vehicle | to_warehouse
  const [transferDraft, setTransferDraft] = useState({});
  const [transferToast, setTransferToast] = useState('');
  const [damageProductId, setDamageProductId] = useState('fuego');
  const [damageBusy, setDamageBusy] = useState(false);
  const [damageResult, setDamageResult] = useState(null);
  const [damageError, setDamageError] = useState('');

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => !p.deleted_at && p.active !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [products]
  );

  const warehouseStock = stockMap?.byLocation?.bodega || {};
  const activeVehicleId = vehicles.some((v) => v.id === selectedVehicleId)
    ? selectedVehicleId
    : vehicles[0]?.id || 'auto-papa';
  const vehicleStock = stockMap?.byLocation?.[activeVehicleId] || {};

  // Pending Orders sorted by priority
  const pendingOrders = useMemo(() => {
    return orders
      .filter((o) => !o.deleted_at && (o.status === 'nuevo' || o.status === 'armando'))
      .sort((a, b) => {
        const ra = ORDER_PRIORITY_META[a.priority]?.rank ?? 1;
        const rb = ORDER_PRIORITY_META[b.priority]?.rank ?? 1;
        if (ra !== rb) return ra - rb;
        return new Date(a.created_at) - new Date(b.created_at);
      });
  }, [orders]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId) || null,
    [orders, activeOrderId]
  );

  const todayKey = getLocalDateKey();
  const todayMovements = useMemo(
    () =>
      movements
        .filter((m) => !m.deleted_at && isSameLocalDay(m.created_at, todayKey))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements, todayKey]
  );

  // --- Handlers: Tab 1 (Stock In) ---
  const totalPendingBoxes = Object.values(pendingBoxes).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0
  );

  const totalPendingBags = activeProducts.reduce(
    (sum, p) => sum + (Number(pendingBoxes[p.id]) || 0) * (Number(p.units_per_box) || 25),
    0
  );

  const handleAdjustBox = (productId, delta) => {
    sounds.playSaleClick(1);
    setPendingBoxes((prev) => {
      const next = Math.max(0, (Number(prev[productId]) || 0) + delta);
      return { ...prev, [productId]: next };
    });
    if (delta > 0) {
      setUndoStack((prev) => [...prev, productId]);
    }
  };

  const handleUndoBox = () => {
    if (undoStack.length === 0) return;
    sounds.playUndo();
    const lastId = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setPendingBoxes((prev) => ({
      ...prev,
      [lastId]: Math.max(0, (Number(prev[lastId]) || 0) - 1)
    }));
  };

  const handleConfirmStockIn = async () => {
    if (totalPendingBoxes === 0) return;
    const items = activeProducts
      .filter((p) => (Number(pendingBoxes[p.id]) || 0) > 0)
      .map((p) => ({
        product_id: p.id,
        boxes: Number(pendingBoxes[p.id]) || 0,
        units_per_box: p.units_per_box || 25
      }));

    await recordStockIn({
      items,
      location_id: 'bodega',
      actor_name: identity.device_name,
      note: 'Entrada rápida Tablet Bodega'
    });

    sounds.playCashChime();
    syncNow();
    setPendingBoxes({});
    setUndoStack([]);
    setInToast(`✅ Sumadas +${totalPendingBoxes} cajas (+${totalPendingBags} bolsas) a Bodega`);
    setTimeout(() => setInToast(''), 3500);
  };

  // --- Handlers: Tab 2 (Packing) ---
  const handleSelectOrderToPack = async (order) => {
    sounds.playSaleClick(1);
    setActiveOrderId(order.id);
    setTargetVehicleId(order.assigned_location_id || vehicles[0]?.id || 'auto-papa');
    setTransferOnClose(true);
    if (order.status === 'nuevo') {
      await updateOrderStatus(order.id, 'armando');
      syncNow();
    }
  };

  const handlePackItemDelta = async (productId, delta, fillAll = false) => {
    if (!activeOrder) return;
    sounds.playSaleClick(1);
    const updatedItems = (activeOrder.items || []).map((it) => {
      if (it.product_id !== productId) return it;
      const current = Number(it.packed_qty) || 0;
      const target = Number(it.qty) || 0;
      const next = fillAll ? target : Math.max(0, Math.min(target, current + delta));
      return { ...it, packed_qty: next };
    });
    await updateOrderPacking(activeOrder.id, updatedItems);
    syncNow();
  };

  const handleClosePacking = async () => {
    if (!activeOrder) return;
    const destVehicle = targetVehicleId || vehicles[0]?.id || 'auto-papa';

    if (transferOnClose) {
      const transferItems = (activeOrder.items || []).map((it) => ({
        product_id: it.product_id,
        qty: (Number(it.packed_qty) || 0) > 0 ? Number(it.packed_qty) : Number(it.qty) || 0
      }));
      await recordTransfer({
        items: transferItems,
        from_location_id: 'bodega',
        to_location_id: destVehicle,
        actor_name: identity.device_name,
        note: `Empaque pedido ${activeOrder.folio} (${activeOrder.client_name})`
      });
    }

    await updateOrderStatus(activeOrder.id, 'en_auto', {
      assigned_location_id: destVehicle
    });
    sounds.playCashChime();
    syncNow();
    setActiveOrderId(null);
  };

  // --- Handlers: Tab 3 (Vehicle Transfer & Merma) ---
  const adjustTransferDraft = (productId, delta) => {
    sounds.playSaleClick(1);
    setTransferDraft((prev) => ({
      ...prev,
      [productId]: Math.max(0, (Number(prev[productId]) || 0) + delta)
    }));
  };

  const totalTransferBags = Object.values(transferDraft).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0
  );

  const handleConfirmTransfer = async () => {
    if (totalTransferBags === 0) return;
    const items = Object.entries(transferDraft)
      .filter(([, qty]) => (Number(qty) || 0) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: Number(qty) }));

    const fromLoc = transferDirection === 'to_vehicle' ? 'bodega' : activeVehicleId;
    const toLoc = transferDirection === 'to_vehicle' ? activeVehicleId : 'bodega';

    await recordTransfer({
      items,
      from_location_id: fromLoc,
      to_location_id: toLoc,
      actor_name: identity.device_name
    });

    sounds.playCashChime();
    syncNow();
    setTransferDraft({});
    setTransferToast(
      `✅ Traspaso registrado: ${totalTransferBags} bolsas (${
        transferDirection === 'to_vehicle' ? 'Bodega → Auto' : 'Auto → Bodega'
      })`
    );
    setTimeout(() => setTransferToast(''), 3500);
  };

  const handleQuickMerma = async (product, customReason = '') => {
    sounds.playUndo();
    await recordStockAdjustment({
      product_id: product.id,
      location_id: 'bodega',
      delta: -1,
      reason: customReason || `Bolsa rota / muestra (${product.name})`,
      movement_type: 'merma',
      actor_name: identity.device_name
    });
    syncNow();
    setTransferToast(`💔 -1 bolsa de ${product.name} registrada como merma/muestra`);
    setTimeout(() => setTransferToast(''), 3000);
  };

  const handleDamagePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDamageBusy(true);
    setDamageError('');
    setDamageResult(null);
    try {
      const prod = activeProducts.find((p) => p.id === damageProductId) || activeProducts[0];
      const res = await inspectDamagePhoto({
        file,
        productName: prod?.name || 'Maicitos en Frío'
      });
      if (!res.ok) {
        setDamageError(res.error || 'No se pudo revisar la foto.');
      } else {
        setDamageResult({ ...res.result, product: prod });
        sounds.playSaleClick(1);
      }
    } catch (err) {
      setDamageError(err?.message || 'Error al procesar la foto.');
    } finally {
      setDamageBusy(false);
      e.target.value = '';
    }
  };

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locationById = Object.fromEntries(locations.map((l) => [l.id, l]));

  return (
    <div className="max-w-6xl mx-auto px-3 py-3 pb-12">
      {/* Top 4 Giant Touch Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => setTab('in')}
          className={`p-3.5 rounded-2xl border-2 font-black text-left flex items-center gap-3 ${
            tab === 'in'
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-slate-800 border-slate-300'
          }`}
        >
          <PackagePlus className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-sm sm:text-base leading-tight">1. Entradas</div>
            <div className={`text-xs ${tab === 'in' ? 'text-blue-100' : 'text-slate-500'}`}>
              Cajas a Bodega
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTab('pack')}
          className={`p-3.5 rounded-2xl border-2 font-black text-left flex items-center justify-between gap-2 ${
            tab === 'pack'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-white text-slate-800 border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <PackageCheck className="w-7 h-7 shrink-0" />
            <div>
              <div className="text-sm sm:text-base leading-tight">2. Empaque</div>
              <div className={`text-xs ${tab === 'pack' ? 'text-rose-100' : 'text-slate-500'}`}>
                Pedidos WhatsApp
              </div>
            </div>
          </div>
          {pendingOrders.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black">
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab('vehicles')}
          className={`p-3.5 rounded-2xl border-2 font-black text-left flex items-center gap-3 ${
            tab === 'vehicles'
              ? 'bg-indigo-600 text-white border-indigo-700'
              : 'bg-white text-slate-800 border-slate-300'
          }`}
        >
          <Truck className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-sm sm:text-base leading-tight">3. Cargar Auto</div>
            <div className={`text-xs ${tab === 'vehicles' ? 'text-indigo-100' : 'text-slate-500'}`}>
              Subir / Bajar + Merma
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTab('today')}
          className={`p-3.5 rounded-2xl border-2 font-black text-left flex items-center gap-3 ${
            tab === 'today'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-800 border-slate-300'
          }`}
        >
          <History className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-sm sm:text-base leading-tight">4. Hoy</div>
            <div className={`text-xs ${tab === 'today' ? 'text-slate-300' : 'text-slate-500'}`}>
              {todayMovements.length} movs
            </div>
          </div>
        </button>
      </div>

      {/* ================= TAB 1: STOCK IN (BOXES) ================= */}
      {tab === 'in' && (
        <div className="space-y-4">
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                📥 Descargar Cajas a Bodega
              </h2>
              <p className="text-sm text-slate-600">
                Toca cada sabor conforme bajan cajas del envío. Cada toque suma 1 caja.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleUndoBox}
                disabled={undoStack.length === 0}
                className="px-4 py-3 rounded-xl bg-amber-100 border-2 border-amber-300 text-amber-950 font-black text-sm flex items-center gap-1.5 disabled:opacity-40"
              >
                <Undo2 className="w-4 h-4" />
                <span>Deshacer</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmStockIn}
                disabled={totalPendingBoxes === 0}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base flex items-center gap-2 disabled:opacity-40"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  Confirmar ({totalPendingBoxes} cjs / {totalPendingBags} bls)
                </span>
              </button>
            </div>
          </div>

          {inToast && (
            <div className="bg-emerald-100 border-2 border-emerald-500 text-emerald-950 rounded-2xl p-3.5 font-black text-base">
              {inToast}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activeProducts.map((p) => {
              const boxes = Number(pendingBoxes[p.id]) || 0;
              const currentBodega = warehouseStock[p.id] || 0;
              const theme = getColorTheme(p.color);
              const perBox = p.units_per_box || 25;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border-2 p-4 flex flex-col justify-between gap-3 ${
                    boxes > 0 ? 'bg-blue-50 border-blue-600' : 'bg-white border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{p.emoji}</span>
                      <div>
                        <div className="text-lg font-black text-slate-900">{p.name}</div>
                        <div className="text-xs font-bold text-slate-600">
                          En Bodega: <strong className="text-slate-900">{currentBodega} bls</strong>
                        </div>
                        {currentBodega < (p.min_stock || 0) && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black">
                            <AlertTriangle className="w-3 h-3" /> Stock bajo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-700">+{boxes} cjs</div>
                      <div className="text-xs font-bold text-slate-500">+{boxes * perBox} bls</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdjustBox(p.id, 1)}
                      className={`flex-1 py-4 px-3 rounded-xl font-black text-lg ${theme.button}`}
                    >
                      +1 CAJA ({perBox} bls)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustBox(p.id, -1)}
                      disabled={boxes === 0}
                      className="px-4 py-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-lg disabled:opacity-40"
                    >
                      -1
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 2: ORDER PACKING ================= */}
      {tab === 'pack' && (
        <div className="space-y-4">
          {!activeOrder ? (
            <>
              <div className="bg-white border-2 border-slate-300 rounded-2xl p-4">
                <h2 className="text-xl font-black text-slate-900">
                  📦 Pedidos Pendientes por Armar ({pendingOrders.length})
                </h2>
                <p className="text-sm text-slate-600">
                  Toca cualquier pedido para abrir la pantalla gigante de conteo y subirlo al auto.
                </p>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 font-bold">
                  🎉 No hay pedidos pendientes por armar en bodega.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingOrders.map((order) => {
                    const prio = ORDER_PRIORITY_META[order.priority] || ORDER_PRIORITY_META.media;
                    const statusMeta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.nuevo;
                    const assignedLoc = locationById[order.assigned_location_id];

                    return (
                      <div
                        key={order.id}
                        className="bg-white border-2 border-slate-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-slate-500">
                              {order.folio}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border text-xs font-black ${prio.badge}`}>
                              {prio.emoji} {prio.label}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${statusMeta.badge}`}>
                              {statusMeta.label}
                            </span>
                            {assignedLoc && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700">
                                🚚 {assignedLoc.name}
                              </span>
                            )}
                          </div>

                          <div className="text-lg font-black text-slate-900">
                            {order.client_name} — {order.total_bags} bolsas
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-sm font-bold text-slate-700">
                            {(order.items || []).map((it) => (
                              <span
                                key={it.product_id}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200"
                              >
                                {it.emoji} {it.qty} {it.product_name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectOrderToPack(order)}
                          className="px-6 py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-base shrink-0"
                        >
                          ✋ Armar Pedido
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => setActiveOrderId(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-black text-slate-600 hover:text-slate-900 mb-1"
                  >
                    <ArrowLeft className="w-4 h-4" /> Volver a lista de pedidos
                  </button>
                  <h2 className="text-xl font-black text-slate-900">
                    Armando {activeOrder.folio}: {activeOrder.client_name}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Meta total: <strong>{activeOrder.total_bags} bolsas</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {(activeOrder.items || []).map((it) => {
                  const packed = Number(it.packed_qty) || 0;
                  const target = Number(it.qty) || 0;
                  const done = packed >= target && target > 0;
                  const inWarehouse = warehouseStock[it.product_id] || 0;

                  return (
                    <div
                      key={it.product_id}
                      className={`rounded-2xl border-2 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                        done
                          ? 'bg-emerald-50 border-emerald-600'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{it.emoji}</span>
                          <div>
                            <div className="text-lg font-black text-slate-900">
                              {it.product_name} {done ? '✅' : ''}
                            </div>
                            <div className="text-xs font-bold text-slate-600">
                              En Bodega: {inWarehouse} bls
                            </div>
                          </div>
                        </div>

                        <div
                          className={`text-2xl font-black lg:hidden ${
                            done ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {packed} / {target}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div
                          className={`hidden lg:block text-2xl font-black mr-3 ${
                            done ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {packed} / {target}
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, -1)}
                          className="px-4 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 font-black text-base"
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, 1)}
                          className="px-4 py-3 rounded-xl bg-slate-900 text-white font-black text-base"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, 5)}
                          className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-black text-base"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, 10)}
                          className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-black text-base"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, 25)}
                          className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-black text-base"
                        >
                          +25
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePackItemDelta(it.product_id, 0, true)}
                          className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-black text-base"
                        >
                          ✓ Llenar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-slate-600 block mb-1">
                      Subir al vehículo:
                    </label>
                    <select
                      value={targetVehicleId}
                      onChange={(e) => setTargetVehicleId(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border-2 border-slate-300 text-base font-black bg-white"
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          🚚 {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={transferOnClose}
                      onChange={(e) => setTransferOnClose(e.target.checked)}
                      className="w-5 h-5 accent-emerald-600"
                    />
                    <span className="text-sm font-bold text-slate-800">
                      Descontar stock de Bodega y cargarlo al Auto automáticamente
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleClosePacking}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg"
                >
                  ✅ Cerrar Empaque y Subir a Auto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: VEHICLES & MERMAS ================= */}
      {tab === 'vehicles' && (
        <div className="space-y-4">
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  🚚 Subir a Auto / Bajar Sobrante
                </h2>
                <p className="text-sm text-slate-600">
                  Mantiene cuadrado lo que hay en Bodega vs. lo que va arriba del carro.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`px-4 py-2.5 rounded-xl border-2 font-black text-sm ${
                      activeVehicleId === v.id
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-slate-50 text-slate-800 border-slate-300'
                    }`}
                  >
                    🚚 {v.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTransferDirection('to_vehicle')}
                className={`py-3 px-3 rounded-xl border-2 font-black text-sm ${
                  transferDirection === 'to_vehicle'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                📤 Subir al Auto (Bodega → Auto)
              </button>
              <button
                type="button"
                onClick={() => setTransferDirection('to_warehouse')}
                className={`py-3 px-3 rounded-xl border-2 font-black text-sm ${
                  transferDirection === 'to_warehouse'
                    ? 'bg-amber-500 text-slate-950 border-amber-600'
                    : 'bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                📥 Bajar Sobrante (Auto → Bodega)
              </button>
            </div>
          </div>

          {transferToast && (
            <div className="bg-emerald-100 border-2 border-emerald-500 text-emerald-950 rounded-2xl p-3.5 font-black text-sm">
              {transferToast}
            </div>
          )}

          <div className="space-y-2.5">
            {activeProducts.map((p) => {
              const qty = Number(transferDraft[p.id]) || 0;
              const inBodega = warehouseStock[p.id] || 0;
              const inAuto = vehicleStock[p.id] || 0;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border-2 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    qty > 0 ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{p.emoji}</span>
                    <div>
                      <div className="text-base font-black text-slate-900">{p.name}</div>
                      <div className="text-xs font-bold text-slate-600">
                        Bodega: <strong className="text-slate-900">{inBodega}</strong> • En{' '}
                        {locationById[activeVehicleId]?.name || 'Auto'}:{' '}
                        <strong className="text-indigo-700">{inAuto}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => adjustTransferDraft(p.id, -5)}
                      disabled={qty === 0}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-200 font-black text-sm disabled:opacity-40"
                    >
                      -5
                    </button>
                    <span className="w-12 text-center text-xl font-black text-indigo-700">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustTransferDraft(p.id, 5)}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-sm"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustTransferDraft(p.id, 10)}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-sm"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustTransferDraft(p.id, p.units_per_box || 25)}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-black text-sm"
                    >
                      +{p.units_per_box || 25}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={totalTransferBags === 0}
            onClick={handleConfirmTransfer}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg disabled:opacity-40"
          >
            ✅ Confirmar Traspaso ({totalTransferBags} bolsas)
          </button>

          {/* Quick Merma / Degustación + AI Photo Inspector */}
          <div className="bg-white border-2 border-rose-200 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-rose-900">
              💔 Registro rápido de Merma o Muestra Gratis en Bodega (-1 bolsa)
            </div>
            <div className="flex flex-wrap gap-2">
              {activeProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleQuickMerma(p)}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs sm:text-sm"
                >
                  {p.emoji} -1 {p.short_name}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-rose-100 space-y-2.5">
              <div className="text-sm font-black text-slate-900">
                📸 Revisar foto de caja o bolsa dañada (IA)
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={damageProductId}
                  onChange={(e) => setDamageProductId(e.target.value)}
                  className="px-3 py-3 rounded-xl border-2 border-slate-300 text-sm font-black bg-white"
                >
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
                </select>
                <label className="cursor-pointer flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" />
                  <span>{damageBusy ? 'Analizando foto...' : 'Tomar / Subir Foto de Daño'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleDamagePhotoUpload}
                    disabled={damageBusy}
                    className="hidden"
                  />
                </label>
              </div>

              {damageError && (
                <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl p-3 text-xs font-bold">
                  {damageError}
                </div>
              )}

              {damageResult && (
                <div className="bg-slate-50 border-2 border-indigo-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-sm">
                    <div className="font-black text-slate-900">
                      {damageResult.causeLabel} ({damageResult.confidencePct}%)
                    </div>
                    <div className="text-xs font-bold text-slate-600">
                      {damageResult.claimableCarrier
                        ? '💡 Conviene guardar foto para reclamo a paquetería (Estafeta).'
                        : 'Merma interna o sin reclamo de envío.'}
                    </div>
                  </div>

                  {damageResult.cause !== 'sin_dano' && damageResult.product && (
                    <button
                      type="button"
                      onClick={() => {
                        handleQuickMerma(
                          damageResult.product,
                          damageResult.cause === 'paqueteria'
                            ? `Daño en envío paquetería (${damageResult.product.name})`
                            : `Bolsa rota (${damageResult.product.name})`
                        );
                        setDamageResult(null);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shrink-0"
                    >
                      Registrar -1 Merma ({damageResult.product.short_name})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: TODAY MOVEMENTS ================= */}
      {tab === 'today' && (
        <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 space-y-3">
          <h2 className="text-xl font-black text-slate-900">
            🕒 Movimientos de Hoy en Bodega y Autos ({todayMovements.length})
          </h2>

          {todayMovements.length === 0 ? (
            <div className="text-center py-8 text-slate-500 font-bold">
              Aún no hay movimientos registrados hoy.
            </div>
          ) : (
            <div className="space-y-2">
              {todayMovements.map((m) => {
                const prod = productById[m.product_id];
                const loc = locationById[m.location_id];
                const isPositive = m.delta > 0;
                const timeStr = new Date(m.created_at).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={m.id}
                    className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0">{prod?.emoji || '🌽'}</span>
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm text-slate-900 truncate">
                          {prod?.name || m.product_id} • {loc?.name || m.location_id}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {timeStr} • {m.actor_name || 'Equipo'} • {m.note || m.movement_type}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-lg font-black text-sm shrink-0 ${
                        isPositive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isPositive ? `+${m.delta}` : m.delta} bls
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
