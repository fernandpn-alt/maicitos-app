import { useEffect, useState } from 'react';
import { db, getDeviceIdentity } from '../db/dexie';
import { isCloudConfigured, supabase } from './supabaseClient';
import { APP_VERSION } from '../constants/defaults';
import { sounds } from '../utils/audio';

const IMMUTABLE_TABLES = new Set(['stock_movements', 'sales', 'payments', 'expenses']);
const SYNC_TABLES = [
  'products',
  'locations',
  'stock_movements',
  'clients',
  'orders',
  'sales',
  'payments',
  'expenses',
  'app_settings',
  'device_heartbeats'
];

function getConflictKey(tableName) {
  if (tableName === 'app_settings') return 'key';
  if (tableName === 'device_heartbeats') return 'device_id';
  return 'id';
}

function getRecordPrimaryKey(tableName, row) {
  if (tableName === 'app_settings') return String(row.key);
  if (tableName === 'device_heartbeats') return String(row.device_id);
  return String(row.id);
}

let statusState = {
  mode: isCloudConfigured ? 'unauthenticated' : 'local',
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  userEmail: null
};

const listeners = new Set();
let engineStarted = false;
let syncInFlight = null;
let pollInterval = null;
let realtimeChannel = null;
let pullTimer = null;

function emitStatus(partial = {}) {
  statusState = { ...statusState, ...partial };
  for (const listener of listeners) {
    listener(statusState);
  }
}

export function subscribeSyncStatus(listener) {
  listeners.add(listener);
  listener(statusState);
  return () => listeners.delete(listener);
}

export function getSyncStatus() {
  return statusState;
}

export function useSyncStatus() {
  const [state, setState] = useState(statusState);
  useEffect(() => subscribeSyncStatus(setState), []);
  return state;
}

export async function refreshPendingCount() {
  try {
    const count = await db._outbox.count();
    emitStatus({ pendingCount: count });
    return count;
  } catch {
    return 0;
  }
}

async function getCloudSessionSafe() {
  if (!isCloudConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  } catch {
    return null;
  }
}

export async function pushOutbox() {
  if (!isCloudConfigured || !supabase) return { pushed: 0 };
  const session = await getCloudSessionSafe();
  if (!session) return { pushed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { pushed: 0 };

  const items = await db._outbox.orderBy('seq').toArray();
  let pushed = 0;

  for (const item of items) {
    const conflictCol = getConflictKey(item.table_name);
    const isImmutable = item.op_type === 'insert_immutable' || IMMUTABLE_TABLES.has(item.table_name);

    const { error } = await supabase.from(item.table_name).upsert(item.payload, {
      onConflict: conflictCol,
      ignoreDuplicates: isImmutable
    });

    if (error) {
      throw new Error(`${item.table_name}: ${error.message}`);
    }

    await db._outbox.delete(item.seq);
    pushed += 1;
    await refreshPendingCount();
  }

  return { pushed };
}

export async function pullChanges(forceFull = false) {
  if (!isCloudConfigured || !supabase) return { pulled: 0 };
  const session = await getCloudSessionSafe();
  if (!session) return { pulled: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { pulled: 0 };

  const meta = forceFull ? null : await db._meta.get('last_pull_at');
  const since = meta?.value || '1970-01-01T00:00:00.000Z';

  const pendingItems = await db._outbox.toArray();
  const pendingSet = new Set(pendingItems.map((it) => `${it.table_name}:${it.record_id}`));

  let maxSeen = since;
  let pulled = 0;

  for (const tableName of SYNC_TABLES) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true });

    if (error) {
      throw new Error(`${tableName} pull: ${error.message}`);
    }

    if (!data || data.length === 0) continue;

    const toPut = [];
    for (const row of data) {
      if (row.updated_at && row.updated_at > maxSeen) {
        maxSeen = row.updated_at;
      }
      const key = `${tableName}:${getRecordPrimaryKey(tableName, row)}`;
      if (pendingSet.has(key)) {
        // Never overwrite local pending changes
        continue;
      }
      toPut.push(row);
    }

    if (toPut.length > 0) {
      await db[tableName].bulkPut(toPut);
      pulled += toPut.length;
    }
  }

  if (maxSeen && maxSeen !== since) {
    await db._meta.put({ key: 'last_pull_at', value: maxSeen });
  } else if (!meta) {
    await db._meta.put({ key: 'last_pull_at', value: new Date().toISOString() });
  }

  return { pulled };
}

export async function sendHeartbeat() {
  const identity = getDeviceIdentity();
  const pendingCount = await refreshPendingCount();
  const nowIso = new Date().toISOString();

  const heartbeat = {
    device_id: identity.device_id,
    device_name: identity.device_name,
    role: identity.role || 'sin-asignar',
    last_seen_at: nowIso,
    pending_count: pendingCount,
    app_version: APP_VERSION,
    updated_at: nowIso
  };

  try {
    await db.device_heartbeats.put(heartbeat);
  } catch {
    // ignore local db errors
  }

  if (!isCloudConfigured || !supabase) return;
  const session = await getCloudSessionSafe();
  if (!session) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  await supabase
    .from('device_heartbeats')
    .upsert(heartbeat, { onConflict: 'device_id' });
}

export async function syncNow({ forceFull = false } = {}) {
  await refreshPendingCount();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isCloudConfigured || !supabase) {
    await sendHeartbeat();
    emitStatus({
      mode: 'local',
      online,
      lastError: null
    });
    return { ok: true, mode: 'local' };
  }

  const session = await getCloudSessionSafe();
  if (!session) {
    await sendHeartbeat();
    emitStatus({
      mode: 'unauthenticated',
      online,
      userEmail: null,
      lastError: null
    });
    return { ok: false, mode: 'unauthenticated' };
  }

  if (!online) {
    emitStatus({
      mode: 'offline',
      online: false,
      userEmail: session.user?.email || null
    });
    return { ok: false, mode: 'offline' };
  }

  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    emitStatus({
      mode: 'syncing',
      online: true,
      userEmail: session.user?.email || null,
      lastError: null
    });

    try {
      await pushOutbox();
      await pullChanges(forceFull);
      await sendHeartbeat();
      await refreshPendingCount();

      emitStatus({
        mode: 'synced',
        online: true,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        userEmail: session.user?.email || null
      });
      return { ok: true, mode: 'synced' };
    } catch (err) {
      emitStatus({
        mode: 'error',
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        lastError: err?.message || 'Error al sincronizar'
      });
      return { ok: false, mode: 'error', error: err };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

function schedulePull() {
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    syncNow();
  }, 400);
}

function attachRealtime() {
  if (!isCloudConfigured || !supabase || realtimeChannel) return;

  const identity = getDeviceIdentity();
  let channel = supabase.channel('maicitos-realtime');

  for (const tableName of SYNC_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      (payload) => {
        if (
          tableName === 'orders' &&
          payload.eventType === 'INSERT' &&
          payload.new?.created_by_device &&
          payload.new.created_by_device !== identity.device_id
        ) {
          sounds.playOrderAlert();
        }
        schedulePull();
      }
    );
  }

  realtimeChannel = channel.subscribe();
}

function detachRealtime() {
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

const handleOnline = () => {
  emitStatus({ online: true });
  syncNow();
};

const handleOffline = () => {
  emitStatus({
    online: false,
    mode: isCloudConfigured ? 'offline' : 'local'
  });
};

const handleVisibility = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    syncNow();
  }
};

export function startSyncEngine() {
  if (engineStarted) return;
  engineStarted = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  if (isCloudConfigured && supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        emitStatus({ userEmail: session.user?.email || null });
        attachRealtime();
        syncNow();
      } else {
        detachRealtime();
        emitStatus({ mode: 'unauthenticated', userEmail: null });
      }
    });

    getCloudSessionSafe().then((session) => {
      if (session) attachRealtime();
      syncNow();
    });
  } else {
    syncNow();
  }

  pollInterval = setInterval(() => {
    syncNow();
  }, 25000);
}

export function stopSyncEngine() {
  engineStarted = false;
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibility);
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (pullTimer) {
    clearTimeout(pullTimer);
    pullTimer = null;
  }
  detachRealtime();
}

export async function signInCloud(email, password) {
  if (!isCloudConfigured || !supabase) {
    throw new Error('Supabase no está configurado en variables de entorno (.env).');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
  attachRealtime();
  await syncNow({ forceFull: true });
  return data;
}

export async function signUpCloud(email, password) {
  if (!isCloudConfigured || !supabase) {
    throw new Error('Supabase no está configurado en variables de entorno (.env).');
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password
  });
  if (error) throw error;
  if (data?.session) {
    attachRealtime();
    await syncNow({ forceFull: true });
    return { needsEmailConfirmation: false, data };
  }
  return { needsEmailConfirmation: true, data };
}

export async function signOutCloud() {
  if (!supabase) return;
  detachRealtime();
  await supabase.auth.signOut();
  emitStatus({ mode: 'unauthenticated', userEmail: null });
}

export async function getCloudSession() {
  return getCloudSessionSafe();
}
