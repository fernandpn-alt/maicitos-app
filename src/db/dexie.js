import Dexie from 'dexie';
import {
  DEFAULT_SETTINGS,
  INITIAL_LOCATIONS,
  INITIAL_PRODUCTS
} from '../constants/defaults';

export const db = new Dexie('MaicitosERP_v2');

db.version(1).stores({
  products: 'id, sort_order, active, updated_at',
  locations: 'id, type, active, updated_at',
  stock_movements: 'id, created_at, product_id, location_id, movement_type, reference_id, updated_at',
  clients: 'id, name, phone, price_tier, active, updated_at',
  orders: 'id, folio, created_at, status, priority, client_id, assigned_location_id, updated_at',
  sales: 'id, folio, created_at, order_id, client_id, location_id, updated_at',
  payments: 'id, created_at, client_id, updated_at',
  expenses: 'id, created_at, category, updated_at',
  app_settings: 'key, updated_at',
  device_heartbeats: 'device_id, role, updated_at',
  _outbox: '++seq, op_id, table_name, record_id, created_at',
  _meta: 'key'
});

const IDENTITY_STORAGE_KEY = 'maicitos_device_identity_v2';

function fallbackUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceIdentity() {
  let stored = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
  }

  if (stored && stored.device_id) {
    return {
      device_id: stored.device_id,
      device_name: stored.device_name || 'Dispositivo Maicitos',
      role: stored.role || '',
      preferred_location_id: stored.preferred_location_id || 'auto-papa'
    };
  }

  const created = {
    device_id: `dev_${fallbackUuid().slice(0, 12)}`,
    device_name: 'Dispositivo Maicitos',
    role: '',
    preferred_location_id: 'auto-papa'
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(created));
    } catch {
      // ignore storage errors
    }
  }

  return created;
}

export async function setDeviceIdentity(partial) {
  const current = getDeviceIdentity();
  const next = {
    ...current,
    ...partial
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  try {
    await db._meta.put({ key: 'device_identity', value: next });
  } catch {
    // ignore if db not ready
  }

  return next;
}

let seedPromise = null;

export async function ensureSeeded() {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const nowIso = new Date().toISOString();
    const identity = getDeviceIdentity();

    await db._meta.put({ key: 'device_identity', value: identity });

    const productCount = await db.products.count();
    if (productCount === 0) {
      await db.products.bulkPut(
        INITIAL_PRODUCTS.map((p) => ({
          ...p,
          updated_at: nowIso,
          deleted_at: null
        }))
      );
    }

    const locationCount = await db.locations.count();
    if (locationCount === 0) {
      await db.locations.bulkPut(
        INITIAL_LOCATIONS.map((loc) => ({
          ...loc,
          updated_at: nowIso,
          deleted_at: null
        }))
      );
    }

    const config = await db.app_settings.get('business_config');
    if (!config) {
      await db.app_settings.put({
        key: 'business_config',
        value: DEFAULT_SETTINGS,
        updated_at: nowIso
      });
    }
  })();

  try {
    await seedPromise;
  } finally {
    seedPromise = null;
  }
}
