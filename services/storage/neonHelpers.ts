/**
 * Neon Database Helpers
 * Generic fetch/query utilities using the API client backed by Neon PostgreSQL.
 */

import { api, isConfigured } from '../apiClient';
import { logger } from '../../utils/logger';

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

// ============================================================
// CONNECTION & HEALTH CHECKS
// ============================================================

export const checkNeonHealth = async (): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
}> => {
  if (!isConfigured()) {
    return { configured: false, connected: false, error: 'Not authenticated' };
  }
  try {
    await api.get('/api/auth/me');
    return { configured: true, connected: true };
  } catch (e: any) {
    return { configured: true, connected: false, error: e.message };
  }
};

export const waitForNeon = async (
  maxRetries = 5,
  delayMs = 1000
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    const health = await checkNeonHealth();
    if (health.connected) return true;
    if (i < maxRetries - 1) {
      logger.info(
        `Neon connection attempt ${i + 1}/${maxRetries} failed, retrying...`
      );
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
};

// ============================================================
// GENERIC FETCH HELPERS
// ============================================================

export const fetchAll = async <T>(
  table: string,
  options: SyncOptions = {}
): Promise<SyncResult<T>> => {
  try {
    const params: Record<string, string> = {};
    if (options.limit) params.limit = String(options.limit);
    if (options.page) params.page = String(options.page);
    if (options.orderBy) params.orderBy = options.orderBy;
    if (options.orderDirection) params.orderDirection = options.orderDirection;
    if (options.filters) {
      Object.entries(options.filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params[`filter_${k}`] = String(v);
      });
    }

    const data = await api.get<T[]>(`/api/${table}`, params);
    const limit = options.limit ?? Infinity;
    return {
      data,
      count: data.length,
      error: null,
      hasMore: data.length >= limit,
    };
  } catch (e: any) {
    logger.error(`fetchAll error for ${table}:`, e);
    return { data: [], count: 0, error: e.message, hasMore: false };
  }
};

export const fetchById = async <T>(
  table: string,
  id: string
): Promise<T | null> => {
  try {
    return await api.get<T>(`/api/${table}`, { id });
  } catch (e: any) {
    logger.error(`fetchById error for ${table}/${id}:`, e);
    return null;
  }
};

export const upsertRecord = async <T>(
  table: string,
  record: T & { id?: string }
): Promise<T | null> => {
  try {
    if (record.id) {
      return await api.put<T>(`/api/${table}`, record, { id: record.id });
    }
    return await api.post<T>(`/api/${table}`, record);
  } catch (e: any) {
    logger.error(`upsertRecord error for ${table}:`, e);
    return null;
  }
};

export const deleteRecord = async (
  table: string,
  id: string
): Promise<boolean> => {
  try {
    await api.delete(`/api/${table}`, { id });
    return true;
  } catch (e: any) {
    logger.error(`deleteRecord error for ${table}/${id}:`, e);
    return false;
  }
};

// ============================================================
// BACKUP & STATS
// ============================================================

const BACKUP_TABLES = [
  'billboards',
  'clients',
  'contracts',
  'invoices',
  'expenses',
  'users',
  'tasks',
  'maintenance',
  'outsourced',
  'printing-jobs',
];

export const getDatabaseStats = async (): Promise<{
  tables: Record<string, number>;
  totalRecords: number;
}> => {
  // Try a dedicated count endpoint first; fall back to full fetch
  const tables: Record<string, number> = {};
  let totalRecords = 0;

  await Promise.allSettled(
    BACKUP_TABLES.map(async table => {
      try {
        // Attempt a lightweight count request
        const data = await api.get<any>(`/api/${table}`, { count: 'true' });
        if (typeof data === 'number') {
          tables[table] = data;
        } else if (typeof data?.count === 'number') {
          tables[table] = data.count;
        } else if (Array.isArray(data)) {
          tables[table] = data.length;
        } else {
          tables[table] = 0;
        }
        totalRecords += tables[table];
      } catch {
        tables[table] = -1;
      }
    })
  );

  return { tables, totalRecords };
};

export const exportAllData = async (): Promise<{
  data: Record<string, any[]> | null;
  error: string | null;
}> => {
  try {
    const result: Record<string, any[]> = {};
    await Promise.allSettled(
      BACKUP_TABLES.map(async table => {
        try {
          const data = await api.get<any[]>(`/api/${table}`);
          result[table] = Array.isArray(data) ? data : [];
        } catch {
          result[table] = [];
        }
      })
    );
    return { data: result, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
};

// Legacy compatibility aliases (deprecated — use Neon names)
export const checkSupabaseHealth = checkNeonHealth;
export const waitForSupabase = waitForNeon;
