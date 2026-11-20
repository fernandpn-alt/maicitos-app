import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Lock,
  RefreshCw,
  Plus,
  Cloud,
  Download,
  Sparkles,
  Trash2,
  Save,
  Edit3,
  Brain,
  Zap
} from 'lucide-react';
import {
  clearOperationalData,
  exportAllDataJSON,
  exportSalesCSV,
  seedDemoData,
  updateBusinessSettings,
  upsertLocation,
  upsertProduct
} from '../db/operations';
import {
  analyzeWhatsAppMessage,
  checkDecisionApiStatus
} from '../services/decisionClient';
import { isCloudConfigured } from '../services/supabaseClient';
import {
  signInCloud,
  signOutCloud,
  signUpCloud,
  syncNow,
  useSyncStatus
} from '../services/syncEngine';
import { sounds } from '../utils/audio';

const PIN_SESSION_KEY = 'maicitos_admin_unlocked_v2';

function formatRelativeTime(iso) {
  if (!iso) return 'Sin registro';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `Hace ${diffSec}s`;
  if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} h`;
  return new Date(iso).toLocaleDateString('es-MX');
}

export default function AdminControl({
  products = [],
  locations = [],
  sales = [],
  heartbeats = [],
  outbox = [],
  settings
}) {
  const sync = useSyncStatus();
  const configuredPin = String(settings?.admin_pin || '1234');
  const [unlocked, setUnlocked] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PIN_SESSION_KEY) === '1'
  );
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [tab, setTab] = useState('health'); // health | catalog | locations | cloud | backups
  const [toast, setToast] = useState('');

  // Catalog editing
  const [editingProduct, setEditingProduct] = useState(null);
  const [tierForm, setTierForm] = useState({
    base: settings?.price_tiers?.base ?? 20,
    vip: settings?.price_tiers?.vip ?? 18,
    medio: settings?.price_tiers?.medio ?? 22,
    default_cost: settings?.default_cost ?? 12,
    default_units_per_box: settings?.default_units_per_box ?? 25
  });

  // Location & PIN editing
  const [editingLocation, setEditingLocation] = useState(null);
  const [bizNameInput, setBizNameInput] = useState(settings?.business_name || 'Maicitos en Frío');
  const [newPinInput, setNewPinInput] = useState('');

  // Cloud login / signup
  const [authMode, setAuthMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Google Decision 1 AI status & quick test
  const [aiStatus, setAiStatus] = useState({ configured: false, reachable: false, checked: false });
  const [aiTestText, setAiTestText] = useState(
    'Hola! Mándame urgente 50 fuego y 20 queso para hoy, te pago en la tarde'
  );
  const [aiTestBusy, setAiTestBusy] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [aiTestError, setAiTestError] = useState('');
  const [aiLatencyMs, setAiLatencyMs] = useState(null);

  useEffect(() => {
    if (!unlocked) return;
    checkDecisionApiStatus().then((st) => {
      setAiStatus({ ...st, checked: true });
    });
  }, [unlocked, tab]);

  const showNotice = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleUnlock = (e) => {
    e.preventDefault();
    if (pinInput.trim() === configuredPin) {
      setUnlocked(true);
      setPinError('');
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(PIN_SESSION_KEY, '1');
      }
    } else {
      setPinError('PIN incorrecto.');
    }
  };

  const sortedHeartbeats = useMemo(
    () =>
      [...heartbeats].sort(
        (a, b) => new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0)
      ),
    [heartbeats]
  );

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto px-4 py-14">
        <form
          onSubmit={handleUnlock}
          className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">🏠 Casa Admin</h2>
            <p className="text-xs text-slate-500 mt-1">
              Ingresa el PIN de administrador para modificar precios, catálogo o nube.
            </p>
            {configuredPin === '1234' && (
              <p className="text-[11px] text-amber-700 font-bold mt-1">
                PIN inicial por defecto: 1234
              </p>
            )}
          </div>

          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN de 4 dígitos"
            className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-center text-xl font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          {pinError && <div className="text-xs font-bold text-rose-600">{pinError}</div>}

          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm"
          >
            Entrar a Casa Admin
          </button>
        </form>
      </div>
    );
  }

  const handleSaveTiers = async (e) => {
    e.preventDefault();
    await updateBusinessSettings({
      price_tiers: {
        base: Number(tierForm.base) || 20,
        vip: Number(tierForm.vip) || 18,
        medio: Number(tierForm.medio) || 22
      },
      default_cost: Number(tierForm.default_cost) || 12,
      default_units_per_box: Number(tierForm.default_units_per_box) || 25
    });
    sounds.playCashChime();
    syncNow();
    showNotice('✅ Niveles de precio guardados y sincronizados.');
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    await upsertProduct(editingProduct);
    sounds.playCashChime();
    syncNow();
    setEditingProduct(null);
    showNotice('✅ Producto actualizado en el catálogo.');
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!editingLocation) return;
    await upsertLocation(editingLocation);
    sounds.playCashChime();
    syncNow();
    setEditingLocation(null);
    showNotice('✅ Ubicación guardada.');
  };

  const handleSaveGeneralSecurity = async (e) => {
    e.preventDefault();
    const payload = {
      business_name: bizNameInput.trim() || 'Maicitos en Frío'
    };
    if (newPinInput.trim().length >= 4) {
      payload.admin_pin = newPinInput.trim();
    }
    await updateBusinessSettings(payload);
    sounds.playCashChime();
    syncNow();
    setNewPinInput('');
    showNotice('✅ Configuración general actualizada.');
  };

  const handleCloudAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const res = await signUpCloud(email, password);
        setPassword('');
        if (res.needsEmailConfirmation) {
          setAuthInfo(
            '✅ Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión con esa misma clave.'
          );
          setAuthMode('signin');
        } else {
          showNotice('✅ Cuenta creada, conectada a Supabase y sincronizada.');
        }
      } else {
        await signInCloud(email, password);
        setPassword('');
        showNotice('✅ Conectado a Supabase y sincronizado.');
      }
    } catch (err) {
      setAuthError(
        err?.message ||
          (authMode === 'signup'
            ? 'No se pudo crear la cuenta.'
            : 'Error al iniciar sesión en Supabase.')
      );
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 pb-16 space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">🏠 Casa Admin — Control Maestro</h1>
          <p className="text-xs text-slate-500">
            Cualquier cambio que hagas aquí se propaga automático a la Bodega y a los Celulares.
          </p>
        </div>

        <button
          type="button"
          onClick={() => syncNow({ forceFull: true })}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${sync.mode === 'syncing' ? 'animate-spin' : ''}`} />
          <span>Sincronizar Ahora</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'health', label: '📡 Salud y Dispositivos' },
          { id: 'ai', label: '🧠 IA Google' },
          { id: 'catalog', label: '🌽 Catálogo y Precios' },
          { id: 'locations', label: '🚚 Ubicaciones y PIN' },
          { id: 'cloud', label: '☁️ Nube (Supabase)' },
          { id: 'backups', label: '💾 Respaldos y Demo' }
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap ${
              tab === t.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl px-4 py-2.5 text-sm font-bold">
          {toast}
        </div>
      )}

      {/* ================= TAB 1: HEALTH & DEVICES ================= */}
      {tab === 'health' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              Dispositivos Registrados ({sortedHeartbeats.length})
            </h2>

            {sortedHeartbeats.length === 0 ? (
              <div className="text-xs text-slate-500">Sin heartbeats registrados todavía.</div>
            ) : (
              <div className="space-y-2">
                {sortedHeartbeats.map((hb) => (
                  <div
                    key={hb.device_id}
                    className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-black text-slate-900 text-sm">{hb.device_name}</div>
                      <div className="text-slate-500">
                        Modo: <strong>{hb.role}</strong> • v{hb.app_version || '2.0.0'} •{' '}
                        <span className="font-mono">{hb.device_id}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-700">
                        {formatRelativeTime(hb.last_seen_at)}
                      </div>
                      {hb.pending_count > 0 && (
                        <div className="text-amber-700 font-black">
                          {hb.pending_count} pendientes
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h2 className="font-black text-slate-900 text-base">
              Cola Outbox Local ({outbox.length} pendientes)
            </h2>
            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div>
                Estado de red: <strong>{sync.online ? 'Con internet' : 'Offline'}</strong>
              </div>
              <div>
                Modo actual: <strong>{sync.mode}</strong>
              </div>
              <div>
                Última sync:{' '}
                <strong>
                  {sync.lastSyncAt ? formatRelativeTime(sync.lastSyncAt) : 'Aún no sincronizado'}
                </strong>
              </div>
              {sync.lastError && (
                <div className="text-rose-700 font-bold">Error: {sync.lastError}</div>
              )}
            </div>

            {outbox.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {outbox.map((op) => (
                  <div
                    key={op.seq}
                    className="text-xs border border-amber-200 bg-amber-50 rounded-lg px-3 py-1.5 flex justify-between"
                  >
                    <span>
                      <strong>{op.table_name}</strong> ({op.op_type})
                    </span>
                    <span className="font-mono text-slate-500">{op.record_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB AI: GOOGLE DECISION 1 ================= */}
      {tab === 'ai' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 max-w-2xl">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-slate-900 text-base">
                  Google Decision 1 (Ayuda Inteligente)
                </h2>
                <p className="text-xs text-slate-500">
                  Entiende mensajes de WhatsApp, revisa capturas de transferencia, alerta riesgo de fiado e inspecciona fotos de cajas dañadas.
                </p>
              </div>
            </div>

            <span
              className={`px-3 py-1.5 rounded-full text-xs font-black border ${
                aiStatus.configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}
            >
              {aiStatus.configured
                ? '🟢 Google Decision 1 activo y listo'
                : '🟡 Falta llave GEMINI_API_KEY en el servidor'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-black uppercase text-slate-600">
              Prueba rápida en vivo
            </div>
            <textarea
              rows={2}
              value={aiTestText}
              onChange={(e) => setAiTestText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
            <button
              type="button"
              disabled={aiTestBusy || !aiTestText.trim()}
              onClick={async () => {
                setAiTestBusy(true);
                setAiTestError('');
                setAiTestResult(null);
                const t0 = performance.now();
                try {
                  const res = await analyzeWhatsAppMessage(aiTestText);
                  setAiLatencyMs(Math.round(performance.now() - t0));
                  if (!res.ok) {
                    setAiTestError(res.error || 'No se pudo probar la IA.');
                  } else {
                    setAiTestResult(res.result);
                    sounds.playSaleClick(1);
                  }
                } finally {
                  setAiTestBusy(false);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>{aiTestBusy ? 'Consultando a Google...' : '⚡ Probar IA con mensaje de ejemplo'}</span>
            </button>

            {aiTestError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-xs font-bold">
                {aiTestError}
              </div>
            )}

            {aiTestResult && (
              <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200">
                    ✅ {aiTestResult.intentLabel} ({aiTestResult.intentConfidencePct}%)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-900 border border-rose-200">
                    🔥 {aiTestResult.urgencyLabel} ({aiTestResult.urgencyConfidencePct}%)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
                    {aiTestResult.mentionsCredit
                      ? `📒 Menciona fiado (${aiTestResult.mentionsCreditPct}%)`
                      : '💵 No pide fiado'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                    {aiTestResult.needsHumanReview ? '👀 Revisar detalles' : '👌 Mensaje claro'}
                  </span>
                </div>
                {aiLatencyMs !== null && (
                  <div className="text-[11px] text-slate-500 font-semibold">
                    Respondido por Google Decision 1 en {aiLatencyMs} ms.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: CATALOG & PRICES ================= */}
      {tab === 'catalog' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSaveTiers}
            className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
          >
            <h2 className="font-black text-slate-900 text-base">
              💰 Reglas Globales de Precios y Cajas
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Mayoreo Base ($)</label>
                <input
                  type="number"
                  value={tierForm.base}
                  onChange={(e) => setTierForm((p) => ({ ...p, base: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">VIP Volumen ($)</label>
                <input
                  type="number"
                  value={tierForm.vip}
                  onChange={(e) => setTierForm((p) => ({ ...p, vip: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Medio Mayoreo ($)</label>
                <input
                  type="number"
                  value={tierForm.medio}
                  onChange={(e) => setTierForm((p) => ({ ...p, medio: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Costo Base ($)</label>
                <input
                  type="number"
                  value={tierForm.default_cost}
                  onChange={(e) => setTierForm((p) => ({ ...p, default_cost: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Bolsas / Caja</label>
                <input
                  type="number"
                  value={tierForm.default_units_per_box}
                  onChange={(e) =>
                    setTierForm((p) => ({ ...p, default_units_per_box: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-xs inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Guardar Reglas Globales
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-900 text-base">
                🌽 Sabores / Productos ({products.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setEditingProduct({
                    name: '',
                    short_name: '',
                    emoji: '🌽',
                    color: 'amber',
                    cost_price: tierForm.default_cost,
                    sale_price: tierForm.base,
                    units_per_box: tierForm.default_units_per_box,
                    min_stock: 80,
                    aliases: '',
                    active: true,
                    sort_order: products.length + 1
                  })
                }
                className="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Nuevo Sabor
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{p.emoji}</span>
                    <div>
                      <div className="font-black text-sm text-slate-900">
                        {p.name}{' '}
                        {p.active === false && (
                          <span className="text-[10px] text-rose-600">(Inactivo)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Costo ${p.cost_price} • Venta ${p.sale_price} • {p.units_per_box} bls/caja
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProduct({
                        ...p,
                        aliases: Array.isArray(p.aliases) ? p.aliases.join(', ') : p.aliases || ''
                      })
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: LOCATIONS & PIN ================= */}
      {tab === 'locations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-900 text-base">🚚 Ubicaciones y Autos</h2>
              <button
                type="button"
                onClick={() =>
                  setEditingLocation({ name: '', type: 'vehicle', driver_name: '', active: true })
                }
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Auto
              </button>
            </div>

            <div className="space-y-2">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="border border-slate-200 rounded-xl p-3 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-black text-slate-900">
                      {loc.type === 'warehouse' ? '🏠' : '🚚'} {loc.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Responsable: {loc.driver_name || '-'} • ID: {loc.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingLocation({ ...loc })}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 font-bold text-xs"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSaveGeneralSecurity}
            className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 h-fit"
          >
            <h2 className="font-black text-slate-900 text-base">🔐 Nombre del Negocio y PIN</h2>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">Nombre comercial</label>
              <input
                type="text"
                value={bizNameInput}
                onChange={(e) => setBizNameInput(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase">
                Nuevo PIN Admin (opcional, mínimo 4 dígitos)
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="Dejar vacío para mantener el actual"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-black text-xs"
            >
              Guardar Seguridad
            </button>
          </form>
        </div>
      )}

      {/* ================= TAB 4: CLOUD (SUPABASE) ================= */}
      {tab === 'cloud' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 max-w-xl">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="font-black text-slate-900 text-base">
                Conexión a Supabase (100% en la Nube)
              </h2>
              <p className="text-xs text-slate-500">
                Estado:{' '}
                <strong>
                  {isCloudConfigured
                    ? 'Variables de entorno configuradas'
                    : 'Modo Local (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)'}
                </strong>
              </p>
            </div>
          </div>

          {!isCloudConfigured ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 space-y-1.5">
              <div className="font-black">Cómo activar la sincronización entre tus 3 lugares:</div>
              <p>1. Crea un proyecto gratis en Supabase y ejecuta <code>supabase/schema.sql</code>.</p>
              <p>2. Crea un usuario único en Supabase Authentication.</p>
              <p>3. Agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en tu archivo <code>.env</code> o en Vercel/Cloudflare Pages.</p>
              <p>Consulta el paso a paso completo en <code>SETUP_NUBE.md</code>.</p>
            </div>
          ) : sync.userEmail ? (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-950">
                Conectado como <strong>{sync.userEmail}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => syncNow({ forceFull: true })}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs"
                >
                  🔄 Pull Completo desde la Nube
                </button>
                <button
                  type="button"
                  onClick={signOutCloud}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 text-slate-800 font-bold text-xs"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCloudAuthSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthError('');
                    setAuthInfo('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-black border ${
                    authMode === 'signin'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                    setAuthInfo('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-black border ${
                    authMode === 'signup'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Crear cuenta (1ª vez)
                </button>
              </div>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo del negocio (ej. tunombre@gmail.com)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña (mínimo 6 caracteres)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              />
              {authError && <div className="text-xs font-bold text-rose-600">{authError}</div>}
              {authInfo && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-2 text-xs font-bold">
                  {authInfo}
                </div>
              )}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm"
              >
                {authBusy
                  ? 'Conectando...'
                  : authMode === 'signup'
                  ? 'Crear Cuenta Única del Negocio'
                  : 'Iniciar Sesión y Sincronizar Dispositivo'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ================= TAB 5: BACKUPS & DEMO ================= */}
      {tab === 'backups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h2 className="font-black text-slate-900 text-base">💾 Respaldos Exportables</h2>
            <button
              type="button"
              onClick={exportAllDataJSON}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Descargar Respaldo Completo (.json)
            </button>
            <button
              type="button"
              onClick={() => exportSalesCSV(sales)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Exportar Ventas (.csv para Excel)
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <h2 className="font-black text-slate-900 text-base">🧪 Datos de Prueba</h2>
            <button
              type="button"
              onClick={async () => {
                const res = await seedDemoData();
                syncNow();
                showNotice(
                  res.skipped
                    ? 'Ya hay datos operativos cargados.'
                    : '✨ Datos de demostración cargados.'
                );
              }}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Cargar Datos Demo
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  window.confirm(
                    '¿Borrar inventario, pedidos, ventas, clientes y gastos locales de este dispositivo?'
                  )
                ) {
                  await clearOperationalData();
                  showNotice('🧹 Datos operativos locales eliminados.');
                }
              }}
              className="w-full py-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-black text-xs flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Limpiar Datos Operativos Locales
            </button>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-5 space-y-3 shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-slate-900">
              {editingProduct.id ? `Editar ${editingProduct.name}` : 'Nuevo Sabor / Producto'}
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Nombre *</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct((p) => ({
                      ...p,
                      name: e.target.value,
                      short_name: p.short_name || e.target.value
                    }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Emoji</label>
                <input
                  type="text"
                  value={editingProduct.emoji}
                  onChange={(e) => setEditingProduct((p) => ({ ...p, emoji: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-center text-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Costo ($)</label>
                <input
                  type="number"
                  value={editingProduct.cost_price}
                  onChange={(e) =>
                    setEditingProduct((p) => ({ ...p, cost_price: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Venta Base ($)</label>
                <input
                  type="number"
                  value={editingProduct.sale_price}
                  onChange={(e) =>
                    setEditingProduct((p) => ({ ...p, sale_price: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Bolsas/Caja</label>
                <input
                  type="number"
                  value={editingProduct.units_per_box}
                  onChange={(e) =>
                    setEditingProduct((p) => ({ ...p, units_per_box: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Stock Mínimo</label>
                <input
                  type="number"
                  value={editingProduct.min_stock}
                  onChange={(e) =>
                    setEditingProduct((p) => ({ ...p, min_stock: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-black"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Alias WhatsApp (separados por coma)
              </label>
              <input
                type="text"
                value={editingProduct.aliases}
                onChange={(e) => setEditingProduct((p) => ({ ...p, aliases: e.target.value }))}
                placeholder="fuego, rojo, picante"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={editingProduct.active !== false}
                onChange={(e) => setEditingProduct((p) => ({ ...p, active: e.target.checked }))}
              />
              <span>Activo en el sistema</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-black text-sm"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Location Modal */}
      {editingLocation && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <form
            onSubmit={handleSaveLocation}
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              {editingLocation.id ? 'Editar Ubicación' : 'Nueva Ubicación / Auto'}
            </h3>
            <input
              type="text"
              required
              value={editingLocation.name}
              onChange={(e) => setEditingLocation((l) => ({ ...l, name: e.target.value }))}
              placeholder="Nombre (ej. Auto Hermano)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
            <input
              type="text"
              value={editingLocation.driver_name || ''}
              onChange={(e) => setEditingLocation((l) => ({ ...l, driver_name: e.target.value }))}
              placeholder="Responsable / Chofer"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
            <select
              value={editingLocation.type}
              onChange={(e) => setEditingLocation((l) => ({ ...l, type: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white"
            >
              <option value="vehicle">🚚 Vehículo / Ruta</option>
              <option value="warehouse">🏠 Bodega</option>
            </select>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingLocation(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-black text-sm"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
