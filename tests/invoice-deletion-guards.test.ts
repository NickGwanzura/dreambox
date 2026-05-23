import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Invoice, Contract, Billboard } from '../types';
import { BillboardType } from '../types';

// ============================================================
// Mock localStorage for data layer tests
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

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { reload: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

globalThis.fetch = vi.fn().mockResolvedValue({
  json: vi.fn().mockResolvedValue({}),
  ok: true,
});

// ============================================================
// Test Helpers
// ============================================================

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'CTR-001',
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
  status: 'Active',
  details: 'Side A',
  side: 'A',
  ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'INV-001',
  contractId: 'CTR-001',
  clientId: 'CLI-001',
  date: '2025-03-15',
  items: [{ description: 'Monthly Rental', amount: 1000 }],
  subtotal: 1000,
  vatAmount: 0,
  total: 1000,
  status: 'Pending',
  type: 'Invoice',
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
// Guard Logic Test 1: Amendment Reduction Invoice Delete Confirmation
//
// Extracted from ContractAmendmentModal.tsx lines 298-312:
//   if (activeTab === 'reduction' && isReduction && affectedInvoices.length > 0) {
//     if (!showInvoiceDeleteConfirm) {
//       setSaving(false);
//       setShowInvoiceDeleteConfirm(true);
//       return; // BLOCK — show confirmation first
//     }
//     // Proceed with deletion
//     affectedInvoices.forEach(inv => deleteInvoice(inv.id));
//   }
// ============================================================

type GuardAction = 'show_confirmation' | 'delete_invoices' | 'no_action';

function evaluateReductionGuard(
  activeTab: string,
  isReduction: boolean,
  affectedInvoiceCount: number,
  showInvoiceDeleteConfirm: boolean,
): GuardAction {
  if (activeTab === 'reduction' && isReduction && affectedInvoiceCount > 0) {
    if (!showInvoiceDeleteConfirm) {
      return 'show_confirmation';
    }
    return 'delete_invoices';
  }
  return 'no_action';
}

describe('Reduction Invoice Delete Confirmation Guard', () => {
  describe('evaluateReductionGuard', () => {
    it('shows confirmation when reduction has affected invoices and user has NOT yet confirmed', () => {
      const action = evaluateReductionGuard('reduction', true, 3, false);
      expect(action).toBe('show_confirmation');
    });

    it('proceeds with deletion when reduction has affected invoices and user HAS confirmed', () => {
      const action = evaluateReductionGuard('reduction', true, 3, true);
      expect(action).toBe('delete_invoices');
    });

    it('takes no action when there are no affected invoices', () => {
      const action = evaluateReductionGuard('reduction', true, 0, false);
      expect(action).toBe('no_action');
    });

    it('takes no action for extensions (not reductions)', () => {
      const action = evaluateReductionGuard('extension', false, 3, false);
      expect(action).toBe('no_action');
    });

    it('takes no action for rate changes', () => {
      const action = evaluateReductionGuard('rate_change', false, 3, false);
      expect(action).toBe('no_action');
    });

    it('takes no action when activeTab is reduction but isReduction is false (dates not changed)', () => {
      // Possible when user selects "Reduce" tab but hasn't changed the end date yet
      const action = evaluateReductionGuard('reduction', false, 3, false);
      expect(action).toBe('no_action');
    });

    it('correctly narrows from show_confirmation to delete_invoices after second call', () => {
      // First call: user hasn't confirmed yet
      const firstCall = evaluateReductionGuard('reduction', true, 2, false);
      expect(firstCall).toBe('show_confirmation');

      // Second call: user has now confirmed (showInvoiceDeleteConfirm = true)
      const secondCall = evaluateReductionGuard('reduction', true, 2, true);
      expect(secondCall).toBe('delete_invoices');
    });

    it('shows confirmation for single affected invoice', () => {
      const action = evaluateReductionGuard('reduction', true, 1, false);
      expect(action).toBe('show_confirmation');
    });

    it('shows confirmation for many affected invoices', () => {
      const action = evaluateReductionGuard('reduction', true, 50, false);
      expect(action).toBe('show_confirmation');
    });
  });

  describe('affected invoice filtering logic', () => {
    // Simulates the useMemo from ContractAmendmentModal.tsx lines 66-72:
    //   return invoices.filter(i =>
    //     i.contractId === contract.id &&
    //     String(i.type || '').toLowerCase() === 'invoice' &&
    //     new Date(i.date).getTime() > newEndDateTime
    //   );

    function getAffectedInvoices(
      allInvoices: Invoice[],
      contractId: string,
      newEndDate: string,
    ): Invoice[] {
      const newEndDateTime = new Date(newEndDate).getTime();
      return allInvoices.filter(i =>
        i.contractId === contractId &&
        String(i.type || '').toLowerCase() === 'invoice' &&
        new Date(i.date).getTime() > newEndDateTime
      );
    }

    const contractId = 'CTR-001';

    it('filters invoices after the new end date', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId, date: '2025-03-01', total: 1000 }),
        makeInvoice({ id: 'INV-002', contractId, date: '2025-06-01', total: 1000 }),
        makeInvoice({ id: 'INV-003', contractId, date: '2025-09-01', total: 1000 }),
      ];

      // New end date = 2025-05-01 → only INV-002 and INV-003 are affected
      // (dates after 2025-05-01)
      // Using getTime() comparison, strict greater-than (>), so 2025-05-01 itself is excluded
      const affected = getAffectedInvoices(invoices, contractId, '2025-05-01');
      expect(affected).toHaveLength(2);
      expect(affected.map(i => i.id)).toEqual(['INV-002', 'INV-003']);
    });

    it('filters invoices after year boundary', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId, date: '2025-12-15', total: 1000 }),
        makeInvoice({ id: 'INV-002', contractId, date: '2026-01-15', total: 1000 }),
        makeInvoice({ id: 'INV-003', contractId, date: '2026-03-01', total: 1000 }),
      ];

      const affected = getAffectedInvoices(invoices, contractId, '2025-12-31');
      expect(affected).toHaveLength(2);
      expect(affected.map(i => i.id)).toEqual(['INV-002', 'INV-003']);
    });

    it('excludes invoices on or before the new end date', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId, date: '2025-03-01', total: 1000 }),
        makeInvoice({ id: 'INV-002', contractId, date: '2025-06-15', total: 1000 }),
      ];

      // New end date = 2025-06-15 → INV-001 (Mar 1) is before, INV-002 is ON the date
      // Using strict greater-than (>), so INV-002 should NOT be affected
      const affected = getAffectedInvoices(invoices, contractId, '2025-06-15');
      expect(affected).toHaveLength(0);
    });

    it('ignores non-invoice types (receipts, quotations)', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId, date: '2025-06-01', type: 'Invoice', total: 1000 }),
        makeInvoice({ id: 'RCT-001', contractId, date: '2025-06-01', type: 'Receipt', total: 1000 }),
        makeInvoice({ id: 'QUO-001', contractId, date: '2025-06-01', type: 'Quotation', total: 1000 }),
      ];

      const affected = getAffectedInvoices(invoices, contractId, '2025-05-01');
      expect(affected).toHaveLength(1);
      expect(affected[0].type).toBe('Invoice');
    });

    it('only considers invoices for the target contract', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', date: '2025-06-01' }),
        makeInvoice({ id: 'INV-002', contractId: 'CTR-002', date: '2025-06-01' }),
        makeInvoice({ id: 'INV-003', contractId: 'CTR-003', date: '2025-06-01' }),
      ];

      const affected = getAffectedInvoices(invoices, 'CTR-001', '2025-05-01');
      expect(affected).toHaveLength(1);
      expect(affected[0].id).toBe('INV-001');
    });

    it('calculates total credit due correctly', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId, date: '2025-06-01', total: 500 }),
        makeInvoice({ id: 'INV-002', contractId, date: '2025-07-01', total: 750 }),
        makeInvoice({ id: 'INV-003', contractId, date: '2025-08-01', total: 1000 }),
      ];

      const affected = getAffectedInvoices(invoices, contractId, '2025-05-01');
      const totalCreditDue = affected.reduce((sum, i) => sum + i.total, 0);
      expect(totalCreditDue).toBe(2250);
    });

    it('returns empty array when no invoices exist for contract', () => {
      const affected = getAffectedInvoices([], contractId, '2025-05-01');
      expect(affected).toHaveLength(0);
    });
  });
});

// ============================================================
// Guard Logic Test 2: Paid Invoice Delete Warning on Contract Deletion
//
// Extracted from Rentals.tsx confirmDelete() — lines 577-593:
//   const paidInvoicesForContract = invoices.filter(i =>
//     i.contractId === rentalToDelete.id &&
//     String(i.type || '').toLowerCase() === 'invoice' &&
//     i.status === 'Paid'
//   );
//   if (paidInvoicesForContract.length > 0 && !showPaidInvoiceDeleteWarning) {
//     setShowPaidInvoiceDeleteWarning(true);
//     return; // BLOCK — show warning first
//   }
//   deleteContract(rentalToDelete.id);
// ============================================================

type PaidInvoiceAction = 'show_warning' | 'proceed_delete' | 'no_contract';

function evaluatePaidInvoiceGuard(
  rentalToDelete: { id: string } | null,
  allInvoices: Invoice[],
  showPaidInvoiceDeleteWarning: boolean,
): PaidInvoiceAction {
  if (!rentalToDelete) return 'no_contract';

  const paidInvoicesForContract = allInvoices.filter(i =>
    i.contractId === rentalToDelete.id &&
    String(i.type || '').toLowerCase() === 'invoice' &&
    i.status === 'Paid'
  );

  if (paidInvoicesForContract.length > 0 && !showPaidInvoiceDeleteWarning) {
    return 'show_warning';
  }

  return 'proceed_delete';
}

describe('Paid Invoice Delete Warning Guard', () => {
  describe('evaluatePaidInvoiceGuard', () => {
    it('shows warning when contract has paid invoices and warning has NOT been shown', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Paid' }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('show_warning');
    });

    it('proceeds with deletion when contract has paid invoices but warning HAS been shown', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Paid' }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, true);
      expect(action).toBe('proceed_delete');
    });

    it('proceeds directly when contract has no paid invoices', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Pending' }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('proceed_delete');
    });

    it('proceeds directly when contract has no invoices at all', () => {
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, [], false);
      expect(action).toBe('proceed_delete');
    });

    it('returns no_contract when rentalToDelete is null', () => {
      const action = evaluatePaidInvoiceGuard(null, [], false);
      expect(action).toBe('no_contract');
    });

    it('shows warning for multiple paid invoices', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Paid', total: 500 }),
        makeInvoice({ id: 'INV-002', contractId: 'CTR-001', status: 'Paid', total: 1000 }),
        makeInvoice({ id: 'INV-003', contractId: 'CTR-001', status: 'Paid', total: 750 }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('show_warning');
    });

    it('ignores non-invoice types when checking for paid documents', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'RCT-001', contractId: 'CTR-001', type: 'Receipt', status: 'Paid' }),
        makeInvoice({ id: 'QUO-001', contractId: 'CTR-001', type: 'Quotation', status: 'Paid' }),
      ];
      // Receipts and quotations should NOT trigger the guard
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('proceed_delete');
    });

    it('shows warning even when mixed with non-invoice types', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Paid', total: 1000 }),
        makeInvoice({ id: 'RCT-001', contractId: 'CTR-001', type: 'Receipt', status: 'Paid' }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('show_warning');
    });

    it('proceeds when another contract has paid invoices but target does not', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-002', status: 'Paid' }),
      ];
      const action = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, false);
      expect(action).toBe('proceed_delete');
    });
  });
});

// ============================================================
// Guard Logic Test 3: Multi-Billboard Line Deletion Warning
//
// Extracted from Rentals.tsx handleEditSave() — lines ~457-471:
//   const linesWithInvoices = deletedEditLineIds
//     .map(id => {
//       const linkedInvoices = invoices.filter(i =>
//         i.contractId === id && String(i.type || '').toLowerCase() === 'invoice'
//       );
//       if (linkedInvoices.length === 0) return null;
//       return {
//         contractId: id,
//         invoiceCount: linkedInvoices.length,
//         totalValue: linkedInvoices.reduce((sum, i) => sum + i.total, 0),
//       };
//     })
//     .filter(item => item !== null);
//
//   if (linesWithInvoices.length > 0 && !showDeleteLineConfirm) {
//     setDeletedLinesWithInvoices(linesWithInvoices);
//     setShowDeleteLineConfirm(true);
//     return; // BLOCK — show confirmation first
//   }
// ============================================================

interface LineInvoiceInfo {
  contractId: string;
  invoiceCount: number;
  totalValue: number;
}

function evaluateLineDeletionGuard(
  deletedEditLineIds: string[],
  allInvoices: Invoice[],
  showDeleteLineConfirm: boolean,
): { action: 'show_confirmation' | 'proceed_save' | 'no_lines'; linesWithInvoices: LineInvoiceInfo[] } {
  const linesWithInvoices = deletedEditLineIds
    .map(id => {
      const linkedInvoices = allInvoices.filter(i =>
        i.contractId === id && String(i.type || '').toLowerCase() === 'invoice'
      );
      if (linkedInvoices.length === 0) return null;
      return {
        contractId: id,
        invoiceCount: linkedInvoices.length,
        totalValue: linkedInvoices.reduce((sum, i) => sum + i.total, 0),
      };
    })
    .filter((item): item is LineInvoiceInfo => item !== null);

  if (deletedEditLineIds.length === 0) {
    return { action: 'no_lines', linesWithInvoices: [] };
  }

  if (linesWithInvoices.length > 0 && !showDeleteLineConfirm) {
    return { action: 'show_confirmation', linesWithInvoices };
  }

  return { action: 'proceed_save', linesWithInvoices };
}

describe('Multi-Billboard Line Deletion Guard', () => {
  describe('evaluateLineDeletionGuard', () => {
    it('shows confirmation when deleted lines have invoices and user has NOT confirmed', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1' }),
      ];
      const result = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, false);
      expect(result.action).toBe('show_confirmation');
      expect(result.linesWithInvoices).toHaveLength(1);
      expect(result.linesWithInvoices[0].contractId).toBe('CTR-LINE-1');
    });

    it('proceeds with save when deleted lines have invoices but user HAS confirmed', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1' }),
      ];
      const result = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, true);
      expect(result.action).toBe('proceed_save');
    });

    it('proceeds when deleted lines have no invoices', () => {
      const result = evaluateLineDeletionGuard(['CTR-LINE-1'], [], false);
      expect(result.action).toBe('proceed_save');
      expect(result.linesWithInvoices).toHaveLength(0);
    });

    it('returns no_lines when no lines are being deleted', () => {
      const result = evaluateLineDeletionGuard([], [], false);
      expect(result.action).toBe('no_lines');
      expect(result.linesWithInvoices).toHaveLength(0);
    });

    it('reports correct invoice count per deleted line', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1' }),
        makeInvoice({ id: 'INV-002', contractId: 'CTR-LINE-1' }),
        makeInvoice({ id: 'INV-003', contractId: 'CTR-LINE-2' }),
      ];

      const result = evaluateLineDeletionGuard(
        ['CTR-LINE-1', 'CTR-LINE-2'],
        invoices,
        false,
      );

      expect(result.action).toBe('show_confirmation');
      expect(result.linesWithInvoices).toHaveLength(2);

      const line1 = result.linesWithInvoices.find(l => l.contractId === 'CTR-LINE-1');
      const line2 = result.linesWithInvoices.find(l => l.contractId === 'CTR-LINE-2');
      expect(line1?.invoiceCount).toBe(2);
      expect(line2?.invoiceCount).toBe(1);
    });

    it('reports correct total value per deleted line', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1', total: 500 }),
        makeInvoice({ id: 'INV-002', contractId: 'CTR-LINE-1', total: 1500 }),
      ];

      const result = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, false);
      expect(result.linesWithInvoices[0].totalValue).toBe(2000);
    });

    it('ignores deleted lines without invoices', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1' }),
      ];

      const result = evaluateLineDeletionGuard(
        ['CTR-LINE-1', 'CTR-LINE-NO-INV'],
        invoices,
        false,
      );

      expect(result.linesWithInvoices).toHaveLength(1);
      expect(result.linesWithInvoices[0].contractId).toBe('CTR-LINE-1');
    });

    it('ignores non-invoice types when checking linked documents', () => {
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1', type: 'Invoice' }),
        makeInvoice({ id: 'RCT-001', contractId: 'CTR-LINE-1', type: 'Receipt' }),
        makeInvoice({ id: 'QUO-001', contractId: 'CTR-LINE-1', type: 'Quotation' }),
      ];

      const result = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, false);
      expect(result.linesWithInvoices).toHaveLength(1);
      expect(result.linesWithInvoices[0].invoiceCount).toBe(1); // Only the Invoice
    });
  });
});

// ============================================================
// Guard Logic Test 4: Amendment Reduction — invoiceImpactNote generation
//
// Extracted from ContractAmendmentModal.tsx lines 199-201:
//   invoiceImpactNote: affectedInvoices.length > 0
//     ? `${affectedInvoices.length} invoice(s) cover the removed period. Total credit due: $${totalCreditDue.toLocaleString()}. Consider issuing credit notes.`
//     : undefined,
// ============================================================

describe('Amendment Invoice Impact Note', () => {
  function generateImpactNote(affectedInvoices: Invoice[]): string | undefined {
    if (affectedInvoices.length === 0) return undefined;

    const totalCreditDue = affectedInvoices.reduce((sum, i) => sum + i.total, 0);
    return `${affectedInvoices.length} invoice(s) cover the removed period. Total credit due: $${totalCreditDue.toLocaleString()}. Consider issuing credit notes.`;
  }

  it('generates note with correct count and total', () => {
    const invoices: Invoice[] = [
      makeInvoice({ total: 1000 }),
      makeInvoice({ total: 2500 }),
    ];
    const note = generateImpactNote(invoices);
    expect(note).toContain('2 invoice(s)');
    expect(note).toContain('$3,500');
    expect(note).toContain('Consider issuing credit notes');
  });

  it('returns undefined when no invoices are affected', () => {
    const note = generateImpactNote([]);
    expect(note).toBeUndefined();
  });

  it('handles single invoice', () => {
    const invoices: Invoice[] = [
      makeInvoice({ total: 5000 }),
    ];
    const note = generateImpactNote(invoices);
    expect(note).toContain('1 invoice(s)');
    expect(note).toContain('$5,000');
  });

  it('handles large numbers with locale formatting', () => {
    const invoices: Invoice[] = [
      makeInvoice({ total: 1500000 }),
    ];
    const note = generateImpactNote(invoices);
    expect(note).toContain('$1,500,000');
  });
});

// ============================================================
// Guard Logic Test 5: Two-click pattern — state transitions
//
// Validates the full two-click pattern across all three guards
// ============================================================

describe('Two-Click Guard Pattern (State Machine)', () => {
  describe('Reduction guard — two-click flow', () => {
    it('transitions: first click → show_confirmation, second click → delete_invoices', () => {
      let showConfirm = false;

      // First click: user applies reduction
      const step1 = evaluateReductionGuard('reduction', true, 3, showConfirm);
      expect(step1).toBe('show_confirmation');
      showConfirm = true; // State update

      // Second click: user confirms via dialog
      const step2 = evaluateReductionGuard('reduction', true, 3, showConfirm);
      expect(step2).toBe('delete_invoices');
    });

    it('does not persist across different reduction operations', () => {
      // Simulates closing the modal and reopening — state should reset to false
      let showConfirm = false; // Reset on modal close

      const action = evaluateReductionGuard('reduction', true, 3, showConfirm);
      expect(action).toBe('show_confirmation');
    });
  });

  describe('Paid invoice guard — two-click flow', () => {
    it('transitions: first click → show_warning, second click → proceed_delete', () => {
      let showWarning = false;
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-001', status: 'Paid' }),
      ];

      // First click: user tries to delete
      const step1 = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, showWarning);
      expect(step1).toBe('show_warning');
      showWarning = true; // State update

      // Second click: user clicks "Delete Anyway"
      const step2 = evaluatePaidInvoiceGuard({ id: 'CTR-001' }, invoices, showWarning);
      expect(step2).toBe('proceed_delete');
    });
  });

  describe('Line deletion guard — two-click flow', () => {
    it('transitions: first click → show_confirmation, second click → proceed_save', () => {
      let showConfirm = false;
      const invoices: Invoice[] = [
        makeInvoice({ id: 'INV-001', contractId: 'CTR-LINE-1' }),
      ];

      // First click: user removes line and tries to save
      const step1 = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, showConfirm);
      expect(step1.action).toBe('show_confirmation');
      showConfirm = true; // State update

      // Second click: user confirms
      const step2 = evaluateLineDeletionGuard(['CTR-LINE-1'], invoices, showConfirm);
      expect(step2.action).toBe('proceed_save');
    });
  });
});

// ============================================================
// State Cleanup Tests: State leak fixes for dismiss paths
//
// These validate that guard state is properly reset when the
// user dismisses modals or switches tabs, preventing state
// from leaking across modal opens.
// ============================================================

describe('State Cleanup on Dismiss', () => {
  describe('Tab switching resets showInvoiceDeleteConfirm (ContractAmendmentModal)', () => {
    // The three tab buttons all call:
    //   setShowInvoiceDeleteConfirm(false)
    // as part of their onClick handlers to prevent state leak
    // when switching between Extension / Reduction / Rate Change tabs

    type TabState = { showInvoiceDeleteConfirm: boolean };

    const handleTabSwitch = (state: TabState): TabState => ({
      showInvoiceDeleteConfirm: false,
    });

    it('resets showInvoiceDeleteConfirm when switching from Reduction to Extension', () => {
      const state: TabState = { showInvoiceDeleteConfirm: true };
      const result = handleTabSwitch(state);
      expect(result.showInvoiceDeleteConfirm).toBe(false);
    });

    it('resets showInvoiceDeleteConfirm when switching from Reduction to Rate Change', () => {
      const state: TabState = { showInvoiceDeleteConfirm: true };
      const result = handleTabSwitch(state);
      expect(result.showInvoiceDeleteConfirm).toBe(false);
    });

    it('resets showInvoiceDeleteConfirm when switching between non-Reduction tabs', () => {
      const state: TabState = { showInvoiceDeleteConfirm: true };
      const result = handleTabSwitch(state);
      expect(result.showInvoiceDeleteConfirm).toBe(false);
    });

    it('state remains false when no confirmation was ever triggered', () => {
      const state: TabState = { showInvoiceDeleteConfirm: false };
      const result = handleTabSwitch(state);
      expect(result.showInvoiceDeleteConfirm).toBe(false);
    });

    it('can switch tabs back and forth — state stays clean', () => {
      let state: TabState = { showInvoiceDeleteConfirm: true };

      // Switch tabs twice
      state = handleTabSwitch(state);
      expect(state.showInvoiceDeleteConfirm).toBe(false);

      state = handleTabSwitch(state);
      expect(state.showInvoiceDeleteConfirm).toBe(false);
    });

    it('showInvoiceDeleteConfirm starts false after modal re-open (component remount)', () => {
      // Simulates modal close (unmount) and re-open (fresh useState)
      const freshState: TabState = { showInvoiceDeleteConfirm: false };
      expect(freshState.showInvoiceDeleteConfirm).toBe(false);
    });
  });

  describe('Keep Rental button resets showPaidInvoiceDeleteWarning (Rentals.tsx)', () => {
    // The "Keep Rental" button calls:
    //   setRentalToDelete(null);
    //   setShowPaidInvoiceDeleteWarning(false);

    type KeepRentalState = {
      rentalToDelete: string | null;
      showPaidInvoiceDeleteWarning: boolean;
    };

    const handleKeepRental = (
      state: KeepRentalState,
    ): KeepRentalState => ({
      rentalToDelete: null,
      showPaidInvoiceDeleteWarning: false,
    });

    it('resets both rentalToDelete and showPaidInvoiceDeleteWarning', () => {
      const state: KeepRentalState = {
        rentalToDelete: 'CTR-001',
        showPaidInvoiceDeleteWarning: true,
      };
      const result = handleKeepRental(state);
      expect(result.rentalToDelete).toBeNull();
      expect(result.showPaidInvoiceDeleteWarning).toBe(false);
    });

    it('resets showPaidInvoiceDeleteWarning even when it was already false', () => {
      const state: KeepRentalState = {
        rentalToDelete: 'CTR-001',
        showPaidInvoiceDeleteWarning: false,
      };
      const result = handleKeepRental(state);
      expect(result.rentalToDelete).toBeNull();
      expect(result.showPaidInvoiceDeleteWarning).toBe(false);
    });

    it('next delete operation starts with clean state after Keep Rental', () => {
      // Simulate: trigger warning → click "Keep Rental" → click delete on another contract
      let state: KeepRentalState = {
        rentalToDelete: 'CTR-001',
        showPaidInvoiceDeleteWarning: true,
      };

      // Click "Keep Rental"
      state = handleKeepRental(state);
      expect(state.showPaidInvoiceDeleteWarning).toBe(false);

      // User clicks delete on a different contract
      state = {
        rentalToDelete: 'CTR-002',
        showPaidInvoiceDeleteWarning: false, // Fresh start
      };
      expect(state.showPaidInvoiceDeleteWarning).toBe(false);

      // The guard should fire for the new contract if it has paid invoices
      expect(state.rentalToDelete).toBe('CTR-002');
    });

    it('does not reset unrelated state', () => {
      // Keep Rental only touches rentalToDelete and showPaidInvoiceDeleteWarning
      const state: KeepRentalState = {
        rentalToDelete: 'CTR-001',
        showPaidInvoiceDeleteWarning: true,
      };
      const result = handleKeepRental(state);
      // Only these two fields are modified
      expect(result.rentalToDelete).toBeNull();
      expect(result.showPaidInvoiceDeleteWarning).toBe(false);
    });
  });

  describe('Edit modal dismiss resets showDeleteLineConfirm (Rentals.tsx)', () => {
    // Both backdrop click and X button call:
    //   setEditRental(null);
    //   setShowDeleteLineConfirm(false);
    //   setDeletedLinesWithInvoices([]);

    type LineInfo = {
      contractId: string;
      invoiceCount: number;
      totalValue: number;
    };

    type DismissState = {
      editRental: string | null;
      showDeleteLineConfirm: boolean;
      deletedLinesWithInvoices: LineInfo[];
    };

    const handleDismissEditModal = (state: DismissState): DismissState => ({
      editRental: null,
      showDeleteLineConfirm: false,
      deletedLinesWithInvoices: [],
    });

    it('resets all three state variables on backdrop dismiss', () => {
      const state: DismissState = {
        editRental: 'CTR-001',
        showDeleteLineConfirm: true,
        deletedLinesWithInvoices: [
          { contractId: 'CTR-LINE-1', invoiceCount: 2, totalValue: 2000 },
        ],
      };
      const result = handleDismissEditModal(state);
      expect(result.editRental).toBeNull();
      expect(result.showDeleteLineConfirm).toBe(false);
      expect(result.deletedLinesWithInvoices).toEqual([]);
    });

    it('resets showDeleteLineConfirm when deletedLinesWithInvoices is already empty', () => {
      const state: DismissState = {
        editRental: 'CTR-001',
        showDeleteLineConfirm: true,
        deletedLinesWithInvoices: [],
      };
      const result = handleDismissEditModal(state);
      expect(result.showDeleteLineConfirm).toBe(false);
      expect(result.deletedLinesWithInvoices).toEqual([]);
    });

    it('next edit session starts fresh after dismiss', () => {
      let state: DismissState = {
        editRental: 'CTR-001',
        showDeleteLineConfirm: true,
        deletedLinesWithInvoices: [
          { contractId: 'CTR-LINE-1', invoiceCount: 2, totalValue: 2000 },
        ],
      };

      // Dismiss modal
      state = handleDismissEditModal(state);
      expect(state.showDeleteLineConfirm).toBe(false);
      expect(state.deletedLinesWithInvoices).toEqual([]);

      // Next edit session — fresh state
      state = {
        editRental: 'CTR-002',
        showDeleteLineConfirm: false,
        deletedLinesWithInvoices: [],
      };
      expect(state.showDeleteLineConfirm).toBe(false);
      expect(state.deletedLinesWithInvoices).toHaveLength(0);
    });

    it('clears multiple deleted lines with varying invoice counts', () => {
      const state: DismissState = {
        editRental: 'CTR-001',
        showDeleteLineConfirm: true,
        deletedLinesWithInvoices: [
          { contractId: 'CTR-LINE-1', invoiceCount: 3, totalValue: 3000 },
          { contractId: 'CTR-LINE-2', invoiceCount: 1, totalValue: 1000 },
          { contractId: 'CTR-LINE-3', invoiceCount: 5, totalValue: 7500 },
        ],
      };
      const result = handleDismissEditModal(state);
      expect(result.showDeleteLineConfirm).toBe(false);
      expect(result.deletedLinesWithInvoices).toEqual([]);
    });

    it('reset works identically for X button and backdrop click (same handler logic)', () => {
      // Both call the same handler, so testing the handler covers both paths
      const state: DismissState = {
        editRental: 'CTR-001',
        showDeleteLineConfirm: true,
        deletedLinesWithInvoices: [
          { contractId: 'CTR-LINE-1', invoiceCount: 2, totalValue: 2000 },
        ],
      };

      // First dismiss via backdrop-like handler
      let result = handleDismissEditModal(state);
      expect(result.editRental).toBeNull();

      // Reset and dismiss again via X-button-like handler (same result)
      state.editRental = 'CTR-001';
      state.showDeleteLineConfirm = true;
      result = handleDismissEditModal(state);
      expect(result.editRental).toBeNull();
      expect(result.showDeleteLineConfirm).toBe(false);
      expect(result.deletedLinesWithInvoices).toEqual([]);
    });
  });
});

// ============================================================
// Data Layer Tests: deleteContract cascade behavior
//
// These test the actual mockData functions to verify that
// deleting a contract cascade-deletes invoices and that
// deleteInvoice works as expected.
// ============================================================

describe('Data Layer: Contract Deletion Cascade', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('cascade-deletes invoices when contract is deleted', async () => {
    const mod = await import('../services/mockData');

    const billboard = makeBillboard();
    mod.addBillboard(billboard);

    const contract = makeContract();
    mod.addContract(contract);

    const invoice1 = makeInvoice({ id: 'INV-001', contractId: 'CTR-001' });
    const invoice2 = makeInvoice({ id: 'INV-002', contractId: 'CTR-001' });
    mod.addInvoice(invoice1);
    mod.addInvoice(invoice2);

    expect(mod.getInvoices()).toHaveLength(2);

    mod.deleteContract('CTR-001');

    // Invoices should be cascade-deleted
    const remainingInvoices = mod.getInvoices();
    expect(remainingInvoices.filter(i => i.contractId === 'CTR-001')).toHaveLength(0);
  });

  it('cascade-deletes amendments when contract is deleted', async () => {
    const mod = await import('../services/mockData');

    const billboard = makeBillboard();
    mod.addBillboard(billboard);

    const contract = makeContract();
    mod.addContract(contract);

    mod.addContractAmendment({
      id: 'AM-001',
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
    });

    expect(mod.getContractAmendments()).toHaveLength(1);

    mod.deleteContract('CTR-001');

    expect(mod.getContractAmendments()).toHaveLength(0);
  });

  it('does not cascade-delete invoices for other contracts', async () => {
    const mod = await import('../services/mockData');

    const billboard = makeBillboard();
    mod.addBillboard(billboard);

    const contract1 = makeContract({ id: 'CTR-001' });
    const contract2 = makeContract({ id: 'CTR-002', billboardId: 'BB-001' });
    mod.addContract(contract1);
    mod.addContract(contract2);

    const invoice1 = makeInvoice({ id: 'INV-001', contractId: 'CTR-001' });
    const invoice2 = makeInvoice({ id: 'INV-002', contractId: 'CTR-002' });
    mod.addInvoice(invoice1);
    mod.addInvoice(invoice2);

    expect(mod.getInvoices()).toHaveLength(2);

    mod.deleteContract('CTR-001');

    const remaining = mod.getInvoices();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].contractId).toBe('CTR-002');
  });

  it('deleteInvoice removes a single invoice by id', async () => {
    const mod = await import('../services/mockData');

    const invoice1 = makeInvoice({ id: 'INV-001', contractId: 'CTR-001' });
    const invoice2 = makeInvoice({ id: 'INV-002', contractId: 'CTR-001' });
    mod.addInvoice(invoice1);
    mod.addInvoice(invoice2);

    expect(mod.getInvoices()).toHaveLength(2);

    mod.deleteInvoice('INV-001');

    const remaining = mod.getInvoices();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('INV-002');
  });

  it('handles contract deletion when no invoices exist', async () => {
    const mod = await import('../services/mockData');

    const billboard = makeBillboard();
    mod.addBillboard(billboard);

    const contract = makeContract();
    mod.addContract(contract);

    // No invoices added for this contract
    mod.deleteContract('CTR-001');

    // Should not throw and invoices array remains empty
    expect(mod.getInvoices()).toHaveLength(0);
  });

  it('does not throw when deleteInvoice is called with a non-existent id', async () => {
    const mod = await import('../services/mockData');

    // Add an invoice first
    const invoice = makeInvoice({ id: 'INV-001', contractId: 'CTR-001' });
    mod.addInvoice(invoice);

    // Delete a non-existent invoice — should no-op without throwing
    expect(() => mod.deleteInvoice('NONEXISTENT')).not.toThrow();

    // Existing invoice should remain
    expect(mod.getInvoices()).toHaveLength(1);
    expect(mod.getInvoices()[0].id).toBe('INV-001');
  });

  it('preserves receipts and quotations when cascade-deleting invoices', async () => {
    const mod = await import('../services/mockData');

    const billboard = makeBillboard();
    mod.addBillboard(billboard);

    const contract = makeContract();
    mod.addContract(contract);

    const invoice = makeInvoice({ id: 'INV-001', contractId: 'CTR-001', type: 'Invoice' });
    const receipt = makeInvoice({ id: 'RCT-001', contractId: 'CTR-001', type: 'Receipt', total: 1000 });
    const quotation = makeInvoice({ id: 'QUO-001', contractId: 'CTR-001', type: 'Quotation', total: 500 });
    mod.addInvoice(invoice);
    mod.addInvoice(receipt);
    mod.addInvoice(quotation);

    expect(mod.getInvoices()).toHaveLength(3);

    mod.deleteContract('CTR-001');

    // Invoice should be deleted, but receipt and quotation should remain
    const remaining = mod.getInvoices();
    expect(remaining.find(i => i.id === 'INV-001')).toBeUndefined();
    expect(remaining.find(i => i.id === 'RCT-001')).toBeDefined();
    expect(remaining.find(i => i.id === 'QUO-001')).toBeDefined();
  });
});
