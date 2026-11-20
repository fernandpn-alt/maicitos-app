import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Sparkles, CheckCircle2, MessageCircle, UserPlus, AlertCircle, Plus, Minus, Brain } from 'lucide-react';
import { ORDER_PRIORITY_META } from '../constants/defaults';
import { createOrder } from '../db/operations';
import { analyzeWhatsAppMessage } from '../services/decisionClient';
import { syncNow } from '../services/syncEngine';
import { sounds } from '../utils/audio';
import { parseWhatsAppOrderText } from '../utils/whatsappParser';
import { formatMoney, formatOrderConfirmation, openWhatsApp } from '../utils/whatsappFormat';
import ClientFormModal from './ClientFormModal';

export default function QuickOrderEditor({
  initialRawText = '',
  products = [],
  clients = [],
  locations = [],
  priceTiers = { base: 20, vip: 18, medio: 22 },
  onDone
}) {
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

  const vehicles = useMemo(
    () => locations.filter((l) => !l.deleted_at && l.active !== false && l.type === 'vehicle'),
    [locations]
  );

  const [rawText, setRawText] = useState(initialRawText);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [customClientName, setCustomClientName] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [priority, setPriority] = useState('media');
  const [assignedLocationId, setAssignedLocationId] = useState(vehicles[0]?.id || 'auto-papa');
  const [quantities, setQuantities] = useState({});
  const [teamNote, setTeamNote] = useState('');
  const [parseFeedback, setParseFeedback] = useState(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOrder, setSavedOrder] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState('');

  const applyParsedText = (textToParse) => {
    const parsed = parseWhatsAppOrderText(textToParse, activeProducts, activeClients);
    const nextQty = {};
    for (const item of parsed.items) {
      nextQty[item.product_id] = item.qty;
    }
    if (parsed.items.length > 0) {
      setQuantities(nextQty);
    }
    if (parsed.matchedClient) {
      setSelectedClientId(parsed.matchedClient.id);
      setCustomClientName(parsed.matchedClient.name);
      setCustomPhone(parsed.matchedClient.phone || '');
    }
    setPriority(parsed.priority);
    setParseFeedback(parsed);
  };

  useEffect(() => {
    if (initialRawText && initialRawText.trim()) {
      setRawText(initialRawText);
      applyParsedText(initialRawText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRawText]);

  const selectedClient = activeClients.find((c) => c.id === selectedClientId) || null;
  const effectiveUnitPrice = selectedClient?.unit_price || null;

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim()) {
        setRawText(clip);
        applyParsedText(clip);
        sounds.playSaleClick(1);
      } else {
        setParseFeedback({
          items: [],
          totalBags: 0,
          unmatchedLines: ['El portapapeles está vacío. Pega el mensaje manualmente abajo.']
        });
      }
    } catch {
      setParseFeedback({
        items: [],
        totalBags: 0,
        unmatchedLines: ['Mantén presionado el cuadro de texto y selecciona "Pegar".']
      });
    }
  };

  const adjustQty = (productId, delta) => {
    sounds.playSaleClick(1);
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, (Number(prev[productId]) || 0) + delta)
    }));
  };

  const orderItems = activeProducts
    .filter((p) => (Number(quantities[p.id]) || 0) > 0)
    .map((p) => ({
      product_id: p.id,
      product_name: p.name,
      emoji: p.emoji,
      qty: Number(quantities[p.id]) || 0,
      packed_qty: 0,
      unit_price: Number(effectiveUnitPrice) || Number(p.sale_price) || 20
    }));

  const totalBags = orderItems.reduce((sum, it) => sum + it.qty, 0);
  const totalAmount = orderItems.reduce((sum, it) => sum + it.qty * it.unit_price, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (totalBags === 0) return;
    setSaving(true);
    try {
      const clientName = selectedClient?.name || customClientName.trim() || 'Cliente WhatsApp';
      const clientPhone = selectedClient?.phone || customPhone.trim();

      const created = await createOrder({
        client_id: selectedClient?.id || null,
        client_name: clientName,
        client_phone: clientPhone,
        priority,
        status: 'nuevo',
        assigned_location_id: assignedLocationId,
        items: orderItems,
        raw_whatsapp_text: rawText,
        initial_note: teamNote
      });

      sounds.playCashChime();
      syncNow();
      setSavedOrder(created);
    } finally {
      setSaving(false);
    }
  };

  const handleResetForAnother = () => {
    setSavedOrder(null);
    setRawText('');
    setQuantities({});
    setTeamNote('');
    setParseFeedback(null);
    setAiAnalysis(null);
    setAiError('');
    setSelectedClientId('');
    setCustomClientName('');
    setCustomPhone('');
  };

  const handleAnalyzeWithAi = async () => {
    if (!rawText.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    try {
      const res = await analyzeWhatsAppMessage(rawText);
      if (!res.ok) {
        setAiError(res.error || 'No se pudo analizar el mensaje.');
        setAiAnalysis(null);
      } else {
        setAiAnalysis(res.result);
        if (res.result?.urgency && (res.result?.urgencyConfidencePct ?? 0) >= 70) {
          setPriority(res.result.urgency);
        }
        sounds.playSaleClick(1);
      }
    } finally {
      setAiBusy(false);
    }
  };

  if (savedOrder) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900">¡Pedido Guardado y Sincronizado!</h3>
          <p className="text-sm text-slate-600 mt-1">
            <strong>{savedOrder.folio}</strong> • {savedOrder.client_name} • {savedOrder.total_bags} bolsas ({formatMoney(savedOrder.total_amount)})
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1 text-sm">
          {savedOrder.items.map((it) => (
            <div key={it.product_id} className="flex justify-between">
              <span>
                {it.emoji} {it.product_name}
              </span>
              <strong>{it.qty} bls</strong>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => openWhatsApp(savedOrder.client_phone, formatOrderConfirmation(savedOrder))}
            className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Confirmar por WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleResetForAnother}
            className="py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm"
          >
            ➕ Capturar Otro Pedido
          </button>
        </div>

        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
          >
            Cerrar / Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Paste & Parse Block */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-black uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>1. Pega el mensaje de WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs shadow-sm"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>📋 Pegar y Armar Solo</span>
            </button>
            <button
              type="button"
              disabled={!rawText.trim() || aiBusy}
              onClick={handleAnalyzeWithAi}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs shadow-sm disabled:opacity-40"
            >
              <Brain className="w-4 h-4" />
              <span>{aiBusy ? 'Analizando...' : '🧠 Analizar con IA'}</span>
            </button>
          </div>
        </div>

        <textarea
          rows={3}
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            setAiAnalysis(null);
            setAiError('');
            applyParsedText(e.target.value);
          }}
          placeholder="Ej: Hola, mándame 50 fuego, 30 salsas negras y 20 limón urgente para Don Pepe..."
          className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        {aiError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-xs font-bold">
            {aiError}
          </div>
        )}

        {aiAnalysis && (
          <div className="bg-white border border-indigo-200 rounded-xl p-2.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200">
              ✅ {aiAnalysis.intentLabel} ({aiAnalysis.intentConfidencePct}%)
            </span>
            <span
              className={`px-2 py-1 rounded-lg border ${
                aiAnalysis.urgency === 'urgente'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-slate-50 text-slate-800 border-slate-200'
              }`}
            >
              {aiAnalysis.urgency === 'urgente' ? '🔥' : '⚡'} {aiAnalysis.urgencyLabel} (
              {aiAnalysis.urgencyConfidencePct}%)
            </span>
            {aiAnalysis.mentionsCredit && (
              <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300">
                📒 Menciona fiado / pagar después
              </span>
            )}
            {aiAnalysis.needsHumanReview && (
              <span className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-900 border border-yellow-300">
                👀 Revisar cantidades manualmente
              </span>
            )}
          </div>
        )}

        {parseFeedback && (rawText.trim().length > 0 || parseFeedback.unmatchedLines?.length > 0) && (
          <div className="text-xs space-y-1">
            {parseFeedback.totalBags > 0 && (
              <div className="text-emerald-800 font-bold">
                ✓ Detectadas {parseFeedback.totalBags} bolsas en {parseFeedback.items.length} sabores
                {parseFeedback.matchedClient ? ` • Cliente: ${parseFeedback.matchedClient.name}` : ''}
              </div>
            )}
            {parseFeedback.unmatchedLines?.length > 0 && (
              <div className="text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Revisa: {parseFeedback.unmatchedLines.join(' | ')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Client, Priority & Vehicle */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase text-slate-600">2. Cliente y Prioridad</span>
          <button
            type="button"
            onClick={() => setShowNewClientModal(true)}
            className="text-xs font-extrabold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" /> + Nuevo Cliente
          </button>
        </div>

        <select
          value={selectedClientId}
          onChange={(e) => {
            const cid = e.target.value;
            setSelectedClientId(cid);
            const found = activeClients.find((c) => c.id === cid);
            if (found) {
              setCustomClientName(found.name);
              setCustomPhone(found.phone || '');
            }
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
        >
          <option value="">-- Seleccionar cliente o escribir nombre abajo --</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (${c.unit_price}/bls)
            </option>
          ))}
        </select>

        {!selectedClientId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={customClientName}
              onChange={(e) => setCustomClientName(e.target.value)}
              placeholder="Nombre de tienda o cliente"
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            />
            <input
              type="tel"
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="WhatsApp (opcional)"
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              {Object.entries(ORDER_PRIORITY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.emoji} {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Asignar a Auto</label>
            <select
              value={assignedLocationId}
              onChange={(e) => setAssignedLocationId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  🚚 {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Flavor Touch Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase text-slate-600">
            3. Sabores ({totalBags} bolsas • {formatMoney(totalAmount)})
          </span>
          {effectiveUnitPrice && (
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              Precio cliente: ${effectiveUnitPrice}/bls
            </span>
          )}
        </div>

        <div className="space-y-2">
          {activeProducts.map((p) => {
            const qty = Number(quantities[p.id]) || 0;
            const price = Number(effectiveUnitPrice) || Number(p.sale_price) || 20;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  qty > 0 ? 'border-amber-400 bg-amber-50/70' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between sm:justify-start gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.emoji}</span>
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">{p.name}</div>
                      <div className="text-[11px] text-slate-500">
                        ${price}/bls • {qty * price > 0 ? formatMoney(qty * price) : '0 bls'}
                      </div>
                    </div>
                  </div>
                  <div className="text-lg font-black text-amber-700 sm:hidden">{qty}</div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, -5)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, -1)}
                    className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-black flex items-center justify-center"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={qty}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0)
                      }))
                    }
                    className="w-12 text-center font-black text-sm py-1 rounded-lg border border-slate-300 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, 1)}
                    className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, 5)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-xs"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, 10)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-xs"
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustQty(p.id, p.units_per_box || 25)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-extrabold text-xs"
                  >
                    +{p.units_per_box || 25} caja
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <input
          type="text"
          value={teamNote}
          onChange={(e) => setTeamNote(e.target.value)}
          placeholder="Nota interna para bodega/ruta (opcional: ej. entregar antes de 3pm)"
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={saving || totalBags === 0}
        className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-black text-base shadow-md disabled:opacity-40"
      >
        {saving
          ? 'Guardando pedido...'
          : `🚀 Guardar Pedido (${totalBags} bolsas • ${formatMoney(totalAmount)})`}
      </button>

      {showNewClientModal && (
        <ClientFormModal
          isOpen={showNewClientModal}
          onClose={() => setShowNewClientModal(false)}
          priceTiers={priceTiers}
          onSaved={(saved) => {
            setSelectedClientId(saved.id);
            setCustomClientName(saved.name);
            setCustomPhone(saved.phone || '');
          }}
        />
      )}
    </form>
  );
}
