import React, { useState } from 'react';
import { DollarSign, ArrowLeft, Share2, Copy, Check, Save, Sparkles, TrendingUp, AlertCircle, ShoppingBag } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audio';

export default function DailyClosing({
  flavors,
  activeShift,
  onFinishAndSaveShift,
  onBackToPOS
}) {
  const [copied, setCopied] = useState(false);

  const initialInventory = activeShift?.initialInventory || {};
  const currentInventory = activeShift?.currentInventory || {};
  const flavorSales = activeShift?.flavorSales || {};
  const restocked = activeShift?.restocked || {};
  const startTime = activeShift?.startTime ? new Date(activeShift.startTime) : new Date();
  const dateStr = startTime.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Calculate totals
  let totalInitial = 0;
  let totalSold = 0;
  let totalRemaining = 0;
  let totalRestocked = 0;

  const breakdown = flavors.map((flavor) => {
    const initial = initialInventory[flavor.id] || 0;
    const added = restocked[flavor.id] || 0;
    const sold = flavorSales[flavor.id] || 0;
    const remaining = currentInventory[flavor.id] || 0;

    totalInitial += initial;
    totalRestocked += added;
    totalSold += sold;
    totalRemaining += remaining;

    const revenue = sold * 20;
    const cost = sold * 12;
    const profit = sold * 8;

    return {
      ...flavor,
      initial,
      added,
      sold,
      remaining,
      revenue,
      cost,
      profit
    };
  });

  const grandRevenue = totalSold * 20; // $20 por pieza
  const grandCost = totalSold * 12; // $12 por pieza a devolver
  const grandProfit = totalSold * 8; // $8 por pieza ganancia

  // Trigger celebration confetti on mount
  React.useEffect(() => {
    sounds.playCashChime();
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // ignore
    }
  }, []);

  const generateReportText = () => {
    const lines = [
      `🌽 *LIQUIDACIÓN Y CIERRE DE CAMBACEO*`,
      `📅 Fecha: ${dateStr}`,
      `⏰ Hora: ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
      `----------------------------------------`,
      `💰 *RESUMEN FINANCIERO:*`,
      `💵 *Total en Caja Recaudado:* $${grandRevenue}.00`,
      `🔄 *Dinero a Devolver (Inversión $12/pza):* $${grandCost}.00`,
      `✨ *Mi Ganancia Neta ($8/pza):* $${grandProfit}.00`,
      `----------------------------------------`,
      `🎒 *BALANCE DE PIEZAS:*`,
      `• Total Vendidas: ${totalSold} pzas`,
      `• Sobrantes en Mochila: ${totalRemaining} pzas`,
      `• Total Cargadas: ${totalInitial + totalRestocked} pzas`,
      `----------------------------------------`,
      `📋 *DESGLOSE POR SABOR:*`
    ];

    breakdown.forEach((item) => {
      lines.push(
        `${item.emoji} *${item.name}:* ${item.sold} vendidas | ${item.remaining} sobrantes → $${item.revenue} ($${item.cost} devolver / +$${item.profit} ganancia)`
      );
    });

    lines.push(`----------------------------------------`);
    lines.push(`🚀 Reporte generado con Maicitos App`);
    return lines.join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateReportText());
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateReportText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      alert('Reporte copiado al portapapeles');
    }
  };

  const handleFinalize = () => {
    if (window.confirm('¿Deseas finalizar y guardar este corte en el historial? Se cerrará la jornada de hoy.')) {
      const closingData = {
        id: `shift_${Date.now()}`,
        date: new Date().toISOString(),
        dateStr,
        totalSold,
        totalRemaining,
        totalInitial: totalInitial + totalRestocked,
        grandRevenue,
        grandCost,
        grandProfit,
        breakdown
      };
      onFinishAndSaveShift(closingData);
    }
  };

  return (
    <div className="max-w-lg mx-auto pb-28 px-3 pt-3">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBackToPOS}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a Ventas</span>
        </button>

        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full">
          🏁 Cierre de Jornada
        </span>
      </div>

      {/* Main Financial Highlights */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/30 rounded-3xl p-5 shadow-2xl relative overflow-hidden mb-4">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="text-center mb-4">
          <span className="text-xs uppercase font-extrabold text-amber-400 tracking-wider inline-flex items-center gap-1 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            Liquidación del Día
          </span>
          <p className="text-xs text-slate-400 mt-1 capitalize">{dateStr}</p>
        </div>

        {/* Big Profit Hero */}
        <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-2xl p-4 text-center shadow-lg shadow-emerald-950/50 mb-3">
          <span className="text-xs uppercase font-extrabold text-emerald-300 tracking-wider block">
            💰 Tu Ganancia Neta Limpia
          </span>
          <span className="text-3xl sm:text-4xl font-black text-emerald-400 block mt-1">
            +${grandProfit}.00
          </span>
          <span className="text-[11px] text-emerald-200/80 font-medium">
            Libre en tu bolsillo (${grandProfit} por {totalSold} piezas vendidas)
          </span>
        </div>

        {/* Cash vs Refund split */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              💵 Total en Caja
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-white block mt-0.5">
              ${grandRevenue}.00
            </span>
            <span className="text-[10px] text-slate-500 block">Total recaudado</span>
          </div>

          <div className="bg-slate-950/80 border border-rose-500/30 rounded-2xl p-3 text-center">
            <span className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block">
              🔄 A Devolver
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-rose-400 block mt-0.5">
              ${grandCost}.00
            </span>
            <span className="text-[10px] text-rose-400/70 block">Inversión ($12/pza)</span>
          </div>
        </div>

        {/* Pieces Count */}
        <div className="mt-3 bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-around text-center text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Vendidas</span>
            <span className="font-extrabold text-amber-400 text-sm">{totalSold} pzas</span>
          </div>
          <div className="h-6 w-px bg-slate-800"></div>
          <div>
            <span className="text-slate-400 block font-medium">Sobrantes en Mochila</span>
            <span className="font-extrabold text-cyan-400 text-sm">{totalRemaining} pzas</span>
          </div>
          <div className="h-6 w-px bg-slate-800"></div>
          <div>
            <span className="text-slate-400 block font-medium">Carga Total</span>
            <span className="font-extrabold text-slate-200 text-sm">{totalInitial + totalRestocked} pzas</span>
          </div>
        </div>
      </div>

      {/* Breakdown per Flavor */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 mb-4 shadow-md">
        <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
          Desglose Detallado por Sabor
        </h4>

        <div className="space-y-2">
          {breakdown.map((item) => (
            <div
              key={item.id}
              className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-2.5 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{item.emoji}</span>
                <div>
                  <span className="font-bold text-white block">{item.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {item.sold} vendidas • {item.remaining} en mochila
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-black text-amber-400 block text-sm">
                  ${item.revenue}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Dev: <b className="text-rose-400">${item.cost}</b> | Gan: <b className="text-emerald-400">+${item.profit}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5">
        <button
          onClick={handleShareWhatsApp}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-98 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>Enviar Reporte por WhatsApp</span>
        </button>

        <button
          onClick={handleCopyText}
          className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 border border-slate-800 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? '¡Reporte Copiado al Portapapeles!' : 'Copiar Texto del Reporte'}</span>
        </button>

        <button
          onClick={handleFinalize}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-98 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Guardar y Finalizar Día de Hoy</span>
        </button>
      </div>
    </div>
  );
}
