import { describe, expect, it } from 'vitest';
import { Contract, Invoice } from '../types';
import { getContractGroupAllLines, getContractGroupId, invoiceTouchesContractLine } from '../utils/contractGroups';

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'CTR-PRIMARY',
  clientId: 'CLI-001',
  billboardId: 'BB-001',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRate: 1000,
  installationCost: 0,
  printingCost: 0,
  productionCost: 0,
  hasVat: true,
  totalContractValue: 12000,
  status: 'Active',
  details: 'Side A',
  side: 'A',
  ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'INV-001',
  clientId: 'CLI-001',
  contractId: 'CTR-PRIMARY',
  date: '2026-01-01',
  items: [{ description: 'Rental', amount: 1000, billboardId: 'BB-001', contractLineId: 'CTR-PRIMARY' }],
  subtotal: 1000,
  vatAmount: 0,
  total: 1000,
  status: 'Pending',
  type: 'Invoice',
  ...overrides,
});

describe('contract group helpers', () => {
  it('uses the master contract id when present', () => {
    expect(getContractGroupId(makeContract({ id: 'CTR-LINE-2', masterContractId: 'CTR-PRIMARY' }))).toBe('CTR-PRIMARY');
    expect(getContractGroupId(makeContract())).toBe('CTR-PRIMARY');
  });

  it('returns every line in the same grouped contract', () => {
    const primary = makeContract();
    const line2 = makeContract({ id: 'CTR-LINE-2', billboardId: 'BB-002', masterContractId: 'CTR-PRIMARY', details: 'Slot 1', side: undefined, slotNumber: 1 });
    const unrelated = makeContract({ id: 'CTR-OTHER', billboardId: 'BB-003', masterContractId: undefined });

    expect(getContractGroupAllLines(line2, [primary, line2, unrelated]).map(c => c.id)).toEqual(['CTR-PRIMARY', 'CTR-LINE-2']);
  });

  it('detects invoices linked through either invoice contractId or invoice item contractLineId', () => {
    const invoice = makeInvoice({
      contractId: 'CTR-PRIMARY',
      items: [
        { description: 'Primary rental', amount: 1000, contractLineId: 'CTR-PRIMARY' },
        { description: 'Second billboard', amount: 750, billboardId: 'BB-002', contractLineId: 'CTR-LINE-2' },
      ],
    });

    expect(invoiceTouchesContractLine(invoice, 'CTR-PRIMARY')).toBe(true);
    expect(invoiceTouchesContractLine(invoice, 'CTR-LINE-2')).toBe(true);
    expect(invoiceTouchesContractLine(invoice, 'CTR-MISSING')).toBe(false);
  });
});
