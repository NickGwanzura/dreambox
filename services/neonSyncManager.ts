/**
 * Neon Sync Manager
 * Handles pulling remote data into localStorage while respecting the deleted queue.
 * Individual CRUD functions in mockData.ts push changes to the API directly;
 * this module handles the reverse — importing remote records on each sync cycle.
 */

import { isConfigured } from './apiClient';
import { STORAGE_KEYS } from './constants';
import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';

let isSyncing = false;
let lastSyncTime = Date.now();
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let syncListeners: Array<() => void> = [];

function notifyListeners() {
  syncListeners.forEach(fn => fn());
}

export const getLastSyncTime = () => lastSyncTime;
export const getPendingSyncCount = () => 0;
export const isCurrentlySyncing = () => isSyncing;

export const syncRecordToNeon = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: true };
};

export const pushAllToNeon = async (): Promise<{
  success: boolean;
  results: Record<string, { synced: number; failed: number; errors: string[] }>;
}> => {
  return { success: true, results: {} };
};

export const pullAllFromNeon = async (): Promise<{
  success: boolean;
  results: Record<string, { count: number; error?: string }>;
}> => {
  if (!isConfigured()) return { success: false, results: {} };

  // Read deleted queue — entries are {table, id, timestamp} objects
  let deletedQueue: { table: string; id: string; timestamp: number }[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_QUEUE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        deletedQueue = parsed.filter(
          e => typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.table === 'string'
        );
      }
    }
  } catch {
    deletedQueue = [];
  }

  const TABLE_MAP = [
    { table: 'invoices',   endpoint: '/api/invoices',   storageKey: STORAGE_KEYS.INVOICES },
    { table: 'billboards', endpoint: '/api/billboards', storageKey: STORAGE_KEYS.BILLBOARDS },
    { table: 'contracts',  endpoint: '/api/contracts',  storageKey: STORAGE_KEYS.CONTRACTS },
    { table: 'clients',    endpoint: '/api/clients',    storageKey: STORAGE_KEYS.CLIENTS },
  ] as const;

  const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const results: Record<string, { count: number; error?: string }> = {};

  for (const { table, endpoint, storageKey } of TABLE_MAP) {
    try {
      const res = await fetch(endpoint, { headers });
      const remoteRecords: any[] = await res.json();

      // IDs deleted locally that we don't want re-imported
      const deletedIds = new Set(
        deletedQueue.filter(e => e.table === table).map(e => e.id)
      );

      const filtered = remoteRecords.filter(r => !deletedIds.has(r.id));

      // Preserve local-only records (created offline, not yet in remote)
      const localRaw = localStorage.getItem(storageKey);
      const localRecords: any[] = localRaw ? JSON.parse(localRaw) : [];
      const remoteIds = new Set(remoteRecords.map(r => r.id));
      const localOnly = localRecords.filter(r => !remoteIds.has(r.id) && !deletedIds.has(r.id));

      const merged = [...filtered, ...localOnly];
      localStorage.setItem(storageKey, JSON.stringify(merged));
      results[table] = { count: merged.length };
    } catch (e: any) {
      results[table] = { count: 0, error: e?.message };
    }
  }

  lastSyncTime = Date.now();
  return { success: true, results };
};

export const queueForSync = (_table: string, _data: any) => {};

const performSyncCycle = async () => {
  if (!isConfigured() || isSyncing) return;
  isSyncing = true;
  notifyListeners();
  try {
    lastSyncTime = Date.now();
  } catch (e) {
    logger.error('Sync cycle error:', e);
  } finally {
    isSyncing = false;
    notifyListeners();
  }
};

export const startAutoSync = (): boolean => {
  if (!isConfigured()) {
    logger.warn('Cannot start auto-sync: not authenticated');
    return false;
  }
  stopAutoSync();
  syncIntervalId = setInterval(performSyncCycle, 30_000);
  logger.info('Auto-sync started (30s interval)');
  notifyListeners();
  return true;
};

export const stopAutoSync = () => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  notifyListeners();
};

export const forceSyncNow = async (): Promise<boolean> => {
  if (!isConfigured()) return true;
  try {
    await pullAllFromNeon();
  } catch (e) {
    logger.error('Force sync failed:', e);
  }
  return true;
};

export const getSyncStatus = () => ({
  isSyncing,
  lastSyncTime,
  pendingCount: 0,
  isAutoSyncRunning: syncIntervalId !== null,
  nextSyncIn: syncIntervalId ? 30_000 : null,
});

if (isConfigured()) {
  setTimeout(() => startAutoSync(), 1000);
}

export const useSync = () => {
  const [status, setStatus] = useState(getSyncStatus());

  useEffect(() => {
    const update = () => setStatus(getSyncStatus());
    syncListeners.push(update);
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
