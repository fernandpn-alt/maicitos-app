import React from 'react';
import { ShoppingBag, DollarSign, RotateCcw, Award, Sparkles, TrendingUp } from 'lucide-react';

export default function Header({ currentView, setView, activeShift, totals }) {
  const hasActiveShift = !!activeShift;

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3 py-2.5 sm:px-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        {/* Brand & Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <span className="text-xl">🌽</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1">
                Maicitos <span className="text-amber-400 font-black">en Frío</span>
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Cambaceo
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Compra $12 • Venta $20 • Ganancia $8
            </p>
          </div>
        </div>

        {/* Live Pill Status */}
        {hasActiveShift && (
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-xs font-bold text-emerald-400">
                +${totals.profit} Ganancia
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              🎒 {totals.remainingPieces} pzas en ruta
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <nav className="max-w-lg mx-auto mt-2.5 grid grid-cols-4 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80">
        <button
          onClick={() => setView('inventory')}
          className={`flex flex-col items-center py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
            currentView === 'inventory'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <ShoppingBag className="w-4 h-4 mb-0.5" />
          <span>Mochila</span>
        </button>

        <button
          onClick={() => setView('pos')}
          disabled={!hasActiveShift}
          className={`flex flex-col items-center py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
            currentView === 'pos'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-bold'
              : !hasActiveShift
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <DollarSign className="w-4 h-4 mb-0.5" />
          <span>Vender</span>
        </button>

        <button
          onClick={() => setView('closing')}
          disabled={!hasActiveShift}
          className={`flex flex-col items-center py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
            currentView === 'closing'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-bold'
              : !hasActiveShift
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Award className="w-4 h-4 mb-0.5" />
          <span>Cierre</span>
        </button>

        <button
          onClick={() => setView('history')}
          className={`flex flex-col items-center py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
            currentView === 'history'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <TrendingUp className="w-4 h-4 mb-0.5" />
          <span>Historial</span>
        </button>
      </nav>
    </header>
  );
}
