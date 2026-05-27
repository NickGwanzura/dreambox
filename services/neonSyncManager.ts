/**
 * Neon Sync Manager
 * Lightweight shim — data is now API-first. Individual CRUD functions in
 * mockData.ts call api.post/put/delete directly. This module retains its
 * public API surface for compatibility but does no localStorage persistence.
 */

import { isConfigured } from './apiClient';
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
  return { success: true, results: {} };
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
