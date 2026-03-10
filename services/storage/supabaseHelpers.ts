/**
 * Supabase Data Helpers
 * Comprehensive utilities for fetching, syncing, and managing data from Supabase
 */

import { supabase, isSupabaseConfigured, checkSupabaseConnection } from '../supabaseClient';
import { logger } from '../../utils/logger';

// Types for all entities
export interface SyncOptions {
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
  page?: number;
}

export interface SyncResult<T> {
  data: T[];
  count: number;
  error: string | null;
  hasMore: boolean;
}

export interface RealtimeCallbacks {
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

// =============================================================================
// CONNECTION & HEALTH CHECKS
// =============================================================================

/**
 * Check if Supabase is properly configured and connected
 */
export const checkSupabaseHealth = async (): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
}> => {
  const configured = isSupabaseConfigured();
  
  if (!configured) {
    return {
      configured: false,
      connected: false,
      error: 'Supabase environment variables not set'
    };
  }

  try {
    const connected = await checkSupabaseConnection();
    return {
      configured: true,
      connected,
      error: connected ? undefined : 'Failed to connect to Supabase'
    };
  } catch (e: any) {
    return {
      configured: true,
      connected: false,
      error: e.message || 'Unknown connection error'
    };
  }
};

/**
 * Wait for Supabase connection with retry
 */
export const waitForSupabase = async (
  maxRetries: number = 5,
  delayMs: number = 1000
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    const health = await checkSupabaseHealth();
    if (health.connected) return true;
    
    if (i < maxRetries - 1) {
      logger.info(`Supabase connection attempt ${i + 1}/${maxRetries} failed, retrying...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
};

// =============================================================================
// GENERIC FETCH HELPERS
// =============================================================================

/**
 * Generic fetch all records from a table
 */
export const fetchAll = async <T>(
  table: string,
  options: SyncOptions = {}
): Promise<SyncResult<T>> => {
  if (!supabase) {
    return { data: [], count: 0, error: 'Supabase not configured', hasMore: false };
  }

  const {
    limit = 1000,
    orderBy = 'created_at',
    orderDirection = 'desc',
    page = 1
  } = options;

  try {
    let query = supabase
      .from(table)
      .select('*', { count: 'exact' });

    // Apply filters if provided
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data, error, count } = await query
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(start, end);

    if (error) {
      logger.error(`Error fetching ${table}:`, error);
      return { data: [], count: 0, error: error.message, hasMore: false };
    }

    return {
      data: (data || []) as T[],
      count: count || 0,
      error: null,
      hasMore: count ? (start + (data?.length || 0)) < count : false
    };

  } catch (e: any) {
    logger.error(`Exception fetching ${table}:`, e);
    return { data: [], count: 0, error: e.message, hasMore: false };
  }
};

/**
 * Fetch a single record by ID
 */
export const fetchById = async <T>(
  table: string,
  id: string
): Promise<{ data: T | null; error: string | null }> => {
  if (!supabase) {
    return { data: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error(`Error fetching ${table} by id:`, error);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (e: any) {
    logger.error(`Exception fetching ${table} by id:`, e);
    return { data: null, error: e.message };
  }
};

/**
 * Fetch records by a specific field value
 */
export const fetchByField = async <T>(
  table: string,
  field: string,
  value: any
): Promise<SyncResult<T>> => {
  return fetchAll<T>(table, { filters: { [field]: value } });
};

/**
 * Search records with text matching
 */
export const searchRecords = async <T>(
  table: string,
  searchFields: string[],
  searchTerm: string,
  options: SyncOptions = {}
): Promise<SyncResult<T>> => {
  if (!supabase) {
    return { data: [], count: 0, error: 'Supabase not configured', hasMore: false };
  }

  try {
    let query = supabase.from(table).select('*', { count: 'exact' });

    // Build OR filter for search fields
    if (searchTerm && searchFields.length > 0) {
      const orConditions = searchFields
        .map(field => `${field}.ilike.%${searchTerm}%`)
        .join(',');
      query = query.or(orConditions);
    }

    const { data, error, count } = await query
      .limit(options.limit || 100)
      .order(options.orderBy || 'created_at', { 
        ascending: options.orderDirection === 'asc' 
      });

    if (error) {
      logger.error(`Error searching ${table}:`, error);
      return { data: [], count: 0, error: error.message, hasMore: false };
    }

    return {
      data: (data || []) as T[],
      count: count || 0,
      error: null,
      hasMore: false
    };

  } catch (e: any) {
    logger.error(`Exception searching ${table}:`, e);
    return { data: [], count: 0, error: e.message, hasMore: false };
  }
};

// =============================================================================
// ENTITY-SPECIFIC HELPERS
// =============================================================================

/**
 * Fetch users from Supabase with auth data
 */
export const fetchUsersFromSupabase = async (options: SyncOptions = {}) => {
  return fetchAll('users', options);
};

/**
 * Fetch billboards with optional location filtering
 */
export const fetchBillboardsFromSupabase = async (options: SyncOptions = {}) => {
  return fetchAll('billboards', options);
};

/**
 * Fetch clients with search capability
 */
export const fetchClientsFromSupabase = async (
  searchTerm?: string,
  options: SyncOptions = {}
) => {
  if (searchTerm) {
    return searchRecords('clients', ['company_name', 'contact_person', 'email'], searchTerm, options);
  }
  return fetchAll('clients', options);
};

/**
 * Fetch contracts with related data
 */
export const fetchContractsFromSupabase = async (options: SyncOptions = {}) => {
  return fetchAll('contracts', { ...options, orderBy: 'start_date' });
};

/**
 * Fetch invoices with status filtering
 */
export const fetchInvoicesFromSupabase = async (
  status?: string,
  options: SyncOptions = {}
) => {
  const filters = status ? { status } : {};
  return fetchAll('invoices', { ...options, filters, orderBy: 'date' });
};

/**
 * Fetch tasks with priority/assignment filtering
 */
export const fetchTasksFromSupabase = async (
  assignedTo?: string,
  status?: string,
  options: SyncOptions = {}
) => {
  const filters: Record<string, any> = {};
  if (assignedTo) filters.assigned_to = assignedTo;
  if (status) filters.status = status;
  
  return fetchAll('tasks', { ...options, filters, orderBy: 'due_date' });
};

/**
 * Fetch maintenance logs for a specific billboard
 */
export const fetchMaintenanceLogsFromSupabase = async (
  billboardId?: string,
  options: SyncOptions = {}
) => {
  const filters = billboardId ? { billboard_id: billboardId } : {};
  return fetchAll('maintenance_logs', { ...options, filters, orderBy: 'date' });
};

/**
 * Fetch expenses with category filtering
 */
export const fetchExpensesFromSupabase = async (
  category?: string,
  options: SyncOptions = {}
) => {
  const filters = category ? { category } : {};
  return fetchAll('expenses', { ...options, filters, orderBy: 'date' });
};

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

const activeSubscriptions: Map<string, any> = new Map();

/**
 * Subscribe to realtime changes on a table
 */
export const subscribeToTable = (
  table: string,
  callbacks: RealtimeCallbacks,
  filter?: string
): (() => void) => {
  if (!supabase) {
    logger.warn('Cannot subscribe: Supabase not configured');
    return () => {};
  }

  // Unsubscribe existing subscription for this table if any
  const existingKey = filter ? `${table}:${filter}` : table;
  if (activeSubscriptions.has(existingKey)) {
    activeSubscriptions.get(existingKey).unsubscribe();
  }

  let channel = supabase.channel(`${table}-changes`);

  // Apply filter if provided
  if (filter) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter },
      (payload) => handleRealtimePayload(payload, callbacks)
    );
  } else {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => handleRealtimePayload(payload, callbacks)
    );
  }

  const subscription = channel.subscribe();
  activeSubscriptions.set(existingKey, subscription);

  logger.info(`Subscribed to realtime changes for ${table}`);

  // Return unsubscribe function
  return () => {
    subscription.unsubscribe();
    activeSubscriptions.delete(existingKey);
    logger.info(`Unsubscribed from ${table}`);
  };
};

const handleRealtimePayload = (
  payload: any,
  callbacks: RealtimeCallbacks
) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  switch (eventType) {
    case 'INSERT':
      callbacks.onInsert?.(newRecord);
      break;
    case 'UPDATE':
      callbacks.onUpdate?.(newRecord);
      break;
    case 'DELETE':
      callbacks.onDelete?.(oldRecord);
      break;
  }
};

/**
 * Unsubscribe from all realtime subscriptions
 */
export const unsubscribeAll = (): void => {
  activeSubscriptions.forEach((sub, key) => {
    sub.unsubscribe();
    logger.info(`Unsubscribed from ${key}`);
  });
  activeSubscriptions.clear();
};

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/**
 * Bulk insert records
 */
export const bulkInsert = async <T>(
  table: string,
  records: Partial<T>[]
): Promise<{ data: T[] | null; error: string | null }> => {
  if (!supabase) {
    return { data: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .insert(records)
      .select();

    if (error) {
      logger.error(`Error bulk inserting into ${table}:`, error);
      return { data: null, error: error.message };
    }

    return { data: data as T[], error: null };
  } catch (e: any) {
    logger.error(`Exception bulk inserting into ${table}:`, e);
    return { data: null, error: e.message };
  }
};

/**
 * Bulk update records
 */
export const bulkUpdate = async <T>(
  table: string,
  records: Partial<T>[]
): Promise<{ data: T[] | null; error: string | null }> => {
  if (!supabase) {
    return { data: null, error: 'Supabase not configured' };
  }

  try {
    // Supabase doesn't have a native bulk update, so we use upsert
    const { data, error } = await supabase
      .from(table)
      .upsert(records)
      .select();

    if (error) {
      logger.error(`Error bulk updating ${table}:`, error);
      return { data: null, error: error.message };
    }

    return { data: data as T[], error: null };
  } catch (e: any) {
    logger.error(`Exception bulk updating ${table}:`, e);
    return { data: null, error: e.message };
  }
};

/**
 * Bulk delete records
 */
export const bulkDelete = async (
  table: string,
  ids: string[]
): Promise<{ error: string | null; deletedCount: number }> => {
  if (!supabase) {
    return { error: 'Supabase not configured', deletedCount: 0 };
  }

  try {
    const { error, count } = await supabase
      .from(table)
      .delete()
      .in('id', ids);

    if (error) {
      logger.error(`Error bulk deleting from ${table}:`, error);
      return { error: error.message, deletedCount: 0 };
    }

    return { error: null, deletedCount: count || 0 };
  } catch (e: any) {
    logger.error(`Exception bulk deleting from ${table}:`, e);
    return { error: e.message, deletedCount: 0 };
  }
};

// =============================================================================
// SYNC & BACKUP HELPERS
// =============================================================================

/**
 * Full database export for backup
 */
export const exportAllData = async (): Promise<{
  data: Record<string, any[]> | null;
  error: string | null;
}> => {
  const tables = [
    'users', 'billboards', 'clients', 'contracts', 'invoices',
    'expenses', 'tasks', 'maintenance_logs', 'outsourced_billboards',
    'printing_jobs', 'company_profile'
  ];

  const result: Record<string, any[]> = {};

  for (const table of tables) {
    const { data, error } = await fetchAll(table, { limit: 10000 });
    if (error) {
      logger.error(`Error exporting ${table}:`, error);
      result[table] = [];
    } else {
      result[table] = data;
    }
  }

  return { data: result, error: null };
};

/**
 * Import data from backup (use with caution!)
 */
export const importAllData = async (
  data: Record<string, any[]>,
  clearExisting: boolean = false
): Promise<{ success: boolean; errors: string[] }> => {
  const errors: string[] = [];

  for (const [table, records] of Object.entries(data)) {
    if (clearExisting) {
      // Fetch all existing IDs and delete them
      const { data: existing } = await fetchAll(table, { limit: 10000 });
      if (existing?.length) {
        const ids = existing.map((r: any) => r.id);
        await bulkDelete(table, ids);
      }
    }

    if (records.length > 0) {
      const { error } = await bulkInsert(table, records);
      if (error) {
        errors.push(`${table}: ${error}`);
      }
    }
  }

  return { success: errors.length === 0, errors };
};

/**
 * Get database stats
 */
export const getDatabaseStats = async (): Promise<{
  tables: Record<string, number>;
  totalRecords: number;
  error?: string;
}> => {
  const tables = [
    'users', 'billboards', 'clients', 'contracts', 'invoices',
    'expenses', 'tasks', 'maintenance_logs'
  ];

  const stats: Record<string, number> = {};
  let total = 0;

  for (const table of tables) {
    const { count, error } = await fetchAll(table, { limit: 1 });
    if (error) {
      stats[table] = -1;
    } else {
      stats[table] = count;
      total += count;
    }
  }

  return { tables: stats, totalRecords: total };
};

// =============================================================================
// HOOKS FOR REACT
// =============================================================================

import { useState, useEffect, useCallback } from 'react';

/**
 * React hook for fetching data from Supabase
 */
export function useSupabaseQuery<T>(
  table: string,
  options: SyncOptions = {},
  deps: any[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await fetchAll<T>(table, options);
    
    setData(result.data);
    setError(result.error);
    setHasMore(result.hasMore);
    setLoading(false);

    return result;
  }, [table, JSON.stringify(options)]);

  useEffect(() => {
    fetchData();
  }, deps);

  return { data, loading, error, hasMore, refetch: fetchData };
}

/**
 * React hook for realtime subscription
 */
export function useSupabaseRealtime<T>(
  table: string,
  options: { filter?: string; enabled?: boolean } = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (options.enabled === false) return;

    // Initial fetch
    fetchAll<T>(table).then(result => {
      if (result.data) setData(result.data);
    });

    // Subscribe to changes
    const unsubscribe = subscribeToTable(table, {
      onInsert: (record) => {
        setData(prev => [record, ...prev]);
      },
      onUpdate: (record) => {
        setData(prev => prev.map(item => 
          (item as any).id === record.id ? record : item
        ));
      },
      onDelete: (record) => {
        setData(prev => prev.filter(item => (item as any).id !== record.id));
      }
    }, options.filter);

    setIsSubscribed(true);

    return () => {
      unsubscribe();
      setIsSubscribed(false);
    };
  }, [table, options.filter, options.enabled]);

  return { data, setData, isSubscribed };
}
