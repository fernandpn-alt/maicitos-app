import React, { useState } from 'react';
import { X, Save, MapPin, Phone, User } from 'lucide-react';
import { PRICE_TIER_OPTIONS } from '../constants/defaults';
import { upsertClient } from '../db/operations';
import { syncNow } from '../services/syncEngine';

export default function ClientFormModal({
  isOpen,
  onClose,
  initialClient = null,
  priceTiers = { base: 20, vip: 18, medio: 22 },
  onSaved
}) {
  const [name, setName] = useState(initialClient?.name || '');
  const [phone, setPhone] = useState(initialClient?.phone || '');
  const [priceTier, setPriceTier] = useState(initialClient?.price_tier || 'base');
  const [unitPrice, setUnitPrice] = useState(
    initialClient?.unit_price || priceTiers[initialClient?.price_tier || 'base'] || 20
  );
  const [address, setAddress] = useState(initialClient?.address || '');
  const [mapsUrl, setMapsUrl] = useState(initialClient?.maps_url || '');
  const [cycleDays, setCycleDays] = useState(initialClient?.cycle_days || 7);
  const [notes, setNotes] = useState(initialClient?.notes || '');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleTierChange = (tier) => {
    setPriceTier(tier);
    if (tier !== 'custom' && priceTiers[tier]) {
      setUnitPrice(priceTiers[tier]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const saved = await upsertClient({
        id: initialClient?.id,
        name,
        phone,
        price_tier: priceTier,
        unit_price: Number(unitPrice) || 20,
        address,
        maps_url: mapsUrl,
        cycle_days: Number(cycleDays) || 7,
        notes
      });
      syncNow();
      if (onSaved) onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 font-black text-slate-900 text-base">
            <User className="w-5 h-5 text-amber-600" />
            <span>{initialClient ? 'Editar Cliente' : 'Nuevo Cliente'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3">
          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase">
              Nombre / Tienda *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Tienda Don Pepe"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-extrabold text-slate-600 uppercase flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> WhatsApp (10 díg.)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5512345678"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-extrabold text-slate-600 uppercase">
                Ciclo surtido (días)
              </label>
              <input
                type="number"
                min="1"
                value={cycleDays}
                onChange={(e) => setCycleDays(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-extrabold text-slate-600 uppercase">
                Nivel de Precio
              </label>
              <select
                value={priceTier}
                onChange={(e) => handleTierChange(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {PRICE_TIER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} (${priceTiers[opt.id] ?? opt.defaultPrice})
                  </option>
                ))}
                <option value="custom">Precio Especial</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold text-slate-600 uppercase">
                Precio por bolsa ($)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={unitPrice}
                onChange={(e) => {
                  setUnitPrice(e.target.value);
                  setPriceTier('custom');
                }}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-black text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase">
              Dirección / Referencia
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Principal #123, frente a la escuela"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Link Google Maps (opcional)
            </label>
            <input
              type="url"
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-600 uppercase">
              Notas del cliente
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Horario preferido, quién recibe..."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Cliente'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
