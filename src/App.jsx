import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, ROLE_CONFIGS } from './constants/defaults';
import { db, ensureSeeded, getDeviceIdentity } from './db/dexie';
import { computeStockMap } from './db/ledger';
import { startSyncEngine, stopSyncEngine } from './services/syncEngine';
import { useRouter } from './utils/router';
import TopSyncBar from './components/TopSyncBar';
import RoleSelector from './components/RoleSelector';
import QuickOrderModal from './components/QuickOrderModal';
import QuickOrderCapture from './pages/QuickOrderCapture';
import TabletWarehouse from './pages/TabletWarehouse';
import OfficeDesktop from './pages/OfficeDesktop';
import RouteMobile from './pages/RouteMobile';
import AdminControl from './pages/AdminControl';

function getRoleFromPath(pathname) {
  if (pathname.startsWith('/tablet')) return 'tablet';
  if (pathname.startsWith('/oficina')) return 'oficina';
  if (pathname.startsWith('/ruta')) return 'ruta';
  if (pathname.startsWith('/admin')) return 'admin';
  return getDeviceIdentity().role || '';
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const { path, query, navigate } = useRouter();

  useEffect(() => {
    let active = true;
    ensureSeeded().then(() => {
      if (!active) return;
      setReady(true);
      startSyncEngine();
    });
    return () => {
      active = false;
      stopSyncEngine();
    };
  }, []);

  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const locations = useLiveQuery(() => db.locations.toArray(), [], []);
  const movements = useLiveQuery(() => db.stock_movements.toArray(), [], []);
  const clients = useLiveQuery(() => db.clients.toArray(), [], []);
  const orders = useLiveQuery(() => db.orders.toArray(), [], []);
  const sales = useLiveQuery(() => db.sales.toArray(), [], []);
  const payments = useLiveQuery(() => db.payments.toArray(), [], []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const heartbeats = useLiveQuery(() => db.device_heartbeats.toArray(), [], []);
  const outbox = useLiveQuery(() => db._outbox.toArray(), [], []);
  const settingsRow = useLiveQuery(() => db.app_settings.get('business_config'), [], null);

  const settings = settingsRow?.value || DEFAULT_SETTINGS;
  const priceTiers = settings.price_tiers || DEFAULT_SETTINGS.price_tiers;
  const stockMap = useMemo(() => computeStockMap(movements), [movements]);

  const currentRole = getRoleFromPath(path);
  const hasAnyData =
    movements.some((m) => !m.deleted_at) ||
    clients.some((c) => !c.deleted_at) ||
    orders.some((o) => !o.deleted_at);

  useEffect(() => {
    if (!ready) return;
    if (path === '/' && !query.get('cambiar')) {
      const savedRole = getDeviceIdentity().role;
      if (savedRole && ROLE_CONFIGS[savedRole]) {
        navigate(ROLE_CONFIGS[savedRole].path, { replace: true });
      }
    }
  }, [ready, path, query, navigate]);

  const handleSelectRole = (rolePath) => {
    navigate(rolePath);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🌽</div>
          <div className="font-black text-slate-900">Cargando Maicitos ERP...</div>
        </div>
      </div>
    );
  }

  let content = null;
  if (path.startsWith('/pedido-rapido')) {
    content = (
      <QuickOrderCapture
        query={query}
        products={products}
        clients={clients}
        locations={locations}
        priceTiers={priceTiers}
        onNavigate={navigate}
      />
    );
  } else if (path.startsWith('/tablet')) {
    content = (
      <TabletWarehouse
        products={products}
        locations={locations}
        orders={orders}
        movements={movements}
        stockMap={stockMap}
      />
    );
  } else if (path.startsWith('/oficina')) {
    content = (
      <OfficeDesktop
        products={products}
        locations={locations}
        clients={clients}
        orders={orders}
        sales={sales}
        payments={payments}
        expenses={expenses}
        movements={movements}
        stockMap={stockMap}
        priceTiers={priceTiers}
        onOpenQuickOrder={() => setQuickOrderOpen(true)}
        onNavigate={navigate}
      />
    );
  } else if (path.startsWith('/ruta')) {
    content = (
      <RouteMobile
        products={products}
        locations={locations}
        clients={clients}
        orders={orders}
        sales={sales}
        payments={payments}
        expenses={expenses}
        stockMap={stockMap}
        priceTiers={priceTiers}
      />
    );
  } else if (path.startsWith('/admin')) {
    content = (
      <AdminControl
        products={products}
        locations={locations}
        sales={sales}
        heartbeats={heartbeats}
        outbox={outbox}
        settings={settings}
      />
    );
  } else {
    content = (
      <RoleSelector
        onSelectRole={handleSelectRole}
        onOpenQuickOrder={() => setQuickOrderOpen(true)}
        hasAnyData={hasAnyData}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopSyncBar
        currentRole={currentRole}
        businessName={settings.business_name}
        onOpenQuickOrder={() => setQuickOrderOpen(true)}
        onNavigate={navigate}
      />

      <main className="flex-1">{content}</main>

      <QuickOrderModal
        isOpen={quickOrderOpen}
        onClose={() => setQuickOrderOpen(false)}
        products={products}
        clients={clients}
        locations={locations}
        priceTiers={priceTiers}
      />
    </div>
  );
}
