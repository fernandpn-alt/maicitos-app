import React, { useState } from 'react';
import { Plus, Minus, Backpack, Sparkles, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function InventorySetup({ flavors, activeShift, onStartShift, onUpdateInitialStock }) {
  // If active shift already exists, initialize with its inventory, otherwise start with standard default (e.g. 10 of each or 0)
  const [stockCounts, setStockCounts] = useState(() => {
    if (activeShift && activeShift.initialInventory) {
      return activeShift.initialInventory;
    }
    const initial = {};
    flavors.forEach(f => {
      initial[f.id] = 10; // Default suggested starting quantity 10 of each
    });
    return initial;
  });

  const totalPieces = Object.values(stockCounts).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  const totalCost = totalPieces * 12; // Inversión a devolver: $12 por pieza
  const totalRevenue = totalPieces * 20; // Venta proyectada: $20 por pieza
  const totalProfit = totalPieces * 8; // Ganancia proyectada: $8 por pieza

  const handleAdjust = (flavorId, delta) => {
    sounds.playSaleClick(1);
    setStockCounts(prev => {
      const current = prev[flavorId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [flavorId]: next };
    });
  };

  const handleSetExact = (flavorId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setStockCounts(prev => ({ ...prev, [flavorId]: num }));
  };

  const handlePreset = (qtyPerFlavor) => {
    sounds.playCashChime();
    const updated = {};
    flavors.forEach(f => {
      updated[f.id] = qtyPerFlavor;
    });
    setStockCounts(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (totalPieces === 0) {
      alert('Debes ingresar al menos 1 pieza en tu mochila para iniciar la ruta.');
      return;
    }
    sounds.playCashChime();
    onStartShift(stockCounts);
  };

  return (
    <div className="max-w-lg mx-auto pb-24 px-3 pt-3">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600/20 via-yellow-600/20 to-amber-600/20 border border-amber-500/30 rounded-2xl p-4 mb-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shadow-inner">
            🎒
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
              Carga de Mochila <span className="text-xs text-amber-300 font-semibold px-2 py-0.5 bg-amber-500/20 rounded-full border border-amber-500/30">Inicio de Día</span>
            </h2>
            <p className="text-xs text-slate-300">
              Indica cuántas piezas de cada sabor llevas hoy en tu mochila.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mt-3.5 pt-3 border-t border-amber-500/20 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-amber-300/80 font-medium whitespace-nowrap">Llenado rápido:</span>
          <button
            type="button"
            onClick={() => handlePreset(10)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 whitespace-nowrap active:scale-95 transition-transform"
          >
            10 c/u (60 pzas)
          </button>
          <button
            type="button"
            onClick={() => handlePreset(15)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 whitespace-nowrap active:scale-95 transition-transform"
          >
            15 c/u (90 pzas)
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap active:scale-95 transition-transform"
          >
            Poner en 0
          </button>
        </div>
      </div>

      {/* Flavor Inventory Cards */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2.5">
          {flavors.map((flavor) => {
            const count = stockCounts[flavor.id] || 0;
            return (
              <div
                key={flavor.id}
                className={`rounded-2xl border p-3 transition-all ${flavor.cardBg} backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-center text-2xl shadow-sm">
                      {flavor.emoji}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm sm:text-base leading-tight">
                        {flavor.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">
                          Compra: <b className="text-slate-300">$12</b>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Venta: <b className="text-amber-400">$20</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 shadow-inner">
                    <button
                      type="button"
                      onClick={() => handleAdjust(flavor.id, -1)}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white flex items-center justify-center font-bold text-base transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <input
                      type="number"
                      min="0"
                      value={count}
                      onChange={(e) => handleSetExact(flavor.id, e.target.value)}
                      className="w-12 text-center bg-transparent text-white font-extrabold text-base focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => handleAdjust(flavor.id, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 flex items-center justify-center font-bold text-base transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Add pills */}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <div className="text-slate-400">
                    Subtotal: <span className="font-semibold text-slate-200">{count} pzas (${count * 20})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAdjust(flavor.id, 5)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-slate-200 font-semibold transition-colors"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjust(flavor.id, 10)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-slate-200 font-semibold transition-colors"
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Projected Financial Summary */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl mt-4">
          <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Resumen Proyectado de la Mochila
          </h4>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
              <span className="text-[11px] text-slate-400 block font-medium">Total Mochila</span>
              <span className="text-base font-extrabold text-white">{totalPieces} pzas</span>
            </div>

            <div className="bg-slate-950/70 border border-amber-500/20 rounded-xl p-2.5">
              <span className="text-[11px] text-amber-400/90 block font-medium">Venta Potencial</span>
              <span className="text-base font-extrabold text-amber-400">${totalRevenue}</span>
            </div>

            <div className="bg-slate-950/70 border border-rose-500/20 rounded-xl p-2.5">
              <span className="text-[11px] text-rose-300 block font-medium">Inversión a Devolver</span>
              <span className="text-base font-extrabold text-rose-400">${totalCost}</span>
            </div>

            <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-2.5 bg-emerald-950/20">
              <span className="text-[11px] text-emerald-300 block font-medium">Ganancia Proyectada</span>
              <span className="text-base font-extrabold text-emerald-400">+${totalProfit}</span>
            </div>
          </div>
        </div>

        {/* Start / Update Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={totalPieces === 0}
            className={`w-full py-4 px-6 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-xl transition-all ${
              totalPieces === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-[0.98] text-slate-950 shadow-amber-500/20 font-black cursor-pointer'
            }`}
          >
            <span>{activeShift ? '💾 Actualizar Inventario en Ruta' : '🚀 Salir a Vender / Comenzar Ruta'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
