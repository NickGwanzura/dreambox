import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../services/constants';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(key => delete store[key]); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

describe('database sync failure reporting', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorageMock.clear();
    store[STORAGE_KEYS.AUTH_TOKEN] = 'test-token';
  });

  it('reports failure when any requested remote table returns a non-2xx response', async () => {
    globalThis.fetch = vi.fn(async (url: string) => ({
      ok: !url.includes('/api/contracts'),
      status: url.includes('/api/contracts') ? 503 : 200,
      json: async () => [],
    })) as any;
    const { getSyncStatus, pullAllFromDatabase } = await import('../services/databaseSyncManager');

    const result = await pullAllFromDatabase();

    expect(result.success).toBe(false);
    expect(result.results.contracts).toEqual({ count: 0, error: 'Remote contracts pull failed (HTTP 503)' });
    expect(getSyncStatus().lastSyncOutcome).toBe('failed');
  });

  it('does not report a force sync as successful when no remote sync can run', async () => {
    localStorageMock.clear();
    const { forceSyncNow } = await import('../services/databaseSyncManager');

    await expect(forceSyncNow()).resolves.toBe(false);
  });

  it('marks the first fully successful pull as successful and records its timestamp', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })) as any;
    const { getSyncStatus, pullAllFromDatabase } = await import('../services/databaseSyncManager');

    expect(getSyncStatus()).toMatchObject({ lastSyncOutcome: 'never', lastSyncTime: 0 });
    await expect(pullAllFromDatabase()).resolves.toMatchObject({ success: true });
    expect(getSyncStatus()).toMatchObject({ lastSyncOutcome: 'success' });
    expect(getSyncStatus().lastSyncTime).toBeGreaterThan(0);
  });

  it('fetches every remote page before merging a table into local storage', async () => {
    const firstInvoicePage = Array.from({ length: 500 }, (_, index) => ({ id: `invoice-${index}` }));
    const finalInvoicePage = [{ id: 'invoice-500' }];
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === '/api/invoices?limit=500&skip=0') {
        return { ok: true, status: 200, json: async () => firstInvoicePage };
      }
      if (url === '/api/invoices?limit=500&skip=500') {
        return { ok: true, status: 200, json: async () => finalInvoicePage };
      }
      return { ok: true, status: 200, json: async () => [] };
    }) as any;
    const { pullAllFromDatabase } = await import('../services/databaseSyncManager');

    const result = await pullAllFromDatabase();

    expect(result).toMatchObject({ success: true, results: { invoices: { count: 501 } } });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/invoices?limit=500&skip=0', expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/invoices?limit=500&skip=500', expect.any(Object));
    expect(JSON.parse(store[STORAGE_KEYS.INVOICES])).toEqual([...firstInvoicePage, ...finalInvoicePage]);
  });

  it('keeps a table cache unchanged when a later page fails and marks sync failed', async () => {
    const existingCache = JSON.stringify([{ id: 'local-invoice', amount: 99 }]);
    store[STORAGE_KEYS.INVOICES] = existingCache;
    const firstInvoicePage = Array.from({ length: 500 }, (_, index) => ({ id: `invoice-${index}` }));
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === '/api/invoices?limit=500&skip=0') {
        return { ok: true, status: 200, json: async () => firstInvoicePage };
      }
      if (url === '/api/invoices?limit=500&skip=500') {
        return { ok: false, status: 502, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => [] };
    }) as any;
    const { getSyncStatus, pullAllFromDatabase } = await import('../services/databaseSyncManager');

    const result = await pullAllFromDatabase();

    expect(result.success).toBe(false);
    expect(result.results.invoices).toEqual({ count: 0, error: 'Remote invoices pull failed (HTTP 502)' });
    expect(store[STORAGE_KEYS.INVOICES]).toBe(existingCache);
    expect(getSyncStatus().lastSyncOutcome).toBe('failed');
  });
});
