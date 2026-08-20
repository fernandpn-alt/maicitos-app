import React, { useState } from 'react';
import { X, Plus, Sparkles, Check } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function RestockModal({ flavors, isOpen, onClose, onRestock }) {
  const [restockAmounts, setRestockAmounts] = useState({});

  if (!isOpen) return null;

  const handleAdjust = (flavorId, delta) => {
    sounds.playSaleClick(1);
    setRestockAmounts(prev => {
      const current = prev[flavorId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [flavorId]: next };
    });
  };

  const totalAdded = Object.values(restockAmounts).reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  const handleSave = () => {
    if (totalAdded === 0) {
      onClose();
      return;
    }
    sounds.playCashChime();
    onRestock(restockAmounts);
    setRestockAmounts({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎒➕</span>
            <div>
              <h3 className="font-extrabold text-white text-base">Reabastecer Mochila</h3>
              <p className="text-xs text-slate-400">Agrega más piezas recibidas en ruta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Flavor List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {flavors.map(flavor => {
            const count = restockAmounts[flavor.id] || 0;
            return (
              <div
                key={flavor.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{flavor.emoji}</span>
                  <div>
                    <span className="font-bold text-white text-sm block">{flavor.name}</span>
                    <span className="text-[11px] text-slate-400">+$12 costo c/u</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleAdjust(flavor.id, -1)}
                    className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm"
                  >
                    -
                  </button>

                  <span className="w-8 text-center font-black text-amber-400 text-sm">
                    {count}
                  </span>

                  <button
                    onClick={() => handleAdjust(flavor.id, 1)}
                    className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-sm"
                  >
                    +
                  </button>

                  <button
                    onClick={() => handleAdjust(flavor.id, 5)}
                    className="px-2 py-1 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    +5
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-slate-400">Total piezas adicionales:</span>
            <span className="font-extrabold text-amber-400 text-sm">+{totalAdded} pzas</span>
          </div>

          <button
            onClick={handleSave}
            disabled={totalAdded === 0}
            className={`w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 ${
              totalAdded === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 shadow-lg shadow-amber-500/20'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Confirmar y Añadir a Mochila</span>
          </button>
        </div>
      </div>
    </div>
  );
}
