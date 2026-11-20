import React, { useState } from 'react';
import { Sparkles, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ROLE_CONFIGS } from '../constants/defaults';
import { getDeviceIdentity, setDeviceIdentity } from '../db/dexie';
import { seedDemoData } from '../db/operations';
import { syncNow } from '../services/syncEngine';

export default function RoleSelector({ onSelectRole, onOpenQuickOrder, hasAnyData }) {
  const identity = getDeviceIdentity();
  const [deviceName, setDeviceName] = useState(identity.device_name || '');
  const [demoNotice, setDemoNotice] = useState('');

  const handleChoose = async (roleCfg) => {
    const cleanName = deviceName.trim() || roleCfg.defaultDeviceName;
    await setDeviceIdentity({
      role: roleCfg.id,
      device_name: cleanName
    });
    syncNow();
    onSelectRole(roleCfg.path, roleCfg.id);
  };

  const handleLoadDemo = async () => {
    const res = await seedDemoData();
    if (res.skipped) {
      setDemoNotice('Ya tienes datos cargados en este dispositivo.');
    } else {
      setDemoNotice('¡Datos de demostración cargados! Elige cualquier modo para probar.');
      syncNow();
    }
  };

  const roles = [
    ROLE_CONFIGS.tablet,
    ROLE_CONFIGS.oficina,
    ROLE_CONFIGS.ruta,
    ROLE_CONFIGS.admin
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              🌽 Maicitos ERP 2.0 • Local-First + Nube
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
              ¿Qué dispositivo es este?
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Elige el modo de trabajo para este equipo. Todo se guarda en el dispositivo y sincroniza automático.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenQuickOrder}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-sm shadow-sm shrink-0"
          >
            <Zap className="w-4 h-4" />
            <span>Pedido Rápido WhatsApp</span>
          </button>
        </div>

        {/* Device Name */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-extrabold uppercase tracking-wide text-slate-500 shrink-0">
            Nombre de este equipo:
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Ej. Tablet Lenovo Bodega, Celular Papá..."
            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            onClick={() => handleChoose(role)}
            className="text-left bg-white border-2 border-slate-200 hover:border-amber-500 active:scale-[0.99] rounded-3xl p-5 shadow-sm transition-all flex flex-col justify-between gap-4 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-3xl shrink-0">
                  {role.emoji}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 group-hover:text-amber-700">
                    {role.title}
                  </h2>
                  <span className="text-xs font-bold text-slate-400 font-mono">
                    {role.path}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 shrink-0 mt-1" />
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              {role.description}
            </p>
          </button>
        ))}
      </div>

      {/* Optional Demo Data Seed when empty */}
      {!hasAnyData && (
        <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-indigo-950">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <strong className="font-extrabold">¿Es tu primera vez probando el sistema?</strong>
              <span className="block text-xs text-indigo-700">
                Puedes cargar inventario, clientes, pedidos WhatsApp y ventas de ejemplo en 1 clic (luego los borras desde Casa Admin).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLoadDemo}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs whitespace-nowrap"
          >
            ✨ Cargar Datos Demo
          </button>
        </div>
      )}

      {demoNotice && (
        <div className="mt-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{demoNotice}</span>
        </div>
      )}
    </div>
  );
}
