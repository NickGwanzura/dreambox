/**
 * Neon Sync Manager
 * Pushes/pulls data via /api/* endpoints backed by Neon PostgreSQL.
 * Keeps localStorage as offline cache.
 */

import { api, isConfigured } from './apiClient';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from './constants';
import { useState, useEffect } from 'react';

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

interface PendingSync {
  table: string;
  data: any;
  retries: number;
  timestamp: number;
}

// ---- module-level state ----
let pendingSyncs: PendingSync[] = [];
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastSyncTime = 0;
let syncListeners: Array<() => void> = [];

// Persist pending queue so it survives page refresh
const PENDING_KEY = 'db_pending_syncs';

function loadPendingQueue(): PendingSync[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingQueue() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingSyncs));
  } catch { /* quota exceeded – best-effort */ }
}

function notifyListeners() {
  syncListeners.forEach(fn => fn());
}

// ---- public getters ----
export const getLastSyncTime = () => lastSyncTime;
export const getPendingSyncCount = () => pendingSyncs.length;
export const isCurrentlySyncing = () => isSyncing;

// ============================================================
// TABLE MAP
// ============================================================

const TABLE_MAP = [
  { key: STORAGE_KEYS.BILLBOARDS, table: 'billboards' },
  { key: STORAGE_KEYS.CLIENTS, table: 'clients' },
  { key: STORAGE_KEYS.CONTRACTS, table: 'contracts' },
  { key: STORAGE_KEYS.INVOICES, table: 'invoices' },
  { key: STORAGE_KEYS.EXPENSES, table: 'expenses' },
  { key: STORAGE_KEYS.USERS, table: 'users' },
  { key: STORAGE_KEYS.TASKS, table: 'tasks' },
  { key: STORAGE_KEYS.MAINTENANCE, table: 'maintenance' },
  { key: STORAGE_KEYS.OUTSOURCED, table: 'outsourced' },
  { key: STORAGE_KEYS.PRINTING, table: 'printing-jobs' },
] as const;

// ============================================================
// CORE SYNC — single record
// ============================================================

export const syncRecordToNeon = async (
  table: string,
  data: any
): Promise<{ success: boolean; error?: string }> => {
  if (!isConfigured()) return { success: false, error: 'Not authenticated' };

  try {
    if (data.id) {
      await api.put(`/api/${table}`, data, { id: data.id });
    } else {
      await api.post(`/api/${table}`, data);
    }
    return { success: true };
  } catch (e: any) {
    logger.error(`Failed to sync ${table}:`, e);
    return { success: false, error: e.message };
  }
};

// ============================================================
// PUSH — local → Neon
// ============================================================

export const pushAllToNeon = async (): Promise<{
  success: boolean;
  results: Record<string, { synced: number; failed: number; errors: string[] }>;
}> => {
  if (!isConfigured()) return { success: false, results: {} };

  const results: Record<string, { synced: number; failed: number; errors: string[] }> = {};
  let hasFailures = false;

  for (const { key, table } of TABLE_MAP) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const records: any[] = JSON.parse(raw);
      if (!Array.isArray(records) || records.length === 0) continue;

      results[table] = { synced: 0, failed: 0, errors: [] };

      for (const record of records) {
        const result = await syncRecordToNeon(table, record);
        if (result.success) {
          results[table].synced++;
        } else {
          results[table].failed++;
          results[table].errors.push(result.error!);
          hasFailures = true;
        }
      }
    } catch (e: any) {
      results[table] = { synced: 0, failed: 0, errors: [e.message] };
      hasFailures = true;
    }
  }

  // Company profile
  try {
    const profile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const logo = localStorage.getItem(STORAGE_KEYS.LOGO);
    if (profile) {
      const profileData = JSON.parse(profile);
      await api.put('/api/company-profile', { ...profileData, logo });
      results['company_profile'] = { synced: 1, failed: 0, errors: [] };
    }
  } catch (e: any) {
    results['company_profile'] = { synced: 0, failed: 1, errors: [e.message] };
    hasFailures = true;
  }

  lastSyncTime = Date.now();
  localStorage.setItem('db_last_sync', lastSyncTime.toString());
  notifyListeners();

  return { success: !hasFailures, results };
};

// ============================================================
// PULL — Neon → local (merge-safe)
// ============================================================

export const pullAllFromNeon = async (): Promise<{
  success: boolean;
  results: Record<string, { count: number; error?: string }>;
}> => {
  if (!isConfigured()) return { success: false, results: {} };

  const results: Record<string, { count: number; error?: string }> = {};
  let hasFailures = false;

  for (const { table, key } of TABLE_MAP) {
    try {
      const data = await api.get<any[]>(`/api/${table}`);
      const remote = Array.isArray(data) ? data : [];

      // Merge: keep local-only items (no id or ids not in remote) to avoid data loss
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const local: any[] = JSON.parse(raw);
          const remoteIds = new Set(remote.map((r: any) => r.id));
          const localOnly = local.filter(
            (item: any) => item.id && !remoteIds.has(item.id) && item._localOnly
          );
          if (localOnly.length > 0) {
            remote.push(...localOnly);
          }
        }
      } catch { /* ignore merge errors, prefer remote */ }

      localStorage.setItem(key, JSON.stringify(remote));
      results[table] = { count: remote.length };
    } catch (e: any) {
      results[table] = { count: 0, error: e.message };
      hasFailures = true;
      logger.error(`Failed to pull ${table}:`, e);
    }
  }

  // Company profile
  try {
    const profile = await api.get('/api/company-profile');
    if (profile && Object.keys(profile).length > 0) {
      const { logo, ...rest } = profile;
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(rest));
      if (logo) localStorage.setItem(STORAGE_KEYS.LOGO, logo);
      results['company_profile'] = { count: 1 };
    }
  } catch (e: any) {
    results['company_profile'] = { count: 0, error: e.message };
    hasFailures = true;
  }

  lastSyncTime = Date.now();
  localStorage.setItem('db_last_sync', lastSyncTime.toString());
  window.dispatchEvent(new Event('storage'));
  notifyListeners();

  return { success: !hasFailures, results };
};

// ============================================================
// PENDING SYNC QUEUE (persisted)
// ============================================================

const processPendingSyncs = async () => {
  if (pendingSyncs.length === 0) return;

  const remaining: PendingSync[] = [];
  const dropped: PendingSync[] = [];

  for (const sync of pendingSyncs) {
    const result = await syncRecordToNeon(sync.table, sync.data);
    if (result.success) {
      // done
    } else if (sync.retries < MAX_RETRIES) {
      remaining.push({ ...sync, retries: sync.retries + 1 });
    } else {
      dropped.push(sync);
      logger.error(
        `Dropping sync for ${sync.table}/${sync.data.id} after ${MAX_RETRIES} retries`
      );
    }
  }

  if (dropped.length > 0) {
    logger.warn(`${dropped.length} sync item(s) dropped after max retries`);
  }

  pendingSyncs = remaining;
  savePendingQueue();
  notifyListeners();
};

export const queueForSync = (table: string, data: any) => {
  // Deduplicate by table + id
  pendingSyncs = pendingSyncs.filter(
    p => !(p.table === table && p.data.id === data.id)
  );
  pendingSyncs.push({ table, data, retries: 0, timestamp: Date.now() });
  savePendingQueue();
  notifyListeners();

  // Attempt immediate sync (awaited, errors handled)
  if (!isSyncing) {
    syncRecordToNeon(table, data).catch(e =>
      logger.error(`Immediate sync failed for ${table}:`, e)
    );
  }
};

// ============================================================
// SYNC CYCLE (with proper lock)
// ============================================================

const performSyncCycle = async () => {
  if (!isConfigured() || isSyncing) return;

  isSyncing = true;
  notifyListeners();
  try {
    logger.info('Starting sync cycle...');
    await processPendingSyncs();
    await pullAllFromNeon();
    logger.info('Sync cycle complete');
  } catch (e) {
    logger.error('Sync cycle error:', e);
  } finally {
    isSyncing = false;
    notifyListeners();
  }
};

// ============================================================
// AUTO-SYNC
// ============================================================

export const startAutoSync = (): boolean => {
  if (!isConfigured()) {
    logger.warn('Cannot start auto-sync: not authenticated');
    return false;
  }
  stopAutoSync();
  performSyncCycle(); // fire immediately (don't block)
  syncIntervalId = setInterval(performSyncCycle, SYNC_INTERVAL_MS);
  logger.info('Auto-sync started (30s interval)');
  notifyListeners();
  return true;
};

export const stopAutoSync = () => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  logger.info('Auto-sync stopped');
  notifyListeners();
};

export const forceSyncNow = async (): Promise<boolean> => {
  if (isSyncing) {
    logger.warn('Sync already in progress, skipping force sync');
    return false;
  }
  try {
    await performSyncCycle();
    return true;
  } catch (e) {
    logger.error('Force sync failed:', e);
    return false;
  }
};

// ============================================================
// STATUS
// ============================================================

export const getSyncStatus = () => ({
  isSyncing,
  lastSyncTime,
  pendingCount: pendingSyncs.length,
  isAutoSyncRunning: syncIntervalId !== null,
  nextSyncIn: syncIntervalId
    ? Math.max(0, SYNC_INTERVAL_MS - (Date.now() - lastSyncTime))
    : null,
});

// ============================================================
// INITIALIZATION (deferred — only starts if authenticated)
// ============================================================

// Restore persisted state
const storedSyncTime = localStorage.getItem('db_last_sync');
if (storedSyncTime) lastSyncTime = parseInt(storedSyncTime, 10);
pendingSyncs = loadPendingQueue();

// Auto-sync starts lazily — NOT on module import.
// Call startAutoSync() explicitly from the app shell when ready.

// ============================================================
// REACT HOOK (event-driven, not 1s polling)
// ============================================================

export const useSync = () => {
  const [status, setStatus] = useState(getSyncStatus());

  useEffect(() => {
    const update = () => setStatus(getSyncStatus());

    // Listen for sync state changes
    syncListeners.push(update);

    // Also poll every 5s as a safety net (not 1s)
    const interval = setInterval(update, 5000);

    return () => {
      syncListeners = syncListeners.filter(fn => fn !== update);
      clearInterval(interval);
    };
  }, []);

  return {
    ...status,
    forceSync: forceSyncNow,
    startSync: startAutoSync,
    stopSync: stopAutoSync,
  };
};
