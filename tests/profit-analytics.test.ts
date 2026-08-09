import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

import * as mockData from '../services/mockData';
import {
  classifyInvoiceRevenue,
  getBillboardProfitability,
  getClientProfitability,
  getContractProfitability,
  getProfitabilitySummary,
  UNASSIGNED_CLIENT_ID,
} from '../services/profitAnalytics';

afterEach(() => vi.restoreAllMocks());

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
    expect(result.recurring).toBe(1000);
    expect(result.oneTime).toBe(0);
  });

  it('returns non-negative values', () => {
    const result = classifyInvoiceRevenue(inv());
    expect(result.recurring).toBeGreaterThanOrEqual(0);
    expect(result.oneTime).toBeGreaterThanOrEqual(0);
  });

  it('recurring + oneTime equals net revenue excluding VAT', () => {
    const invoice = inv({ total: 1500 });
    const { recurring, oneTime } = classifyInvoiceRevenue(invoice);
    expect(recurring + oneTime).toBe(invoice.subtotal);
  });
});

// ============================================================
// Attribution drill-downs
// ============================================================
describe('profitability attribution', () => {
  const client = { id: 'CLI-001', companyName: 'Acme', status: 'Active' } as any;
  const billboard = { id: 'BB-001', name: 'Main Board' } as any;
  const billboardTwo = { id: 'BB-002', name: 'Second Board' } as any;
  const contract = (overrides: Partial<Contract> = {}): Contract => ({
    id: 'CTR-001', clientId: 'CLI-001', billboardId: 'BB-001',
    startDate: '2025-01-01', endDate: '2025-12-31', monthlyRate: 1000,
    installationCost: 100, printingCost: 50, productionCost: 25,
    hasVat: false, totalContractValue: 12175, status: 'Active', details: 'Side A',
    ...overrides,
  });

  const installSpies = (data: {
    invoices?: Invoice[];
    contracts?: Contract[];
    billboards?: any[];
    clients?: any[];
    printingJobs?: any[];
    expenses?: any[];
  }) => {
    vi.spyOn(mockData, 'getInvoices').mockReturnValue(data.invoices || []);
    vi.spyOn(mockData, 'getContracts').mockReturnValue(data.contracts || []);
    vi.spyOn(mockData, 'getBillboards').mockReturnValue(data.billboards || []);
    vi.spyOn(mockData, 'getClients').mockReturnValue(data.clients || []);
    vi.spyOn(mockData, 'getPrintingJobs').mockReturnValue(data.printingJobs || []);
    vi.spyOn(mockData, 'getExpenses').mockReturnValue(data.expenses || []);
  };

  it('keeps contracts with no invoices at zero realised revenue', () => {
    installSpies({ contracts: [contract()], billboards: [billboard], clients: [client] });
    const row = getContractProfitability()[0];
    expect(row.totalRevenue).toBe(0);
    expect(row.cogs).toBe(175);
    expect(row.grossProfit).toBe(-175);
  });

  it('adds unlinked client invoices without treating them as contract revenue', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [
        inv({ id: 'linked', contractId: 'CTR-001', subtotal: 1000, total: 1000 }),
        inv({ id: 'unlinked', contractId: undefined, subtotal: 250, total: 250 }),
      ],
    });
    const contractRow = getContractProfitability()[0];
    const clientRow = getClientProfitability()[0];
    expect(contractRow.totalRevenue).toBe(1000);
    expect(clientRow.revenue).toBe(1250);
    expect(clientRow.unlinkedInvoiceRevenue).toBe(250);
    expect(getProfitabilitySummary().unlinkedInvoiceRevenue).toBe(250);
  });

  it('rolls multiple contracts onto one billboard and keeps recorded costs', () => {
    const second = contract({ id: 'CTR-002', installationCost: 10, printingCost: 20, productionCost: 0 });
    installSpies({
      contracts: [contract(), second], billboards: [billboard], clients: [client],
      invoices: [
        inv({ id: 'one', contractId: 'CTR-001', subtotal: 1000, total: 1000 }),
        inv({ id: 'two', contractId: 'CTR-002', subtotal: 500, total: 500 }),
      ],
    });
    const row = getBillboardProfitability()[0];
    expect(row.contractCount).toBe(2);
    expect(row.revenue).toBe(1500);
    expect(row.attributedDirectCosts).toBe(205);
  });

  it('uses excess billboard printing jobs as supplemental costs once, not contract COGS', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard, billboardTwo], clients: [client],
      printingJobs: [{ id: 'job', clientId: 'CLI-001', billboardId: 'BB-001', totalCost: 80 }],
      invoices: [inv({ contractId: 'CTR-001', subtotal: 1000, total: 1000 })],
    });
    const contractRow = getContractProfitability()[0];
    const boardRow = getBillboardProfitability().find(row => row.billboardId === 'BB-001');
    const clientRow = getClientProfitability().find(row => row.clientId === 'CLI-001');
    // Recorded printing is 50, so only the 30 excess job cost is supplemental.
    // The single campaign on the board receives the full share, and the client
    // row rolls it up, so all three tabs reconcile at 205.
    expect(contractRow.supplementalPrintingCost).toBe(30);
    expect(contractRow.cogs).toBe(205);
    expect(boardRow?.supplementalPrintingCost).toBe(30);
    expect(boardRow?.attributedDirectCosts).toBe(205);
    expect(clientRow?.supplementalPrintingCost).toBe(30);
    expect(clientRow?.attributedDirectCosts).toBe(205);
    expect(getProfitabilitySummary().attributedDirectCosts).toBe(205);
  });

  it('allocates supplemental printing proportionally across campaigns on a shared billboard', () => {
    const second = contract({ id: 'CTR-002', installationCost: 10, printingCost: 0, productionCost: 0 });
    installSpies({
      contracts: [contract(), second], billboards: [billboard], clients: [client],
      printingJobs: [{ id: 'job', clientId: 'CLI-001', billboardId: 'BB-001', totalCost: 80 }],
      invoices: [],
    });
    const rows = getContractProfitability();
    const one = rows.find(row => row.contractId === 'CTR-001')!;
    const two = rows.find(row => row.contractId === 'CTR-002')!;
    // Recorded printing on the board is 50 (all on CTR-001), job excess 30.
    expect(one.supplementalPrintingCost).toBe(30);
    expect(two.supplementalPrintingCost).toBe(0);
    expect(one.attributedDirectCosts).toBe(205);
    // CTR-002 records only the 10 installation cost; it gets no printing share.
    expect(two.attributedDirectCosts).toBe(10);
    // Billboard total equals the campaign total.
    const boardTotal = getBillboardProfitability().find(b => b.billboardId === 'BB-001')!.attributedDirectCosts;
    expect(boardTotal).toBe(one.attributedDirectCosts + two.attributedDirectCosts);
  });

  it('splits supplemental printing evenly when no campaign records printing costs', () => {
    const a = contract({ id: 'CTR-001', printingCost: 0 });
    const b = contract({ id: 'CTR-002', printingCost: 0 });
    installSpies({
      contracts: [a, b], billboards: [billboard], clients: [client],
      printingJobs: [{ id: 'job', clientId: 'CLI-001', billboardId: 'BB-001', totalCost: 40 }],
      invoices: [],
    });
    const rows = getContractProfitability();
    const one = rows.find(row => row.contractId === 'CTR-001')!;
    const two = rows.find(row => row.contractId === 'CTR-002')!;
    expect(one.supplementalPrintingCost).toBe(20);
    expect(two.supplementalPrintingCost).toBe(20);
  });

  it('keeps printing jobs for billboards without campaigns unallocated', () => {
    installSpies({
      contracts: [], billboards: [billboard], clients: [client],
      printingJobs: [{ id: 'job', clientId: 'CLI-001', billboardId: 'BB-001', totalCost: 60 }],
      invoices: [],
    });
    const boardRow = getBillboardProfitability().find(b => b.billboardId === 'BB-001');
    expect(boardRow?.supplementalPrintingCost).toBe(0);
    expect(getProfitabilitySummary().unallocatedPrintingJobCosts).toBe(60);
  });

  it('attributes a contract-linked expense to the campaign, billboard, client, and summary', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [inv({ contractId: 'CTR-001', subtotal: 1000, total: 1000 })],
      expenses: [{ id: 'EXP-1', category: 'Maintenance', description: 'LED repair', amount: 80, date: '2026-07-10', clientId: 'CLI-001', contractId: 'CTR-001' }],
    });
    const contractRow = getContractProfitability()[0];
    const boardRow = getBillboardProfitability().find(b => b.billboardId === 'BB-001');
    const clientRow = getClientProfitability().find(c => c.clientId === 'CLI-001');
    // Recorded contract costs are 175 (100 installation + 50 printing + 25 production).
    expect(contractRow.linkedExpenseCost).toBe(80);
    expect(contractRow.attributedDirectCosts).toBe(255);
    expect(boardRow?.linkedExpenseCost).toBe(80);
    expect(boardRow?.attributedDirectCosts).toBe(255);
    expect(clientRow?.contractLinkedExpenses).toBe(80);
    expect(clientRow?.attributedDirectCosts).toBe(255);
    expect(getProfitabilitySummary().contractLinkedExpenses).toBe(80);
    expect(getProfitabilitySummary().attributedDirectCosts).toBe(255);
  });

  it('attributes a client-only expense to the client row but not campaigns', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [inv({ contractId: 'CTR-001', subtotal: 1000, total: 1000 })],
      expenses: [{ id: 'EXP-2', category: 'Other', description: 'Client kit', amount: 30, date: '2026-07-10', clientId: 'CLI-001' }],
    });
    const contractRow = getContractProfitability()[0];
    const boardRow = getBillboardProfitability().find(b => b.billboardId === 'BB-001');
    const clientRow = getClientProfitability().find(c => c.clientId === 'CLI-001');
    expect(contractRow.linkedExpenseCost).toBe(0);
    expect(boardRow?.linkedExpenseCost).toBe(0);
    expect(clientRow?.clientLinkedExpenses).toBe(30);
    expect(clientRow?.attributedDirectCosts).toBe(205);
    expect(getProfitabilitySummary().clientLinkedExpenses).toBe(30);
    expect(getProfitabilitySummary().attributedDirectCosts).toBe(205);
  });

  it('keeps unlinked expenses in unallocated operating expenses', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [],
      expenses: [{ id: 'EXP-3', category: 'Electricity', description: 'Office power', amount: 45, date: '2026-07-10' }],
    });
    const summary = getProfitabilitySummary();
    expect(summary.contractLinkedExpenses).toBe(0);
    expect(summary.clientLinkedExpenses).toBe(0);
    expect(summary.unallocatedOperatingExpenses).toBe(45);
    expect(summary.attributedDirectCosts).toBe(175);
  });

  it('falls back to the client when a contract link is unknown (orphan legacy data)', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [],
      expenses: [
        { id: 'EXP-1', category: 'Other', description: 'Orphan contract cost', amount: 20, date: '2026-07-10', clientId: 'CLI-001', contractId: 'CONTRACT-GONE' },
        { id: 'EXP-2', category: 'Other', description: 'No links at all', amount: 15, date: '2026-07-10' },
      ],
    });
    const clientRow = getClientProfitability().find(c => c.clientId === 'CLI-001');
    expect(clientRow?.clientLinkedExpenses).toBe(20);
    const summary = getProfitabilitySummary();
    expect(summary.clientLinkedExpenses).toBe(20);
    expect(summary.unallocatedOperatingExpenses).toBe(15);
  });

  it('reconciles the client tab with the summary including linked expenses', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [inv({ contractId: 'CTR-001', subtotal: 1000, total: 1000 })],
      expenses: [
        { id: 'EXP-1', category: 'Maintenance', description: 'Repair', amount: 80, date: '2026-07-10', clientId: 'CLI-001', contractId: 'CTR-001' },
        { id: 'EXP-2', category: 'Other', description: 'Kit', amount: 30, date: '2026-07-10', clientId: 'CLI-001' },
      ],
    });
    const summary = getProfitabilitySummary();
    const clientTotal = getClientProfitability().reduce((sum, row) => sum + row.attributedDirectCosts, 0);
    const contractTotal = getContractProfitability().reduce((sum, row) => sum + row.attributedDirectCosts, 0);
    expect(clientTotal).toBe(summary.attributedDirectCosts);
    expect(contractTotal).toBe(summary.attributedDirectCosts - summary.clientLinkedExpenses);
  });

  it('surfaces invoices with no client as an Unassigned row and sums to realized revenue', () => {
    installSpies({
      contracts: [contract()], billboards: [billboard], clients: [client],
      invoices: [
        inv({ id: 'linked', contractId: 'CTR-001', clientId: 'CLI-001', subtotal: 1000, total: 1000 }),
        inv({ id: 'no-client', clientId: undefined, subtotal: 300, total: 300 }),
      ],
    });
    const rows = getClientProfitability();
    const unassigned = rows.find(row => row.clientId === UNASSIGNED_CLIENT_ID)!;
    expect(unassigned).toBeDefined();
    expect(unassigned.revenue).toBe(300);
    expect(unassigned.attributedDirectCosts).toBe(0);
    // The client tab sums to realized revenue.
    expect(rows.reduce((sum, row) => sum + row.revenue, 0)).toBe(1300);
    // Named client rows are not affected.
    const acme = rows.find(row => row.clientId === 'CLI-001')!;
    expect(acme.revenue).toBe(1000);
  });
});
