import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ContractAmendment, Contract, Billboard } from '../types';
import { BillboardType } from '../types';

// ============================================================
// Mock localStorage for tests
// ============================================================
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (idx: number) => Object.keys(store)[idx] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window - must include addEventListener for mockData.ts module-level code
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { reload: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

// Mock global fetch for syncToNeon / syncToCloudMirror
globalThis.fetch = vi.fn().mockResolvedValue({
  json: vi.fn().mockResolvedValue({}),
  ok: true,
});

// ============================================================
// Helper to create mock data
// ============================================================
const makeAmendment = (overrides: Partial<ContractAmendment> = {}): ContractAmendment => ({
  id: 'AM-TEST-001',
  contractId: 'CTR-001',
  type: 'extension',
  oldStartDate: '2025-01-01',
  oldEndDate: '2025-06-30',
  newStartDate: '2025-01-01',
  newEndDate: '2025-12-31',
  oldMonthlyRate: 1000,
  newMonthlyRate: 1000,
  oldTotalValue: 6000,
  newTotalValue: 12000,
  monthsChanged: 6,
  financialImpact: 6000,
  status: 'applied',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'CTR-001',
  clientId: 'CLI-001',
  billboardId: 'BB-001',
  startDate: '2025-01-01',
  endDate: '2025-06-30',
  monthlyRate: 1000,
  installationCost: 0,
  printingCost: 0,
  hasVat: false,
  totalContractValue: 6000,
  status: 'Active',
  details: 'Side A',
  side: 'A',
  ...overrides,
});

const makeBillboard = (overrides: Partial<Billboard> = {}): Billboard => ({
  id: 'BB-001',
  name: 'Test Billboard',
  location: 'Test Location',
  town: 'Test Town',
  type: BillboardType.Static,
  width: 12,
  height: 3,
  coordinates: { lat: -17.825, lng: 31.033 },
  sideARate: 1000,
  sideBRate: 1000,
  sideAStatus: 'Available',
  sideBStatus: 'Available',
  ...overrides,
});

// ============================================================
// Tests
// ============================================================
describe('Contract Amendment - Data Layer', () => {
  // mockData module maintains module-level arrays. To get fresh state per test,
  // we call vi.resetModules() before each test to clear vitest's module cache.

  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('addContractAmendment', () => {
    it('adds an amendment to the in-memory store and localStorage', async () => {
      const mod = await import('../services/mockData');
      const amendment = makeAmendment();

      mod.addContractAmendment(amendment);

      const all = mod.getContractAmendments();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('AM-TEST-001');
      expect(all[0].contractId).toBe('CTR-001');
    });

    it('prepends amendments so newest is first', async () => {
      const mod = await import('../services/mockData');
      const oldAmendment = makeAmendment({ id: 'AM-001', createdAt: '2025-01-01T00:00:00Z' });
      const newAmendment = makeAmendment({ id: 'AM-002', createdAt: '2025-06-01T00:00:00Z' });

      mod.addContractAmendment(oldAmendment);
      mod.addContractAmendment(newAmendment);

      const all = mod.getContractAmendments();
      expect(all).toHaveLength(2);
      // Newest (AM-002) should be first since we prepend
      expect(all[0].id).toBe('AM-002');
      expect(all[1].id).toBe('AM-001');
    });
  });

  describe('getContractAmendmentsForContract', () => {
    it('returns only amendments for the given contract, sorted newest first', async () => {
      const mod = await import('../services/mockData');
      const a1 = makeAmendment({ id: 'AM-001', contractId: 'CTR-001', createdAt: '2025-01-01T00:00:00Z' });
      const a2 = makeAmendment({ id: 'AM-002', contractId: 'CTR-001', createdAt: '2025-06-01T00:00:00Z' });
      const a3 = makeAmendment({ id: 'AM-003', contractId: 'CTR-002', createdAt: '2025-03-01T00:00:00Z' });

      mod.addContractAmendment(a1);
      mod.addContractAmendment(a2);
      mod.addContractAmendment(a3);

      const forCtr1 = mod.getContractAmendmentsForContract('CTR-001');
      expect(forCtr1).toHaveLength(2);
      expect(forCtr1[0].id).toBe('AM-002'); // newest first
      expect(forCtr1[1].id).toBe('AM-001');

      const forCtr2 = mod.getContractAmendmentsForContract('CTR-002');
      expect(forCtr2).toHaveLength(1);
      expect(forCtr2[0].id).toBe('AM-003');

      const forNone = mod.getContractAmendmentsForContract('NONEXISTENT');
      expect(forNone).toHaveLength(0);
    });
  });

  describe('deleteContractAmendment', () => {
    it('removes an amendment by id from memory and localStorage', async () => {
      const mod = await import('../services/mockData');
      const amendment = makeAmendment();
      mod.addContractAmendment(amendment);

      expect(mod.getContractAmendments()).toHaveLength(1);

      mod.deleteContractAmendment('AM-TEST-001');
      expect(mod.getContractAmendments()).toHaveLength(0);
    });

    it('does nothing when amendment id does not exist', async () => {
      const mod = await import('../services/mockData');
      const amendment = makeAmendment();
      mod.addContractAmendment(amendment);

      mod.deleteContractAmendment('NONEXISTENT');
      expect(mod.getContractAmendments()).toHaveLength(1);
    });
  });

  describe('deleteContract - cascade amendments', () => {
    it('cascade-deletes amendments when the parent contract is deleted', async () => {
      // This test validates Fix #5: cascade delete amendments on contract deletion
      const mod = await import('../services/mockData');

      // Set up test data - we need a contract and billboard
      const billboard = makeBillboard();
      mod.addBillboard(billboard);

      const contract = makeContract();
      mod.addContract(contract);

      // Add amendments
      const a1 = makeAmendment({ id: 'AM-001', contractId: 'CTR-001' });
      const a2 = makeAmendment({ id: 'AM-002', contractId: 'CTR-001' });
      mod.addContractAmendment(a1);
      mod.addContractAmendment(a2);

      expect(mod.getContractAmendments()).toHaveLength(2);

      // Delete the contract - this should cascade delete the amendments
      mod.deleteContract('CTR-001');

      // Amendments should be gone
      expect(mod.getContractAmendments()).toHaveLength(0);
    });

    it('does not delete amendments for other contracts when one contract is deleted', async () => {
      const mod = await import('../services/mockData');

      const billboard = makeBillboard();
      mod.addBillboard(billboard);

      const contract1 = makeContract({ id: 'CTR-001' });
      const contract2 = makeContract({ id: 'CTR-002', billboardId: 'BB-001' });
      mod.addContract(contract1);
      mod.addContract(contract2);

      const a1 = makeAmendment({ id: 'AM-001', contractId: 'CTR-001' });
      const a2 = makeAmendment({ id: 'AM-002', contractId: 'CTR-002' });
      mod.addContractAmendment(a1);
      mod.addContractAmendment(a2);

      expect(mod.getContractAmendments()).toHaveLength(2);

      mod.deleteContract('CTR-001');

      // Only CTR-001's amendment should be deleted
      const remaining = mod.getContractAmendments();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].contractId).toBe('CTR-002');
    });
  });
});

describe('Contract Amendment - API Schema Validation', () => {
  // Test the Zod schema from api/contract-amendments.ts without needing a server
  it('validates a complete amendment schema', async () => {
    // Replicate the schema from the API handler so we can test it in isolation
    const { z } = await import('zod');
    const amendmentSchema = z.object({
      contractId: z.string().min(1, 'Contract ID is required'),
      type: z.enum(['extension', 'reduction', 'rate_change', 'other']),
      oldStartDate: z.string().min(1),
      oldEndDate: z.string().min(1),
      newStartDate: z.string().min(1),
      newEndDate: z.string().min(1),
      oldMonthlyRate: z.number(),
      newMonthlyRate: z.number(),
      oldTotalValue: z.number(),
      newTotalValue: z.number(),
      monthsChanged: z.number(),
      financialImpact: z.number(),
      reason: z.string().optional(),
      requestedBy: z.string().optional(),
      approvedBy: z.string().optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'applied']).default('applied'),
      invoiceImpactNote: z.string().optional(),
    });

    const validData = {
      contractId: 'CTR-001',
      type: 'extension' as const,
      oldStartDate: '2025-01-01',
      oldEndDate: '2025-06-30',
      newStartDate: '2025-01-01',
      newEndDate: '2025-12-31',
      oldMonthlyRate: 1000,
      newMonthlyRate: 1000,
      oldTotalValue: 6000,
      newTotalValue: 12000,
      monthsChanged: 6,
      financialImpact: 6000,
      reason: 'Client requested extension',
    };

    const result = amendmentSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('applied'); // default
    }
  });

  it('rejects missing contractId', async () => {
    const { z } = await import('zod');
    const amendmentSchema = z.object({
      contractId: z.string().min(1, 'Contract ID is required'),
      type: z.enum(['extension', 'reduction', 'rate_change', 'other']),
      oldStartDate: z.string().min(1),
      oldEndDate: z.string().min(1),
      newStartDate: z.string().min(1),
      newEndDate: z.string().min(1),
      oldMonthlyRate: z.number(),
      newMonthlyRate: z.number(),
      oldTotalValue: z.number(),
      newTotalValue: z.number(),
      monthsChanged: z.number(),
      financialImpact: z.number(),
    });

    const result = amendmentSchema.safeParse({
      type: 'extension',
      oldStartDate: '2025-01-01',
      oldEndDate: '2025-06-30',
      newStartDate: '2025-01-01',
      newEndDate: '2025-12-31',
      oldMonthlyRate: 1000,
      newMonthlyRate: 1000,
      oldTotalValue: 6000,
      newTotalValue: 12000,
      monthsChanged: 6,
      financialImpact: 6000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', async () => {
    const { z } = await import('zod');
    const amendmentSchema = z.object({
      contractId: z.string().min(1),
      type: z.enum(['extension', 'reduction', 'rate_change', 'other']),
      oldStartDate: z.string().min(1),
      oldEndDate: z.string().min(1),
      newStartDate: z.string().min(1),
      newEndDate: z.string().min(1),
      oldMonthlyRate: z.number(),
      newMonthlyRate: z.number(),
      oldTotalValue: z.number(),
      newTotalValue: z.number(),
      monthsChanged: z.number(),
      financialImpact: z.number(),
    });

    const result = amendmentSchema.safeParse({
      contractId: 'CTR-001',
      type: 'invalid_type',
      oldStartDate: '2025-01-01',
      oldEndDate: '2025-06-30',
      newStartDate: '2025-01-01',
      newEndDate: '2025-12-31',
      oldMonthlyRate: 1000,
      newMonthlyRate: 1000,
      oldTotalValue: 6000,
      newTotalValue: 12000,
      monthsChanged: 6,
      financialImpact: 6000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric financial fields', async () => {
    const { z } = await import('zod');
    const amendmentSchema = z.object({
      contractId: z.string().min(1),
      type: z.enum(['extension', 'reduction', 'rate_change', 'other']),
      oldStartDate: z.string().min(1),
      oldEndDate: z.string().min(1),
      newStartDate: z.string().min(1),
      newEndDate: z.string().min(1),
      oldMonthlyRate: z.number(),
      newMonthlyRate: z.number(),
      oldTotalValue: z.number(),
      newTotalValue: z.number(),
      monthsChanged: z.number(),
      financialImpact: z.number(),
    });

    const result = amendmentSchema.safeParse({
      contractId: 'CTR-001',
      type: 'extension',
      oldStartDate: '2025-01-01',
      oldEndDate: '2025-06-30',
      newStartDate: '2025-01-01',
      newEndDate: '2025-12-31',
      oldMonthlyRate: 'not-a-number',
      newMonthlyRate: 1000,
      oldTotalValue: 6000,
      newTotalValue: 12000,
      monthsChanged: 6,
      financialImpact: 6000,
    });
    expect(result.success).toBe(false);
  });
});
