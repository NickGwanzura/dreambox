/**
 * Database Sync Manager
 * Handles pulling API data into localStorage while respecting the deleted queue.
 * Individual CRUD functions in mockData.ts push changes to the API directly;
 * this module handles the reverse — importing remote records on each sync cycle.
 */

import { isConfigured } from './apiClient';
import { STORAGE_KEYS } from './constants';
import { logger } from '../utils/logger';
import { useState, useEffect } from 'react';
import { publishPulledRecords } from './remoteState';

let isSyncing = false;
let lastSyncTime = 0;
export type SyncAttemptOutcome = 'never' | 'running' | 'success' | 'failed';
let lastSyncOutcome: SyncAttemptOutcome = 'never';
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let syncListeners: Array<() => void> = [];
const SYNC_PAGE_SIZE = 500;

function notifyListeners() {
  syncListeners.forEach(fn => fn());
}

export const getLastSyncTime = () => lastSyncTime;
export const getLastSyncOutcome = () => lastSyncOutcome;
export const getPendingSyncCount = () => 0;
export const isCurrentlySyncing = () => isSyncing;

export const syncRecordToDatabase = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Record push is not supported by this sync manager' };
};

export const pushAllToDatabase = async (): Promise<{
  success: boolean;
  results: Record<string, { synced: number; failed: number; errors: string[] }>;
}> => {
  return {
    success: false,
    results: {
      unsupported: {
        synced: 0,
        failed: 0,
        errors: ['Push is not supported by this sync manager'],
      },
    },
  };
};

async function fetchAllRemoteRecords(
  table: string,
  endpoint: string,
  headers: Record<string, string>,
): Promise<any[]> {
  const remoteRecords: any[] = [];
  let skip = 0;

  while (true) {
    const pageUrl = `${endpoint}?limit=${SYNC_PAGE_SIZE}&skip=${skip}`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) throw new Error(`Remote ${table} pull failed (HTTP ${res.status})`);

    const page: unknown = await res.json();
    if (!Array.isArray(page)) throw new Error(`Remote ${table} pull returned an invalid response`);

    remoteRecords.push(...page);
    if (page.length < SYNC_PAGE_SIZE) return remoteRecords;
    skip += page.length;
  }
}

export const pullAllFromDatabase = async (): Promise<{
  success: boolean;
  results: Record<string, { count: number; error?: string }>;
}> => {
  const managesSyncState = !isSyncing;
  if (managesSyncState) {
    isSyncing = true;
    lastSyncOutcome = 'running';
    notifyListeners();
  }

  try {
    if (!isConfigured()) {
      lastSyncOutcome = 'failed';
      return { success: false, results: {} };
    }

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
        // Do not update localStorage until every page has completed. A later
        // page failure must leave this table's prior cache intact rather than
        // presenting a truncated remote dataset as a completed sync.
        const remoteRecords = await fetchAllRemoteRecords(table, endpoint, headers);

        // IDs deleted locally that we don't want re-imported
        const deletedIds = new Set(
          deletedQueue.filter(e => e.table === table).map(e => e.id)
        );

        const filtered = remoteRecords.filter(r => !deletedIds.has(r.id));

        // This manager has no durable write queue. Once online, a completed
        // pull is the authoritative truth; retaining invisible local-only
        // records would falsely claim an unsaved write succeeded.
        localStorage.setItem(storageKey, JSON.stringify(filtered));
        results[table] = { count: filtered.length };
      } catch (e: any) {
        results[table] = { count: 0, error: e?.message };
      }
    }

    const success = Object.values(results).every(result => !result.error);
    if (success) {
      const records = {
        invoices: JSON.parse(localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]'),
        billboards: JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLBOARDS) || '[]'),
        contracts: JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTRACTS) || '[]'),
        clients: JSON.parse(localStorage.getItem(STORAGE_KEYS.CLIENTS) || '[]'),
      };
      // Avoid importing the live stores here: importing mockData eagerly
      // starts its own hydration.  The loaded store subscribes to this event
      // and updates its in-memory arrays/listeners from this exact snapshot.
      publishPulledRecords(records);
      lastSyncTime = Date.now();
    }
    lastSyncOutcome = success ? 'success' : 'failed';
    return { success, results };
  } catch (e) {
    lastSyncOutcome = 'failed';
    throw e;
  } finally {
    if (managesSyncState) {
      isSyncing = false;
      notifyListeners();
    }
  }
};

export const queueForSync = (_table: string, _data: any) => {};

const performSyncCycle = async (): Promise<boolean> => {
  if (!isConfigured()) {
    lastSyncOutcome = 'failed';
    notifyListeners();
    return false;
  }
  if (isSyncing) return false;
  isSyncing = true;
  lastSyncOutcome = 'running';
  notifyListeners();
  try {
    const result = await pullAllFromDatabase();
    if (!result.success) logger.error('Sync cycle failed:', result.results);
    return result.success;
  } catch (e) {
    logger.error('Sync cycle error:', e);
    lastSyncOutcome = 'failed';
    return false;
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
  return performSyncCycle();
};

export const getSyncStatus = () => ({
  isSyncing,
  lastSyncTime,
  lastSyncOutcome,
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
