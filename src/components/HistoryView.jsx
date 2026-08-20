import React, { useState } from 'react';
import { Calendar, TrendingUp, DollarSign, ChevronDown, ChevronUp, Trash2, Award, ShoppingBag, Sparkles } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function HistoryView({ history, onClearHistory }) {
  const [expandedId, setExpandedId] = useState(null);

  const totalShifts = history.length;
  const cumulativeRevenue = history.reduce((acc, curr) => acc + (curr.grandRevenue || 0), 0);
  const cumulativeCost = history.reduce((acc, curr) => acc + (curr.grandCost || 0), 0);
  const cumulativeProfit = history.reduce((acc, curr) => acc + (curr.grandProfit || 0), 0);
  const cumulativePieces = history.reduce((acc, curr) => acc + (curr.totalSold || 0), 0);

  const toggleExpand = (id) => {
    sounds.playSaleClick(1);
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleClear = () => {
    if (window.confirm('¿Estás seguro de que deseas borrar todo el historial?')) {
      onClearHistory();
    }
  };

  return (
    <div className="max-w-lg mx-auto pb-28 px-3 pt-3">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 mb-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
              📈
            </div>
            <div>
              <h2 className="font-extrabold text-white text-base">Historial de Ganancias</h2>
              <p className="text-xs text-slate-400">{totalShifts} jornadas registradas</p>
            </div>
          </div>

          {totalShifts > 0 && (
            <button
              onClick={handleClear}
              className="text-slate-500 hover:text-rose-400 p-2 rounded-xl hover:bg-slate-800 transition-colors"
              title="Borrar historial"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Cumulative Stats */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-800">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Venta Total</span>
            <span className="text-sm font-extrabold text-white block mt-0.5">${cumulativeRevenue}</span>
          </div>

          <div className="bg-slate-950/70 border border-rose-500/20 rounded-xl p-2">
            <span className="text-[10px] text-rose-300 uppercase font-bold block">Devuelto</span>
            <span className="text-sm font-extrabold text-rose-400 block mt-0.5">${cumulativeCost}</span>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2">
            <span className="text-[10px] text-emerald-300 uppercase font-bold block">Ganancia Acumulada</span>
            <span className="text-sm font-black text-emerald-400 block mt-0.5">+${cumulativeProfit}</span>
          </div>
        </div>
      </div>

      {/* History List */}
      {history.length === 0 ? (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h4 className="font-bold text-slate-300 text-sm">No hay jornadas cerradas aún</h4>
          <p className="text-xs text-slate-500 mt-1">
            Cuando finalices tu primer día de venta, aparecerá aquí el resumen histórico.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((shift) => {
            const isExpanded = expandedId === shift.id;
            return (
              <div
                key={shift.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-md transition-all"
              >
                {/* Shift Summary Header */}
                <div
                  onClick={() => toggleExpand(shift.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-extrabold text-sm">
                      +${shift.grandProfit}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm capitalize leading-tight">
                        {shift.dateStr}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {shift.totalSold} pzas vendidas • Venta ${shift.grandRevenue} • Dev ${shift.grandCost}
                      </p>
                    </div>
                  </div>

                  <div className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded Breakdown */}
                {isExpanded && (
                  <div className="p-3.5 bg-slate-950/90 border-t border-slate-800/80 space-y-2 text-xs">
                    <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3 text-amber-400" />
                      Desglose de sabores vendidos:
                    </div>

                    <div className="space-y-1.5">
                      {shift.breakdown?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-900/60 border border-slate-800/60 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{item.emoji}</span>
                            <span className="font-medium text-slate-200">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-amber-400">{item.sold} pzas (${item.revenue})</span>
                            <span className="text-slate-500 text-[10px] ml-1.5">
                              (Gan: <b className="text-emerald-400">+${item.profit}</b>)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
