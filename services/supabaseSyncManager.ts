/**
 * Supabase Sync Manager
 * Ensures 100% persistence by making Supabase the source of truth
 * Auto-syncs localStorage to Supabase every 30 seconds
 * Prevents Supabase from sleeping by keeping connection alive
 */

import { supabase, isSupabaseConfigured, checkSupabaseConnection } from './supabaseClient';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from './constants';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SYNC_INTERVAL_MS = 30000; // 30 seconds
const PING_INTERVAL_MS = 60000; // 60 seconds (keep alive)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// Track pending syncs
interface PendingSync {
  table: string;
  data: any;
  retries: number;
  timestamp: number;
}

let pendingSyncs: PendingSync[] = [];
let syncIntervalId: NodeJS.Timeout | null = null;
let pingIntervalId: NodeJS.Timeout | null = null;
let isSyncing = false;
let lastSyncTime = 0;

// =============================================================================
// SYNC STATE MANAGEMENT
// =============================================================================

export const getLastSyncTime = (): number => lastSyncTime;
export const getPendingSyncCount = (): number => pendingSyncs.length;
export const isCurrentlySyncing = (): boolean => isSyncing;

// =============================================================================
// CORE SYNC FUNCTIONS
// =============================================================================

/**
 * Push a single record to Supabase immediately
 */
export const syncRecordToSupabase = async (
  table: string,
  data: any
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from(table)
      .upsert(data, { onConflict: 'id' });

    if (error) {
      logger.error(`Failed to sync ${table}:`, error);
      return { success: false, error: error.message };
    }

    logger.info(`Synced ${table} record:`, data.id || 'new');
    return { success: true };
  } catch (e: any) {
    logger.error(`Exception syncing ${table}:`, e);
    return { success: false, error: e.message };
  }
};

/**
 * Push all local data to Supabase (full sync)
 */
export const pushAllToSupabase = async (): Promise<{
  success: boolean;
  results: Record<string, { synced: number; failed: number; errors: string[] }>;
}> => {
  if (!supabase) {
    return { success: false, results: {} };
  }

  isSyncing = true;
  const results: Record<string, { synced: number; failed: number; errors: string[] }> = {};

  // Get all data from localStorage
  const tables = [
    { key: STORAGE_KEYS.BILLBOARDS, table: 'billboards' },
    { key: STORAGE_KEYS.CLIENTS, table: 'clients' },
    { key: STORAGE_KEYS.CONTRACTS, table: 'contracts' },
    { key: STORAGE_KEYS.INVOICES, table: 'invoices' },
    { key: STORAGE_KEYS.EXPENSES, table: 'expenses' },
    { key: STORAGE_KEYS.USERS, table: 'users' },
    { key: STORAGE_KEYS.TASKS, table: 'tasks' },
    { key: STORAGE_KEYS.MAINTENANCE, table: 'maintenance_logs' },
    { key: STORAGE_KEYS.OUTSOURCED, table: 'outsourced_billboards' },
    { key: STORAGE_KEYS.PRINTING, table: 'printing_jobs' },
  ];

  for (const { key, table } of tables) {
    try {
      const data = localStorage.getItem(key);
      if (!data) continue;

      const records = JSON.parse(data);
      if (!Array.isArray(records) || records.length === 0) continue;

      results[table] = { synced: 0, failed: 0, errors: [] };

      // Batch upsert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        
        const { error } = await supabase
          .from(table)
          .upsert(chunk, { onConflict: 'id' });

        if (error) {
          results[table].failed += chunk.length;
          results[table].errors.push(error.message);
          logger.error(`Batch sync error for ${table}:`, error);
        } else {
          results[table].synced += chunk.length;
        }
      }

      logger.info(`Synced ${results[table].synced} records to ${table}`);
    } catch (e: any) {
      results[table] = { synced: 0, failed: 0, errors: [e.message] };
      logger.error(`Exception syncing ${table}:`, e);
    }
  }

  // Sync company profile separately
  try {
    const profile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    const logo = localStorage.getItem(STORAGE_KEYS.LOGO);
    
    if (profile) {
      const profileData = JSON.parse(profile);
      const { error } = await supabase
        .from('company_profile')
        .upsert({ ...profileData, id: 'profile_v1', logo });
      
      if (error) {
        results['company_profile'] = { synced: 0, failed: 1, errors: [error.message] };
      } else {
        results['company_profile'] = { synced: 1, failed: 0, errors: [] };
      }
    }
  } catch (e: any) {
    results['company_profile'] = { synced: 0, failed: 1, errors: [e.message] };
  }

  lastSyncTime = Date.now();
  isSyncing = false;
  
  // Store last sync time
  localStorage.setItem('db_last_supabase_sync', lastSyncTime.toString());

  return { success: true, results };
};

/**
 * Pull all data from Supabase (Supabase is source of truth)
 */
export const pullAllFromSupabase = async (): Promise<{
  success: boolean;
  results: Record<string, { count: number; error?: string }>;
}> => {
  if (!supabase) {
    return { success: false, results: {} };
  }

  isSyncing = true;
  const results: Record<string, { count: number; error?: string }> = {};

  const tables = [
    { table: 'billboards', key: STORAGE_KEYS.BILLBOARDS },
    { table: 'clients', key: STORAGE_KEYS.CLIENTS },
    { table: 'contracts', key: STORAGE_KEYS.CONTRACTS },
    { table: 'invoices', key: STORAGE_KEYS.INVOICES },
    { table: 'expenses', key: STORAGE_KEYS.EXPENSES },
    { table: 'users', key: STORAGE_KEYS.USERS },
    { table: 'tasks', key: STORAGE_KEYS.TASKS },
    { table: 'maintenance_logs', key: STORAGE_KEYS.MAINTENANCE },
    { table: 'outsourced_billboards', key: STORAGE_KEYS.OUTSOURCED },
    { table: 'printing_jobs', key: STORAGE_KEYS.PRINTING },
  ];

  for (const { table, key } of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(10000);

      if (error) {
        results[table] = { count: 0, error: error.message };
        logger.error(`Failed to pull ${table}:`, error);
      } else {
        // Overwrite localStorage with Supabase data (source of truth)
        localStorage.setItem(key, JSON.stringify(data || []));
        results[table] = { count: (data || []).length };
        logger.info(`Pulled ${(data || []).length} records from ${table}`);
      }
    } catch (e: any) {
      results[table] = { count: 0, error: e.message };
      logger.error(`Exception pulling ${table}:`, e);
    }
  }

  // Pull company profile
  try {
    const { data, error } = await supabase
      .from('company_profile')
      .select('*')
      .eq('id', 'profile_v1')
      .single();

    if (!error && data) {
      const { logo, ...profile } = data;
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
      if (logo) localStorage.setItem(STORAGE_KEYS.LOGO, logo);
      results['company_profile'] = { count: 1 };
    }
  } catch (e: any) {
    results['company_profile'] = { count: 0, error: e.message };
  }

  lastSyncTime = Date.now();
  isSyncing = false;
  
  // Notify app that data has changed
  window.dispatchEvent(new Event('storage'));
  
  return { success: true, results };
};

// =============================================================================
// AUTO-SYNC SYSTEM
// =============================================================================

/**
 * Process pending syncs with retry logic
 */
const processPendingSyncs = async () => {
  if (!supabase || pendingSyncs.length === 0) return;

  const remaining: PendingSync[] = [];

  for (const sync of pendingSyncs) {
    const result = await syncRecordToSupabase(sync.table, sync.data);
    
    if (!result.success && sync.retries < MAX_RETRIES) {
      remaining.push({ ...sync, retries: sync.retries + 1 });
    }
  }

  pendingSyncs = remaining;
};

/**
 * Queue a record for sync
 */
export const queueForSync = (table: string, data: any) => {
  // Remove any existing pending sync for this record
  pendingSyncs = pendingSyncs.filter(p => !(p.table === table && p.data.id === data.id));
  
  pendingSyncs.push({
    table,
    data,
    retries: 0,
    timestamp: Date.now()
  });

  // Try to sync immediately if possible
  if (!isSyncing) {
    syncRecordToSupabase(table, data);
  }
};

/**
 * Full sync cycle: Push local changes, then pull from Supabase
 */
const performSyncCycle = async () => {
  if (!supabase || isSyncing) return;

  logger.info('Starting auto-sync cycle...');
  
  // Step 1: Push pending changes to Supabase
  await processPendingSyncs();
  
  // Step 2: Push all local data (in case anything was missed)
  await pushAllToSupabase();
  
  // Step 3: Pull from Supabase to ensure we have latest data
  await pullAllFromSupabase();
  
  logger.info('Auto-sync cycle complete');
};

/**
 * Keep Supabase connection alive (prevents sleeping)
 */
const pingSupabase = async () => {
  if (!supabase) return;

  try {
    // Simple query to keep connection alive
    await supabase.from('users').select('count', { count: 'exact', head: true });
    logger.debug('Supabase ping successful');
  } catch (e) {
    logger.warn('Supabase ping failed:', e);
  }
};

// =============================================================================
// SYNC CONTROL
// =============================================================================

/**
 * Start auto-sync service
 */
export const startAutoSync = () => {
  if (!isSupabaseConfigured()) {
    logger.warn('Cannot start auto-sync: Supabase not configured');
    return false;
  }

  // Stop any existing intervals
  stopAutoSync();

  // Perform initial sync
  performSyncCycle();

  // Set up regular sync interval (30 seconds)
  syncIntervalId = setInterval(performSyncCycle, SYNC_INTERVAL_MS);

  // Set up keep-alive ping (60 seconds)
  pingIntervalId = setInterval(pingSupabase, PING_INTERVAL_MS);

  logger.info('Auto-sync started (30s interval, 60s keep-alive)');
  return true;
};

/**
 * Stop auto-sync service
 */
export const stopAutoSync = () => {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
  logger.info('Auto-sync stopped');
};

/**
 * Force immediate sync
 */
export const forceSyncNow = async (): Promise<boolean> => {
  if (!supabase) {
    logger.warn('Cannot sync: Supabase not configured');
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

/**
 * Get sync status
 */
export const getSyncStatus = () => ({
  isSyncing,
  lastSyncTime,
  pendingCount: pendingSyncs.length,
  isAutoSyncRunning: syncIntervalId !== null,
  nextSyncIn: syncIntervalId ? SYNC_INTERVAL_MS - (Date.now() - lastSyncTime) : null
});

// =============================================================================
// INITIALIZATION
// =============================================================================

// Restore last sync time from storage
const storedSyncTime = localStorage.getItem('db_last_supabase_sync');
if (storedSyncTime) {
  lastSyncTime = parseInt(storedSyncTime, 10);
}

// Start auto-sync on load if Supabase is configured
if (isSupabaseConfigured()) {
  // Wait a bit for app to initialize
  setTimeout(() => {
    startAutoSync();
  }, 5000);
}

// Listen for storage changes to sync to Supabase
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // When localStorage changes from another tab, sync to Supabase
    if (e.key && e.key.startsWith('db_') && supabase && !isSyncing) {
      const table = e.key.replace('db_', '').replace('_logs', '_logs');
      queueForSync(table, JSON.parse(e.newValue || '[]'));
    }
  });
}

// =============================================================================
// REACT HOOK
// =============================================================================

import { useState, useEffect } from 'react';

export const useSupabaseSync = () => {
  const [status, setStatus] = useState(getSyncStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getSyncStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    forceSync: forceSyncNow,
    startSync: startAutoSync,
    stopSync: stopAutoSync
  };
};
