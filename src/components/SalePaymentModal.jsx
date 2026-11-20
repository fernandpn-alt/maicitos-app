import React, { useMemo, useState } from 'react';
import { X, CheckCircle2, MessageCircle, AlertTriangle, UserPlus, Camera, Brain } from 'lucide-react';
import { completeSale } from '../db/operations';
import { computeClientBalances } from '../db/ledger';
import { evaluateCreditRisk, verifyTransferReceipt } from '../services/decisionClient';
import { syncNow } from '../services/syncEngine';
import { sounds } from '../utils/audio';
import { formatMoney, formatSaleReceipt, openWhatsApp } from '../utils/whatsappFormat';
import ClientFormModal from './ClientFormModal';

export default function SalePaymentModal({
  isOpen,
  onClose,
  order = null,
  items = [],
  initialClient = null,
  clients = [],
  sales = [],
  payments = [],
  locations = [],
  initialLocationId = 'auto-papa',
  priceTiers = { base: 20, vip: 18, medio: 22 },
  sellerName = '',
  onCompleted
}) {
  const [selectedClientId, setSelectedClientId] = useState(
    initialClient?.id || order?.client_id || ''
  );
  const [locationId, setLocationId] = useState(
    order?.assigned_location_id || initialLocationId || 'auto-papa'
  );
  const [payMode, setPayMode] = useState('efectivo'); // efectivo | transferencia | fiado
  const [cashPaid, setCashPaid] = useState(0);
  const [transferPaid, setTransferPaid] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptCheck, setReceiptCheck] = useState(null);
  const [receiptError, setReceiptError] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditEval, setCreditEval] = useState(null);
  const [creditError, setCreditError] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || initialClient || null,
    [clients, selectedClientId, initialClient]
  );

  const totalBags = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0),
    [items]
  );

  const totalAmount = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 20),
        0
      ),
    [items]
  );

  if (!isOpen) return null;

  const numCash = payMode === 'efectivo' ? totalAmount : payMode === 'fiado' ? Number(cashPaid) || 0 : 0;
  const numTransfer =
    payMode === 'transferencia' ? totalAmount : payMode === 'fiado' ? Number(transferPaid) || 0 : 0;
  const creditAmount = Math.max(0, Number((totalAmount - numCash - numTransfer).toFixed(2)));
  const needsClientForCredit = creditAmount > 0 && !selectedClient?.id;

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptBusy(true);
    setReceiptError('');
    setReceiptCheck(null);
    try {
      const expectedAmount = payMode === 'transferencia' ? totalAmount : numTransfer || totalAmount;
      const res = await verifyTransferReceipt({
        file,
        expectedAmount,
        clientName: selectedClient?.name || order?.client_name || 'Cliente'
      });
      if (!res.ok) {
        setReceiptError(res.error || 'No se pudo revisar la imagen.');
      } else {
        setReceiptCheck(res.result);
        sounds.playSaleClick(1);
      }
    } catch (err) {
      setReceiptError(err?.message || 'Error leyendo la imagen.');
    } finally {
      setReceiptBusy(false);
      e.target.value = '';
    }
  };

  const handleCheckCreditRisk = async () => {
    if (!selectedClient?.id || creditBusy) return;
    setCreditBusy(true);
    setCreditError('');
    setCreditEval(null);
    try {
      const balances = computeClientBalances(sales, payments);
      const entry = balances[selectedClient.id] || { totalCredit: 0, totalPaid: 0, balance: 0 };
      const salesCount = sales.filter(
        (s) => !s.deleted_at && s.client_id === selectedClient.id
      ).length;

      const res = await evaluateCreditRisk({
        clientName: selectedClient.name,
        currentBalance: entry.balance,
        totalCredit: entry.totalCredit,
        totalPaid: entry.totalPaid,
        requestedCredit: creditAmount,
        salesCount
      });

      if (!res.ok) {
        setCreditError(res.error || 'No se pudo evaluar el fiado.');
      } else {
        setCreditEval(res.result);
        sounds.playSaleClick(1);
      }
    } finally {
      setCreditBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (totalBags === 0 || needsClientForCredit) return;
    setSaving(true);
    try {
      const resolvedMethod =
        creditAmount > 0
          ? numCash + numTransfer > 0
            ? 'parcial'
            : 'fiado'
          : payMode;

      const sale = await completeSale({
        order_id: order?.id || null,
        client_id: selectedClient?.id || null,
        client_name: selectedClient?.name || order?.client_name || 'Público General',
        location_id: locationId,
        seller_name: sellerName,
        items,
        cash_paid: numCash,
        transfer_paid: numTransfer,
        credit_amount: creditAmount,
        payment_method: resolvedMethod,
        note
      });

      sounds.playCashChime();
      syncNow();
      setCompletedSale(sale);
      if (onCompleted) onCompleted(sale);
    } finally {
      setSaving(false);
    }
  };

  if (completedSale) {
    const balances = computeClientBalances([...sales, completedSale], payments);
    const balanceAfter = selectedClient?.id
      ? balances[selectedClient.id]?.balance || 0
      : completedSale.credit_amount || 0;
    const phone = selectedClient?.phone || order?.client_phone || '';

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
        <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-5 shadow-xl space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900">¡Venta Registrada!</h3>
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              Folio {completedSale.folio} • {completedSale.client_name}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Total ({completedSale.total_bags} bls):</span>
              <strong className="text-slate-900">{formatMoney(completedSale.total_amount)}</strong>
            </div>
            {completedSale.cash_paid > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Efectivo recibido:</span>
                <strong>{formatMoney(completedSale.cash_paid)}</strong>
              </div>
            )}
            {completedSale.transfer_paid > 0 && (
              <div className="flex justify-between text-blue-700">
                <span>Transferencia:</span>
                <strong>{formatMoney(completedSale.transfer_paid)}</strong>
              </div>
            )}
            {completedSale.credit_amount > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>A crédito (fiado):</span>
                <strong>{formatMoney(completedSale.credit_amount)}</strong>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => openWhatsApp(phone, formatSaleReceipt(completedSale, balanceAfter))}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar Nota Digital por WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm"
            >
              Listo / Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              Cobrar {order ? `Pedido ${order.folio}` : 'Venta Rápida'}
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              {totalBags} bolsas • Total {formatMoney(totalAmount)} MXN
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3.5">
          {/* Client + Location */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-600 uppercase">Cliente</label>
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="text-xs font-extrabold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> Nuevo Cliente
              </button>
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              <option value="">
                {order?.client_name ? `${order.client_name} (sin vincular)` : 'Público General'}
              </option>
              {clients
                .filter((c) => !c.deleted_at && c.active !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (${c.unit_price}/bls)
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase">
              Descontar inventario de:
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              {locations
                .filter((l) => !l.deleted_at && l.active !== false)
                .map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.type === 'warehouse' ? '🏠' : '🚚'} {loc.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase block mb-1.5">
              Forma de Pago
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPayMode('efectivo')}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-black ${
                  payMode === 'efectivo'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                💵 Efectivo
              </button>
              <button
                type="button"
                onClick={() => setPayMode('transferencia')}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-black ${
                  payMode === 'transferencia'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                🏦 Transf.
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode('fiado');
                  setCashPaid(0);
                  setTransferPaid(0);
                }}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-black ${
                  payMode === 'fiado'
                    ? 'border-rose-600 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                📒 Fiado / Parcial
              </button>
            </div>
          </div>

          {(payMode === 'transferencia' || (payMode === 'fiado' && numTransfer > 0)) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-blue-950">
                  📸 Revisar foto de transferencia (IA)
                </span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{receiptBusy ? 'Revisando...' : 'Subir / Tomar Foto'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptUpload}
                    disabled={receiptBusy}
                    className="hidden"
                  />
                </label>
              </div>

              {receiptError && (
                <div className="text-xs font-bold text-rose-700">{receiptError}</div>
              )}

              {receiptCheck && (
                <div className="bg-white border border-blue-200 rounded-xl p-2.5 space-y-1 text-xs font-bold">
                  <div>
                    {receiptCheck.isBankReceipt ? '✅' : '⚠️'} Comprobante bancario (
                    {receiptCheck.isBankReceiptPct}%)
                  </div>
                  <div>
                    {receiptCheck.amountMatches ? '✅' : '⚠️'} Monto coincide (
                    {receiptCheck.amountMatchesPct}%)
                  </div>
                  <div>
                    {receiptCheck.looksCompleted ? '✅' : '⚠️'} Transferencia completada (
                    {receiptCheck.looksCompletedPct}%)
                  </div>
                </div>
              )}
            </div>
          )}

          {payMode === 'fiado' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600">
                    Abona en Efectivo ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={totalAmount}
                    value={cashPaid}
                    onChange={(e) => {
                      setCashPaid(e.target.value);
                      setCreditEval(null);
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600">
                    Abona Transferencia ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={totalAmount}
                    value={transferPaid}
                    onChange={(e) => {
                      setTransferPaid(e.target.value);
                      setCreditEval(null);
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm">
                <span className="font-bold text-slate-700">Queda a Fiado (deuda):</span>
                <strong className="text-rose-700 text-base">{formatMoney(creditAmount)}</strong>
              </div>

              {selectedClient?.id && creditAmount > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={creditBusy}
                    onClick={handleCheckCreditRisk}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-black text-xs flex items-center justify-center gap-1.5"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    <span>{creditBusy ? 'Evaluando...' : '🚦 Revisar semáforo de fiado (IA)'}</span>
                  </button>

                  {creditError && (
                    <div className="text-xs font-bold text-rose-700">{creditError}</div>
                  )}

                  {creditEval && (
                    <div
                      className={`rounded-xl border p-2.5 text-xs font-bold ${
                        creditEval.level === 'bajo'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : creditEval.level === 'alto'
                          ? 'bg-rose-50 border-rose-300 text-rose-900'
                          : 'bg-amber-50 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div>{creditEval.label}</div>
                      {creditEval.suggestPartialPayment && (
                        <div className="text-[11px] mt-0.5 font-semibold">
                          Sugerencia: pedir un abono parcial hoy si es posible.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {needsClientForCredit && (
                <div className="bg-rose-100 border border-rose-300 text-rose-900 rounded-xl p-2.5 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Para dejar saldo fiado debes elegir o crear un cliente arriba.</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Pagó con billete de $500, etc."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            disabled={saving || totalBags === 0 || needsClientForCredit}
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>
              {saving
                ? 'Guardando...'
                : `Confirmar Venta (${formatMoney(totalAmount)})`}
            </span>
          </button>
        </div>
      </div>

      {showNewClient && (
        <ClientFormModal
          isOpen={showNewClient}
          onClose={() => setShowNewClient(false)}
          priceTiers={priceTiers}
          onSaved={(saved) => setSelectedClientId(saved.id)}
        />
      )}
    </div>
  );
}
