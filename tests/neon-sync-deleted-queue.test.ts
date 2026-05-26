/**
 * Neon Sync Deleted-Queue Filter Tests
 *
 * Validates that pullAllFromNeon() correctly filters out records whose IDs
 * appear in the persisted db_deleted_queue, preventing deleted invoices
 * (and other records) from being re-imported when the remote DELETE failed.
 *
 * The key scenario:
 *   1. User deletes an invoice → deleteInvoice() removes it locally and adds
 *      its {table, id} to db_deleted_queue
 *   2. The remote DELETE call fails (network blip, server error, etc.)
 *   3. On the next 30s sync cycle, pullAllFromNeon() fetches ALL records from
 *      the API — including the one that was supposed to be deleted
 *   4. Before writing to localStorage, it reads the deleted queue and filters
 *      out any records whose IDs match
 *   5. The deleted invoice stays deleted locally ✓
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../services/constants';

// ============================================================
// Polyfills for Node.js test environment
// ============================================================

if (typeof CustomEvent === 'undefined') {
  class CustomEventPolyfill extends Event {
    detail: any;
    constructor(event: string, params?: Record<string, any>) {
      super(event, params);
      this.detail = params?.detail ?? null;
    }
  }
  (globalThis as any).CustomEvent = CustomEventPolyfill;
}

if (typeof StorageEvent === 'undefined') {
  class StorageEventPolyfill extends Event {
    key: string | null = null;
    newValue: string | null = null;
    oldValue: string | null = null;
    url: string = '';
    storageArea: Storage | null = null;
    constructor(type: string, init?: Record<string, any>) {
      super(type, init);
      this.key = init?.key ?? null;
      this.newValue = init?.newValue ?? null;
      this.oldValue = init?.oldValue ?? null;
      this.url = init?.url ?? '';
      this.storageArea = init?.storageArea ?? null;
    }
  }
  (globalThis as any).StorageEvent = StorageEventPolyfill;
}

// ============================================================
// Global Mocks
// ============================================================

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    Object.keys(store).forEach(k => delete store[k]);
  },
  get length(): number {
    return Object.keys(store).length;
  },
  key: (idx: number): string | null => Object.keys(store)[idx] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { reload: vi.fn(), origin: 'http://localhost:3000' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  },
  writable: true,
});

// ============================================================
// Test Helpers
// ============================================================

function makeInvoiceData(id: string) {
  return {
    id,
    clientId: 'CLI-001',
    contractId: 'CTR-001',
    date: '2025-03-15',
    items: [{ description: 'Monthly Rental', amount: 1000 }],
    subtotal: 1000,
    vatAmount: 0,
    total: 1000,
    status: 'Pending',
    type: 'Invoice' as const,
  };
}

function makeBillboardData(id: string) {
  return {
    id,
    name: 'Test Billboard ' + id,
    location: 'Test Location',
    town: 'Harare',
    type: 'Static',
    width: 12,
    height: 3,
    coordinates: { lat: -17.825, lng: 31.033 },
  };
}

function makeContractData(id: string) {
  return {
    id,
    clientId: 'CLI-001',
    billboardId: 'BB-001',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    monthlyRate: 1000,
    installationCost: 0,
    printingCost: 0,
    productionCost: 0,
    hasVat: false,
    totalContractValue: 12000,
    status: 'Active' as const,
    details: 'Side A',
    side: 'A' as const,
  };
}

/**
 * Setup auth token in localStorage so isConfigured() returns true.
 */
function setupAuth(): void {
  store['db_auth_token'] = 'test-jwt-token';
}

/**
 * Setup the deleted queue in localStorage with the given entries.
 * Entries automatically get a recent timestamp so the purge logic
 * in pullAllFromNeon() doesn't remove them as stale.
 */
function setupDeletedQueue(entries: { table: string; id: string }[]): void {
  const now = Date.now();
  const queue = entries.map(e => ({ ...e, timestamp: now }));
  store[STORAGE_KEYS.DELETED_QUEUE] = JSON.stringify(queue);
}

/**
 * Setup the fetch mock to return specific data for matching URL paths
 * and empty arrays for all other endpoints.
 */
function setupFetchMock(overrides: Record<string, any[]>): void {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    for (const [path, data] of Object.entries(overrides)) {
      if (url.includes(path)) {
        return Promise.resolve({
          json: vi.fn().mockResolvedValue(data),
          ok: true,
          status: 200,
        });
      }
    }
    // Default: empty array for all other endpoints
    return Promise.resolve({
      json: vi.fn().mockResolvedValue([]),
      ok: true,
      status: 200,
    });
  });
  globalThis.fetch = fetchMock;
}

// ============================================================
// Tests
// ============================================================

describe('Neon Sync: Deleted Queue Filter', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. Core scenario: deleted invoice filtered during pull
  // ------------------------------------------------------------------
  it('filters out deleted invoices when remote DELETE failed', async () => {
    // Setup: INV-002 is in the deleted queue
    setupDeletedQueue([{ table: 'invoices', id: 'INV-002' }]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'), // ← Remote still has it (DELETE failed)
        makeInvoiceData('INV-003'),
      ],
    });

    // Import the module (no token present at import time → no auto-sync)
    const mod = await import('../services/neonSyncManager');

    // Invoke the pull cycle
    const result = await mod.pullAllFromNeon();

    // Should succeed
    expect(result.success).toBe(true);
    expect(result.results['invoices']?.count).toBe(2);

    // After the pull, localStorage should have only INV-001 and INV-003
    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    const storedIds = storedInvoices.map((i: any) => i.id).sort();
    expect(storedIds).toEqual(['INV-001', 'INV-003']);
    expect(storedIds).not.toContain('INV-002');
  });

  // ------------------------------------------------------------------
  // 2. Non-deleted invoices remain after pull
  // ------------------------------------------------------------------
  it('preserves non-deleted invoices when filtering', async () => {
    setupDeletedQueue([{ table: 'invoices', id: 'INV-002' }]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
        makeInvoiceData('INV-003'),
        makeInvoiceData('INV-004'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    const storedIds = storedInvoices.map((i: any) => i.id).sort();
    // INV-002 is filtered out, INV-001, INV-003, INV-004 remain
    expect(storedIds).toEqual(['INV-001', 'INV-003', 'INV-004']);
  });

  // ------------------------------------------------------------------
  // 3. Other tables are unaffected by invoice deletion
  // ------------------------------------------------------------------
  it('does not filter records from other tables', async () => {
    setupDeletedQueue([{ table: 'invoices', id: 'INV-002' }]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
      ],
      '/api/billboards': [
        makeBillboardData('BB-001'),
        makeBillboardData('BB-002'),
      ],
      '/api/contracts': [
        makeContractData('CTR-001'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    // Invoices: INV-002 filtered out
    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices.map((i: any) => i.id)).toEqual(['INV-001']);

    // Billboards: both preserved
    const storedBillboards: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.BILLBOARDS) || '[]',
    );
    expect(storedBillboards.map((b: any) => b.id).sort()).toEqual([
      'BB-001',
      'BB-002',
    ]);

    // Contracts: preserved
    const storedContracts: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.CONTRACTS) || '[]',
    );
    expect(storedContracts.map((c: any) => c.id)).toEqual(['CTR-001']);
  });

  // ------------------------------------------------------------------
  // 4. Empty deleted queue: all records pass through
  // ------------------------------------------------------------------
  it('passes all records when deleted queue is empty', async () => {
    setupDeletedQueue([]); // explicitly empty
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
        makeInvoiceData('INV-003'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices).toHaveLength(3);
    expect(storedInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001',
      'INV-002',
      'INV-003',
    ]);
  });

  // ------------------------------------------------------------------
  // 5. No deleted queue key in localStorage: all records pass through
  // ------------------------------------------------------------------
  it('passes all records when deleted queue key is absent', async () => {
    // Don't set up deleted queue at all — key doesn't exist in localStorage
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // 6. Malformed deleted queue: doesn't crash, all records pass through
  // ------------------------------------------------------------------
  it('handles malformed deleted queue gracefully without crashing', async () => {
    store[STORAGE_KEYS.DELETED_QUEUE] = 'not valid json{{{';
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    const result = await mod.pullAllFromNeon();

    // Should succeed (best-effort: catch block handles parse error)
    expect(result.success).toBe(true);

    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // 7. Multiple deleted records across different tables
  // ------------------------------------------------------------------
  it('filters deleted records from multiple tables simultaneously', async () => {
    setupDeletedQueue([
      { table: 'invoices', id: 'INV-001' },
      { table: 'billboards', id: 'BB-002' },
      { table: 'contracts', id: 'CTR-002' },
    ]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'),
        makeInvoiceData('INV-003'),
      ],
      '/api/billboards': [
        makeBillboardData('BB-001'),
        makeBillboardData('BB-002'),
        makeBillboardData('BB-003'),
      ],
      '/api/contracts': [
        makeContractData('CTR-001'),
        makeContractData('CTR-002'),
        makeContractData('CTR-003'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    const result = await mod.pullAllFromNeon();

    expect(result.success).toBe(true);

    // Invoices: INV-001 filtered
    const invoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(invoices.map((i: any) => i.id).sort()).toEqual([
      'INV-002',
      'INV-003',
    ]);

    // Billboards: BB-002 filtered
    const billboards: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.BILLBOARDS) || '[]',
    );
    expect(billboards.map((b: any) => b.id).sort()).toEqual([
      'BB-001',
      'BB-003',
    ]);

    // Contracts: CTR-002 filtered
    const contracts: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.CONTRACTS) || '[]',
    );
    expect(contracts.map((c: any) => c.id).sort()).toEqual([
      'CTR-001',
      'CTR-003',
    ]);
  });

  // ------------------------------------------------------------------
  // 8. Local-only records are preserved alongside filtered remote records
  // ------------------------------------------------------------------
  it('preserves local-only records not in remote while filtering deleted', async () => {
    // Local storage has a record that was created offline (not yet synced)
    store[STORAGE_KEYS.INVOICES] = JSON.stringify([
      makeInvoiceData('INV-LOCAL-001'), // local-only, not in remote
    ]);

    setupDeletedQueue([{ table: 'invoices', id: 'INV-002' }]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
        makeInvoiceData('INV-002'), // deleted, but remote still has it
        makeInvoiceData('INV-003'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    // INV-002 should be filtered out, INV-LOCAL-001 should be merged in
    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    const storedIds = storedInvoices.map((i: any) => i.id).sort();
    expect(storedIds).toEqual(['INV-001', 'INV-003', 'INV-LOCAL-001']);
    expect(storedIds).not.toContain('INV-002');
  });

  // ------------------------------------------------------------------
  // 9. Not authenticated: pullAllFromNeon returns early (no filtering performed)
  // ------------------------------------------------------------------
  it('returns early when not authenticated without corrupting data', async () => {
    // No auth token set
    setupDeletedQueue([{ table: 'invoices', id: 'INV-001' }]);
    // Don't call setupAuth()

    // Pre-existing data in localStorage
    store[STORAGE_KEYS.INVOICES] = JSON.stringify([
      makeInvoiceData('INV-001'),
    ]);

    const mod = await import('../services/neonSyncManager');
    const result = await mod.pullAllFromNeon();

    // Should return without doing anything
    expect(result.success).toBe(false);
    expect(Object.keys(result.results)).toHaveLength(0);

    // Existing data should be untouched
    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices).toHaveLength(1);
    expect(storedInvoices[0].id).toBe('INV-001');
  });

  // ------------------------------------------------------------------
  // 10. Deleted queue with no matching table in TABLE_MAP is ignored
  // ------------------------------------------------------------------
  it('ignores deleted queue entries for unknown tables', async () => {
    setupDeletedQueue([
      { table: 'nonexistent-table', id: 'REC-001' },
    ]);
    setupAuth();
    setupFetchMock({
      '/api/invoices': [
        makeInvoiceData('INV-001'),
      ],
    });

    const mod = await import('../services/neonSyncManager');
    await mod.pullAllFromNeon();

    // Should not crash, INV-001 should be present
    const storedInvoices: any[] = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.INVOICES) || '[]',
    );
    expect(storedInvoices).toHaveLength(1);
    expect(storedInvoices[0].id).toBe('INV-001');
  });
});
