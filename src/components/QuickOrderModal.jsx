import React from 'react';
import { X, Zap } from 'lucide-react';
import QuickOrderEditor from './QuickOrderEditor';

export default function QuickOrderModal({
  isOpen,
  onClose,
  products,
  clients,
  locations,
  priceTiers
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-50 border border-slate-200 rounded-3xl w-full max-w-xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm sm:text-base">Widget Relámpago WhatsApp</div>
              <div className="text-[11px] text-slate-500 font-semibold">
                Pega un mensaje y arma el pedido al instante
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
          <QuickOrderEditor
            products={products}
            clients={clients}
            locations={locations}
            priceTiers={priceTiers}
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}
