import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Invoice, Contract } from '../types';

// ============================================================
// Mock environment — must run BEFORE importing mockData / analytics
// ============================================================
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'window', {
  value: { location: { reload: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  writable: true,
});
globalThis.fetch = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}), ok: true });

import { classifyInvoiceRevenue } from '../services/profitAnalytics';

// ============================================================
// Helpers
// ============================================================
const inv = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'INV-001', contractId: 'CTR-001', clientId: 'CLI-001',
  date: '2025-06-01',
  items: [{ description: 'Rental', amount: 1000, quantity: 1, unitPrice: 1000 }],
  subtotal: 1000, vatAmount: 130, total: 1130, status: 'Pending',
  type: 'Invoice', discountAmount: 0,
  ...overrides,
});

// ============================================================
// classifyInvoiceRevenue
// ============================================================
describe('classifyInvoiceRevenue', () => {
  it('falls back to all-recurring when no matching contract exists', () => {
    const result = classifyInvoiceRevenue(inv({ total: 999 }));
    expect(result.recurring).toBe(999);
    expect(result.oneTime).toBe(0);
  });

  it('returns non-negative values', () => {
    const result = classifyInvoiceRevenue(inv());
    expect(result.recurring).toBeGreaterThanOrEqual(0);
    expect(result.oneTime).toBeGreaterThanOrEqual(0);
  });

  it('recurring + oneTime always equals total when no contract match', () => {
    const invoice = inv({ total: 1500 });
    const { recurring, oneTime } = classifyInvoiceRevenue(invoice);
    expect(recurring + oneTime).toBe(1500);
  });
});
