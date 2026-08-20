import React, { useState } from 'react';
import { RotateCcw, PlusCircle, CheckCircle2, AlertTriangle, TrendingUp, Sparkles, ChevronRight, Zap } from 'lucide-react';
import { sounds } from '../utils/audio';

export default function SalesPOS({
  flavors,
  activeShift,
  onRegisterSale,
  onUndoLastSale,
  onOpenRestock,
  onGoToClosing
}) {
  const [recentToast, setRecentToast] = useState(null);
  const [activeButtonKey, setActiveButtonKey] = useState(null);

  const inventory = activeShift?.currentInventory || {};
  const salesHistory = activeShift?.salesHistory || [];
  const flavorSales = activeShift?.flavorSales || {};

  // Calculate live KPIs
  const totalPiecesSold = Object.values(flavorSales).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  const totalRevenue = totalPiecesSold * 20; // Venta a $20
  const totalCost = totalPiecesSold * 12; // Devolver a $12
  const totalProfit = totalPiecesSold * 8; // Ganancia a $8
  const remainingPieces = Object.values(inventory).reduce((acc, curr) => acc + (Number(curr) || 0), 0);

  const handleSaleClick = (flavor, qty) => {
    sounds.playSaleClick(qty);
    const btnKey = `${flavor.id}-${qty}`;
    setActiveButtonKey(btnKey);
    setTimeout(() => setActiveButtonKey(null), 200);

    onRegisterSale(flavor.id, qty);

    // Show temporary toast
    const toastMsg = `-${qty} ${flavor.shortName} (+$${qty * 20})`;
    setRecentToast({ message: toastMsg, flavorName: flavor.name, qty, emoji: flavor.emoji });
    setTimeout(() => setRecentToast(null), 2500);
  };

  const handleUndo = () => {
    if (salesHistory.length === 0) return;
    sounds.playUndo();
    const lastSale = salesHistory[salesHistory.length - 1];
    const flavor = flavors.find(f => f.id === lastSale.flavorId);
    onUndoLastSale();

    setRecentToast({
      message: `↩️ Deshecho: +${lastSale.qty} ${flavor ? flavor.shortName : ''}`,
      isUndo: true
    });
    setTimeout(() => setRecentToast(null), 2500);
  };

  return (
    <div className="max-w-lg mx-auto pb-28 px-3 pt-2">
      {/* Sticky Live Metrics Card */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md sticky top-[108px] z-30 mb-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          {/* Total Venta */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Caja Total</span>
            <span className="text-sm sm:text-base font-extrabold text-white leading-none mt-1 block">
              ${totalRevenue}
            </span>
          </div>

          {/* Dinero a Devolver */}
          <div className="bg-slate-950/80 border border-rose-500/20 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-rose-300 block tracking-wider">A Devolver</span>
            <span className="text-sm sm:text-base font-extrabold text-rose-400 leading-none mt-1 block">
              ${totalCost}
            </span>
          </div>

          {/* Ganancia Neta */}
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-2 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block tracking-wider">Ganancia</span>
            <span className="text-sm sm:text-base font-black text-emerald-400 leading-none mt-1 block">
              +${totalProfit}
            </span>
          </div>

          {/* Mochila Restante */}
          <div className="bg-slate-950/80 border border-amber-500/20 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-amber-300 block tracking-wider">En Mochila</span>
            <span className="text-sm sm:text-base font-extrabold text-amber-400 leading-none mt-1 block">
              {remainingPieces} <span className="text-[10px] font-normal text-slate-400">pzas</span>
            </span>
          </div>
        </div>

        {/* Quick action bar */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={handleUndo}
            disabled={salesHistory.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              salesHistory.length === 0
                ? 'opacity-40 bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 shadow-sm'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Deshacer ({salesHistory.length})</span>
          </button>

          <button
            onClick={onOpenRestock}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/30 text-amber-300 border border-amber-500/30 shadow-sm transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Reabastecer</span>
          </button>

          <button
            onClick={onGoToClosing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white shadow-sm transition-all"
          >
            <span>Cierre</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {recentToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className={`px-4 py-2 rounded-2xl shadow-2xl border flex items-center gap-2 font-bold text-sm backdrop-blur-md ${
            recentToast.isUndo
              ? 'bg-slate-900 text-amber-300 border-amber-500/50'
              : 'bg-emerald-950 text-emerald-200 border-emerald-400/60 shadow-emerald-900/50'
          }`}>
            <span className="text-base">{recentToast.emoji || '✨'}</span>
            <span>{recentToast.message}</span>
          </div>
        </div>
      )}

      {/* Flavor Cards List */}
      <div className="space-y-3">
        {flavors.map((flavor) => {
          const currentStock = inventory[flavor.id] || 0;
          const soldCount = flavorSales[flavor.id] || 0;
          const isOutOfStock = currentStock <= 0;

          // Rule: buttons -1, -2, -3, -4, -5, -6 ONLY if flavor has that stock available
          const availableQuantities = [1, 2, 3, 4, 5, 6].filter(qty => qty <= currentStock);

          return (
            <div
              key={flavor.id}
              className={`rounded-2xl border p-3.5 transition-all shadow-md backdrop-blur-sm ${flavor.cardBg} ${
                isOutOfStock ? 'opacity-65 grayscale-[20%]' : ''
              }`}
            >
              {/* Flavor Card Header */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-center text-2xl shadow-inner">
                    {flavor.emoji}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight flex items-center gap-1.5">
                      {flavor.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-medium">
                      <span>Vendidos: <b className="text-slate-200">{soldCount} pzas</b> (${soldCount * 20})</span>
                    </div>
                  </div>
                </div>

                {/* Stock Badge */}
                <div className="text-right">
                  {isOutOfStock ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      AGOTADO
                    </span>
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border ${flavor.badgeBg}`}>
                      {currentStock} en mochila
                    </span>
                  )}
                </div>
              </div>

              {/* Fast Sale Buttons Grid: -1, -2, -3, -4, -5, -6 */}
              {isOutOfStock ? (
                <div className="py-3 px-2 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-center">
                  <p className="text-xs text-slate-400 font-medium">
                    No quedan piezas de este sabor.
                  </p>
                  <button
                    onClick={onOpenRestock}
                    className="mt-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-3 h-3" /> Reabastecer {flavor.shortName}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between px-0.5">
                    <span>Toque rápido para registrar venta:</span>
                    <span className="text-slate-300">$20 / pieza</span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {availableQuantities.map((qty) => {
                      const btnKey = `${flavor.id}-${qty}`;
                      const isPressed = activeButtonKey === btnKey;
                      const saleAmount = qty * 20;

                      return (
                        <button
                          key={qty}
                          onClick={() => handleSaleClick(flavor, qty)}
                          className={`py-2.5 px-1 rounded-xl font-black transition-all flex flex-col items-center justify-center shadow-lg active:scale-90 select-none ${flavor.btnBg} ${
                            isPressed ? 'scale-90 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                          }`}
                        >
                          <span className="text-base sm:text-lg leading-tight tracking-tight">
                            -{qty}
                          </span>
                          <span className="text-[10px] font-extrabold opacity-90 leading-tight">
                            ${saleAmount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
