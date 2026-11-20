import React from 'react';
import { ArrowLeft, Zap } from 'lucide-react';
import QuickOrderEditor from '../components/QuickOrderEditor';
import { getDeviceIdentity } from '../db/dexie';
import { ROLE_CONFIGS } from '../constants/defaults';

export default function QuickOrderCapture({
  query,
  products,
  clients,
  locations,
  priceTiers,
  onNavigate
}) {
  const title = query?.get('title') || '';
  const text = query?.get('text') || '';
  const url = query?.get('url') || '';
  const initialRawText = [title, text, url].filter(Boolean).join('\n');

  const identity = getDeviceIdentity();
  const backPath = ROLE_CONFIGS[identity.role]?.path || '/';

  return (
    <div className="max-w-xl mx-auto px-3 py-4 pb-16">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => onNavigate(backPath)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-black text-xs">
          <Zap className="w-3.5 h-3.5 text-amber-600" />
          <span>Widget Relámpago WhatsApp</span>
        </div>
      </div>

      <QuickOrderEditor
        initialRawText={initialRawText}
        products={products}
        clients={clients}
        locations={locations}
        priceTiers={priceTiers}
        onDone={() => onNavigate(backPath)}
      />
    </div>
  );
}
