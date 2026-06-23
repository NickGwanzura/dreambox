/**
 * End-to-End Integration Tests: Delete → Sync → Refresh Cycle
 *
 * Simulates the full lifecycle of deleting an invoice:
 *   1. Seed invoices into localStorage (simulating an existing app state)
 *   2. Delete an invoice via deleteInvoice() – removes from in-memory + localStorage,
 *      adds entry to deletedQueue, attempts remote DELETE (which fails)
 *   3. Force a sync cycle via forceSyncNow() – pullAllFromNeon() reads the
 *      deletedQueue and filters out the deleted invoice from the remote response
 *   4. Simulate a page refresh (re-load from localStorage)
 *   5. Verify the deleted invoice stays deleted
 *
 * This guards against the root cause: a failed remote DELETE followed by a sync
 * cycle that would have re-imported the deleted record.
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
// Global Mocks (shared across tests)
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

// Silence console noise during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// ============================================================
// Test Helpers
// ============================================================

function makeInvoiceData(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    clientId: 'CLI-001',
    contractId: 'CTR-001',
    date: '2025-03-15',
    items: [{ description: 'Monthly Rental', amount: 1000 }],
    subtotal: 1000,
    vatAmount: 0,
    total: 1000,
    status: 'Pending' as const,
    type: 'Invoice' as const,
    ...overrides,
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
 * Set auth token in localStorage so isConfigured() returns true.
 */
function setupAuth(): void {
  store['db_auth_token'] = 'test-jwt-token';
}

/**
 * Seed initial data into localStorage (simulating existing app state).
 */
function seedInitialData(): void {
  const invoices = [
    makeInvoiceData('INV-001'),
    makeInvoiceData('INV-002'),
    makeInvoiceData('INV-003'),
  ];
  store[STORAGE_KEYS.INVOICES] = JSON.stringify(invoices);
  store[STORAGE_KEYS.BILLBOARDS] = JSON.stringify([makeBillboardData('BB-001')]);
  store[STORAGE_KEYS.CONTRACTS] = JSON.stringify([makeContractData('CTR-001')]);
  store[STORAGE_KEYS.CLIENTS] = JSON.stringify([]);
}

/**
 * Setup fetch mock.
 *
 * For E2E tests we need two modes:
 * - DELETE /api/* → FAIL (simulating remote delete failure, the root cause)
 * - GET /api/invoices → returns all seed invoices (because remote "still has" them)
 * - GET /api/* → returns empty arrays
 */
function setupFetchMock(): void {
  const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
    if (options?.method === 'DELETE') {
      // Simulate remote delete failure (network error, server timeout, etc.)
      return Promise.reject(new Error('Simulated network error: DELETE failed'));
    }
    if (url.includes('/api/invoices')) {
      return Promise.resolve({
        json: vi.fn().mockResolvedValue([
          makeInvoiceData('INV-001'),
          makeInvoiceData('INV-002'),
          makeInvoiceData('INV-003'),
        ]),
        ok: true,
        status: 200,
      });
    }
    // All other endpoints return empty arrays
    return Promise.resolve({
      json: vi.fn().mockResolvedValue([]),
      ok: true,
      status: 200,
    });
  });
  globalThis.fetch = fetchMock;
}

/**
 * Simulate a page refresh by re-importing modules.
 * Returns the freshly imported mockData and neonSyncManager modules.
 */
async function simulateRefresh() {
  vi.resetModules();
  // Clear in-memory store (simulates browser tab close/reopen)
  // But keep localStorage (persisted between sessions)
  const mockData = await import('../services/mockData');
  const neonSync = await import('../services/neonSyncManager');
  return { mockData, neonSync };
}

// ============================================================
// Tests
// ============================================================

describe('E2E: Delete → Sync → Refresh Cycle', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. Core scenario: delete → sync → verify localStorage
  // ------------------------------------------------------------------
  it('deletes an invoice, force syncs, and keeps it deleted in localStorage', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    // Import modules (no auth at import time → auto-sync won't start)
    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Verify initial state
    expect(mockData.getInvoices()).toHaveLength(3);
    expect(mockData.getInvoices().map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-002', 'INV-003',
    ]);

    // Step 1: Delete INV-002
    mockData.deleteInvoice('INV-002');

    // Step 2: Verify removed from in-memory state
    expect(mockData.getInvoices()).toHaveLength(2);
    expect(mockData.getInvoices().map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);

    // Step 3: Verify deleted queue has the entry
    const deletedQueue = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
    expect(deletedQueue).toHaveLength(1);
    expect(deletedQueue[0]).toMatchObject({ table: 'invoices', id: 'INV-002' });
    expect(typeof deletedQueue[0].timestamp).toBe('number');

    // Step 4: Force sync (this calls pullAllFromNeon which reads the deleted queue)
    const syncResult = await neonSync.forceSyncNow();
    expect(syncResult).toBe(true);

    // Step 5: Verify localStorage directly (in-memory arrays aren't auto-refreshed
    // because the storage event listener is a no-op with mocked window.dispatchEvent)
    const storedInvoices = JSON.parse(store[STORAGE_KEYS.INVOICES] || '[]');
    expect(storedInvoices).toHaveLength(2);
    expect(storedInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);
    expect(storedInvoices.map((i: any) => i.id)).not.toContain('INV-002');
  });

  // ------------------------------------------------------------------
  // 2. Core scenario: delete → sync → refresh (re-import modules)
  // ------------------------------------------------------------------
  it('keeps the invoice deleted after a simulated page refresh', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-002
    mockData.deleteInvoice('INV-002');

    // Force sync
    await neonSync.forceSyncNow();

    // Simulate page refresh: re-import modules (modules read from localStorage on init)
    const refreshed = await simulateRefresh();
    const freshInvoices = refreshed.mockData.getInvoices();

    // INV-002 should still be gone after refresh
    expect(freshInvoices).toHaveLength(2);
    expect(freshInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);
    expect(freshInvoices.map((i: any) => i.id)).not.toContain('INV-002');

    // Verify deleted queue still has the entry (remote DELETE never succeeded)
    const deletedQueue = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
    expect(deletedQueue).toHaveLength(1);
    expect(deletedQueue[0]).toMatchObject({ table: 'invoices', id: 'INV-002' });
  });

  // ------------------------------------------------------------------
  // 3. Delete multiple invoices, sync, verify all stay deleted
  // ------------------------------------------------------------------
  it('keeps multiple deleted invoices gone after sync and refresh', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-001 and INV-003
    mockData.deleteInvoice('INV-001');
    mockData.deleteInvoice('INV-003');

    // Verify in-memory: only INV-002 remains
    expect(mockData.getInvoices()).toHaveLength(1);
    expect(mockData.getInvoices()[0].id).toBe('INV-002');

    // Force sync
    await neonSync.forceSyncNow();

    // Simulate refresh
    const refreshed = await simulateRefresh();
    const freshInvoices = refreshed.mockData.getInvoices();

    // Only INV-002 should remain
    expect(freshInvoices).toHaveLength(1);
    expect(freshInvoices[0].id).toBe('INV-002');
  });

  // ------------------------------------------------------------------
  // 4. Delete → sync twice → still deleted
  // ------------------------------------------------------------------
  it('survives multiple consecutive sync cycles', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-002
    mockData.deleteInvoice('INV-002');

    // Sync twice
    await neonSync.forceSyncNow();
    await neonSync.forceSyncNow();

    // Verify after two syncs
    const storedInvoices = JSON.parse(store[STORAGE_KEYS.INVOICES] || '[]');
    expect(storedInvoices).toHaveLength(2);
    expect(storedInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);
  });

  // ------------------------------------------------------------------
  // 5. Delete + create offline → sync → both changes persist
  // ------------------------------------------------------------------
  it('preserves a newly created offline invoice while filtering deleted ones during sync', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-002
    mockData.deleteInvoice('INV-002');

    // Create a new invoice offline (not yet in remote)
    mockData.addInvoice(makeInvoiceData('INV-OFFLINE-001'));

    // In-memory: should have INV-001, INV-003, INV-OFFLINE-001
    expect(mockData.getInvoices()).toHaveLength(3);
    expect(mockData.getInvoices().map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003', 'INV-OFFLINE-001',
    ]);

    // Force sync
    await neonSync.forceSyncNow();

    // Simulate refresh
    const refreshed = await simulateRefresh();
    const freshInvoices = refreshed.mockData.getInvoices();

    // Should have: INV-001, INV-003 (from remote, INV-002 filtered), INV-OFFLINE-001 (local-only merged)
    expect(freshInvoices).toHaveLength(3);
    expect(freshInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003', 'INV-OFFLINE-001',
    ]);
    expect(freshInvoices.map((i: any) => i.id)).not.toContain('INV-002');
  });

  // ------------------------------------------------------------------
  // 6. Delete a non-existent invoice → no crash, other data intact
  // ------------------------------------------------------------------
  it('gracefully handles deleting a non-existent invoice without crashing', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete a non-existent invoice (no-op, shouldn't crash)
    expect(() => mockData.deleteInvoice('INV-NONEXISTENT')).not.toThrow();

    // Should still have all 3 invoices
    expect(mockData.getInvoices()).toHaveLength(3);

    // Force sync should still work
    const syncResult = await neonSync.forceSyncNow();
    expect(syncResult).toBe(true);

    // All 3 invoices still present after sync
    const storedInvoices = JSON.parse(store[STORAGE_KEYS.INVOICES] || '[]');
    expect(storedInvoices).toHaveLength(3);
  });

  // ------------------------------------------------------------------
  // 7. Delete invoice from a contract that also gets deleted → cascade deletes + sync
  // ------------------------------------------------------------------
  it('handles cascade deletes (delete contract → deletes linked invoices) through sync', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // All 3 seed invoices have contractId 'CTR-001'
    // Delete contract CTR-001 → should cascade-delete INV-001, INV-002, INV-003
    mockData.deleteContract('CTR-001');

    // In-memory: all invoices should be gone (cascade)
    expect(mockData.getInvoices()).toHaveLength(0);

    // Force sync
    await neonSync.forceSyncNow();

    // Simulate refresh
    const refreshed = await simulateRefresh();
    const freshInvoices = refreshed.mockData.getInvoices();

    // All invoices should still be gone
    expect(freshInvoices).toHaveLength(0);

    // Deleted queue should have entries for contract + all 3 invoices
    const deletedQueue = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
    expect(deletedQueue.length).toBeGreaterThanOrEqual(4);
    const deletedIds = deletedQueue.map((e: any) => e.id);
    expect(deletedIds).toContain('CTR-001');
    expect(deletedIds).toContain('INV-001');
    expect(deletedIds).toContain('INV-002');
    expect(deletedIds).toContain('INV-003');
  });

  // ------------------------------------------------------------------
  // 8. Deleted queue entry persists while remote DELETE keeps failing,
  //    and pullAllFromNeon correctly filters it out
  // ------------------------------------------------------------------
  it('keeps deleted queue entry when remote DELETE fails and filters it during sync', async () => {
    seedInitialData();
    setupAuth();

    // Setup fetch where DELETE always fails
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === 'DELETE') {
        return Promise.reject(new Error('Simulated network error: DELETE failed'));
      }
      if (url.includes('/api/invoices')) {
        return Promise.resolve({
          json: vi.fn().mockResolvedValue([
            makeInvoiceData('INV-001'),
            makeInvoiceData('INV-002'),
            makeInvoiceData('INV-003'),
          ]),
          ok: true,
          status: 200,
        });
      }
      return Promise.resolve({
        json: vi.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
    });
    globalThis.fetch = fetchMock;

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-002 (DELETE fails — entry stays in queue)
    mockData.deleteInvoice('INV-002');

    // Wait for the async deleteFromApi to settle (it fails and logs the error)
    await vi.waitFor(() => {
      const q = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
      expect(q).toHaveLength(1);
      expect(q[0]).toMatchObject({ table: 'invoices', id: 'INV-002' });
    });

    // Force sync — pullAllFromNeon reads the deleted queue and filters INV-002
    await neonSync.forceSyncNow();

    // The deleted queue entry still exists (DELETE never succeeded)
    const deletedQueue = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
    expect(deletedQueue).toHaveLength(1);

    // But pullAllFromNeon filtered out INV-002 from localStorage
    const storedInvoices = JSON.parse(store[STORAGE_KEYS.INVOICES] || '[]');
    expect(storedInvoices.map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);
    expect(storedInvoices.map((i: any) => i.id)).not.toContain('INV-002');
  });

  // ------------------------------------------------------------------
  // 9. Full cycle: pending invoices get cancelled when contract ends, survive sync
  // ------------------------------------------------------------------
  it('cancels pending invoices when a contract ends, and they stay cancelled after sync', async () => {
    seedInitialData();
    setupAuth();
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // All seed invoices are 'Pending' and linked to CTR-001
    // End the contract → should cancel pending invoices
    mockData.endContract('CTR-001');

    // In-memory: invoices should be gone (cancelled)
    expect(mockData.getInvoices()).toHaveLength(0);

    // Force sync
    await neonSync.forceSyncNow();

    // Simulate refresh
    const refreshed = await simulateRefresh();
    const freshInvoices = refreshed.mockData.getInvoices();

    // All pending invoices should still be gone
    expect(freshInvoices).toHaveLength(0);

    // Deleted queue should have entries for the cancelled invoices
    const deletedQueue = JSON.parse(store[STORAGE_KEYS.DELETED_QUEUE] || '[]');
    const deletedIds = deletedQueue.map((e: any) => e.id);
    expect(deletedIds).toContain('INV-001');
    expect(deletedIds).toContain('INV-002');
    expect(deletedIds).toContain('INV-003');
  });

  // ------------------------------------------------------------------
  // 10. No auth → forceSyncNow returns true (function completed, but did nothing),
  //     and data integrity is preserved
  // ------------------------------------------------------------------
  it('does not sync when not authenticated but preserves local data integrity', async () => {
    seedInitialData();

    // Don't call setupAuth() — no auth token
    setupFetchMock();

    const mockData = await import('../services/mockData');
    const neonSync = await import('../services/neonSyncManager');

    // Delete INV-002 — works locally regardless of auth
    mockData.deleteInvoice('INV-002');

    // In-memory: INV-002 should be gone (local delete always works)
    expect(mockData.getInvoices()).toHaveLength(2);

    // forceSyncNow returns true because performSyncCycle catches
    // the "not configured" state silently (it's not an error, just nothing to do)
    const syncResult = await neonSync.forceSyncNow();
    expect(syncResult).toBe(true);

    // deleteInvoice() saved the filtered array to localStorage,
    // even without auth. So localStorage has 2 invoices.
    const storedInvoices = JSON.parse(store[STORAGE_KEYS.INVOICES] || '[]');
    expect(storedInvoices).toHaveLength(2);
    expect(storedInvoices.map((i: any) => i.id).sort()).toEqual(['INV-001', 'INV-003']);

    // Simulate refresh: the data survives because deleteInvoice already persisted locally
    const refreshed = await simulateRefresh();
    expect(refreshed.mockData.getInvoices()).toHaveLength(2);
    expect(refreshed.mockData.getInvoices().map((i: any) => i.id).sort()).toEqual([
      'INV-001', 'INV-003',
    ]);
  });
});
