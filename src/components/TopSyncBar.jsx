import React, { useEffect, useState } from 'react';
import { RefreshCw, Zap, ArrowLeftRight, Wifi, WifiOff, Cloud, CloudOff, Download } from 'lucide-react';
import { ROLE_CONFIGS } from '../constants/defaults';
import { syncNow, useSyncStatus } from '../services/syncEngine';

export default function TopSyncBar({
  currentRole,
  businessName = 'Maicitos en Frío',
  onOpenQuickOrder,
  onNavigate
}) {
  const sync = useSyncStatus();
  const [swRegistration, setSwRegistration] = useState(null);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [offlineReady, setOfflineReady] = useState(
    () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller)
  );

  useEffect(() => {
    const onSwUpdated = (e) => {
      setSwRegistration(e.detail || null);
    };
    const onOfflineReady = () => setOfflineReady(true);
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    const onAppInstalled = () => setInstallPromptEvent(null);

    window.addEventListener('maicitos:sw-updated', onSwUpdated);
    window.addEventListener('maicitos:offline-ready', onOfflineReady);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('maicitos:sw-updated', onSwUpdated);
      window.removeEventListener('maicitos:offline-ready', onOfflineReady);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } finally {
      setInstallPromptEvent(null);
    }
  };

  const handleApplyUpdate = () => {
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  const roleMeta = ROLE_CONFIGS[currentRole];

  let statusUi = {
    dot: 'bg-sky-400',
    text: 'Modo Local',
    pill: 'bg-slate-800 text-sky-200 border-slate-700',
    icon: CloudOff
  };

  if (sync.mode === 'synced') {
    statusUi = {
      dot: 'bg-emerald-400',
      text: 'Al día',
      pill: 'bg-emerald-950/70 text-emerald-300 border-emerald-700',
      icon: Cloud
    };
  } else if (sync.mode === 'syncing') {
    statusUi = {
      dot: 'bg-amber-400 animate-pulse',
      text: 'Sincronizando',
      pill: 'bg-amber-950/70 text-amber-200 border-amber-700',
      icon: RefreshCw
    };
  } else if (sync.mode === 'offline') {
    statusUi = {
      dot: 'bg-rose-500',
      text: 'Sin señal',
      pill: 'bg-rose-950/80 text-rose-200 border-rose-700',
      icon: WifiOff
    };
  } else if (sync.mode === 'unauthenticated') {
    statusUi = {
      dot: 'bg-orange-400',
      text: 'Conectar nube',
      pill: 'bg-orange-950/70 text-orange-200 border-orange-700',
      icon: Wifi
    };
  } else if (sync.mode === 'error') {
    statusUi = {
      dot: 'bg-rose-500',
      text: 'Reintentar sync',
      pill: 'bg-rose-950/80 text-rose-200 border-rose-700',
      icon: RefreshCw
    };
  }

  const StatusIcon = statusUi.icon;

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Brand & Role */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/?cambiar=1')}
            className="flex items-center gap-2 text-left hover:opacity-90 active:scale-95 transition-transform"
            title="Cambiar modo de dispositivo"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shrink-0">
              🌽
            </div>
            <div className="leading-tight truncate">
              <div className="font-extrabold text-sm text-white truncate">
                {businessName}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                {roleMeta ? (
                  <>
                    <span>
                      {roleMeta.emoji} {roleMeta.shortTitle}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-amber-400 inline-flex items-center gap-0.5 font-semibold">
                      <ArrowLeftRight className="w-3 h-3" /> Cambiar
                    </span>
                  </>
                ) : (
                  <span>Elegir modo</span>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Right: Install + Quick WhatsApp Order + Sync Pill */}
        <div className="flex items-center gap-2">
          {installPromptEvent && (
            <button
              type="button"
              onClick={handleInstallApp}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs shadow-sm transition-transform"
              title="Instalar en este dispositivo para abrir sin internet"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Instalar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenQuickOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm transition-transform"
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span>Pedido WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (sync.mode === 'unauthenticated') {
                onNavigate('/admin');
              } else {
                syncNow();
              }
            }}
            title={`${sync.lastError || 'Estado de sincronización'}${
              offlineReady ? ' • Listo para abrir sin internet' : ''
            }`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-colors ${statusUi.pill}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusUi.dot}`} />
            <StatusIcon className={`w-3.5 h-3.5 ${sync.mode === 'syncing' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{statusUi.text}</span>
            {sync.pendingCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                {sync.pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {swRegistration && (
        <div className="bg-indigo-600 text-white px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-3">
          <span>✨ Hay una actualización del sistema disponible</span>
          <button
            type="button"
            onClick={handleApplyUpdate}
            className="px-2.5 py-0.5 rounded-lg bg-white text-indigo-700 font-black hover:bg-indigo-50"
          >
            Actualizar ahora
          </button>
        </div>
      )}
    </header>
  );
}
