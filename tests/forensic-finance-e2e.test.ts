// Forensic finance integration tests. No external database connection is used.
import { describe, expect, it } from 'vitest';
import type { Client, Expense, Invoice } from '../types';
import { buildForensicFinanceReport, detectDuplicateInvoices } from '../services/forensicFinance';

const client: Client = { id: 'client-1', companyName: 'Acme', contactPerson: 'A', phone: '1', status: 'Active' };
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({ id: 'invoice-1', clientId: 'client-1', date: '2026-07-01', dueDate: '2026-07-31', items: [{ description: 'Campaign', amount: 115.5 }], subtotal: 100, vatAmount: 15.5, total: 115.5, status: 'Pending', type: 'Invoice', ...overrides });
const receipt = (overrides: Partial<Invoice> = {}): Invoice => ({ id: 'receipt-1', clientId: 'client-1', date: '2026-07-15', items: [{ description: 'Payment', amount: 115.5 }], subtotal: 115.5, vatAmount: 0, total: 115.5, status: 'Paid', type: 'Receipt', linkedInvoiceId: 'invoice-1', paymentMethod: 'Bank Transfer', paymentReference: 'BANK-1', receivedBy: 'Jane Doe', receivedByUserId: 'user-1', receivingAccount: 'CBZ USD', proofPaymentUrl: 'https://example.com/proof.pdf', proofOriginalName: 'proof.pdf', proofMimeType: 'application/pdf', proofUploadedAt: '2026-07-15T10:00:00Z', ...overrides });
const expense: Expense = { id: 'expense-1', category: 'Other', description: 'Operations', amount: 20, date: '2026-07-10' };

describe('forensic finance end-to-end invariants', () => {
  it('ties an invoice balance to its payment and exposes cash/accrual/VAT controls', () => {
    const report = buildForensicFinanceReport([invoice(), receipt()], [client], [expense], new Date('2026-08-01T00:00:00Z'));
    expect(report.invoices[0]).toMatchObject({ paid: 115.5, balance: 0, lastPaymentDate: '2026-07-15' });
    expect(report.totals).toMatchObject({ billed: 115.5, netRevenue: 100, vatLiability: 15.5, collected: 115.5, outstanding: 0, expenses: 20, operatingResult: 80 });
    expect(report.exceptions).toHaveLength(0);
  });

  it('resolves legacy receipt linkage from the line-item description', () => {
    const legacyReceipt = receipt({
      linkedInvoiceId: undefined,
      items: [{ description: 'Payment for Invoice #invoice-1', amount: 115.5 }],
    });
    const report = buildForensicFinanceReport([invoice(), legacyReceipt], [client], [], new Date('2026-08-01T00:00:00Z'));
    expect(report.totals.outstanding).toBe(0);
    expect(report.exceptions.some(item => item.code === 'ORPHAN_PAYMENT')).toBe(false);
    expect(report.receipts[0].linkedInvoiceId).toBe('invoice-1');
  });

  it('finds legacy payment evidence gaps and false paid statuses', () => {
    const report = buildForensicFinanceReport([invoice({ status: 'Paid' }), receipt({ receivedBy: undefined, proofPaymentUrl: undefined, linkedInvoiceId: undefined })], [client], [], new Date('2026-08-01T00:00:00Z'));
    expect(report.exceptions.map(item => item.code)).toEqual(expect.arrayContaining(['MISSING_RECEIVER', 'MISSING_BANK_PROOF', 'ORPHAN_PAYMENT', 'FALSE_PAID_STATUS']));
  });

  it('excludes voided documents from every control total', () => {
    const report = buildForensicFinanceReport([invoice({ isVoided: true }), receipt({ isVoided: true })], [client], [], new Date());
    expect(report.totals.billed).toBe(0); expect(report.totals.collected).toBe(0); expect(report.invoices).toHaveLength(0); expect(report.receipts).toHaveLength(0);
  });

  it('keeps pending and rejected receipts out of cash and receivable settlement', () => {
    const pending = receipt({ id: 'receipt-pending', approvalStatus: 'Pending' } as any);
    const rejected = receipt({ id: 'receipt-rejected', approvalStatus: 'Rejected' } as any);
    const report = buildForensicFinanceReport([invoice(), pending, rejected], [client], [], new Date('2026-08-01T00:00:00Z'));

    expect(report.invoices[0]).toMatchObject({ paid: 0, balance: 115.5 });
    expect(report.totals.collected).toBe(0);
    expect(report.receipts).toHaveLength(0);
    expect(report.reviewReceipts.map(item => item.id)).toEqual(['receipt-pending', 'receipt-rejected']);
    expect(report.exceptions.map(item => item.code)).toEqual(expect.arrayContaining(['PENDING_RECEIPT_REVIEW', 'REJECTED_RECEIPT']));
  });

  it('keeps end-date aging controls while calculating P&L only inside the requested period', () => {
    const report = buildForensicFinanceReport(
      [
        invoice({ id: 'prior-invoice', date: '2026-06-15', dueDate: '2026-06-30', subtotal: 100, vatAmount: 15.5, total: 115.5 }),
        invoice({ id: 'period-invoice', date: '2026-07-15', dueDate: '2026-07-31', subtotal: 200, vatAmount: 31, total: 231 }),
        receipt({ id: 'period-receipt', linkedInvoiceId: 'period-invoice', date: '2026-07-20', subtotal: 231, total: 231 }),
      ],
      [client],
      [
        { ...expense, id: 'prior-expense', date: '2026-06-20', amount: 25 },
        { ...expense, id: 'period-expense', date: '2026-07-20', amount: 40 },
      ],
      new Date('2026-07-31T23:59:59Z'),
      { startDate: '2026-07-01', endDate: '2026-07-31' },
    );

    // Receivables still include the June invoice as at the reporting date.
    expect(report.totals).toMatchObject({ netRevenue: 300, expenses: 65, outstanding: 115.5 });
    // The July P&L cannot be inflated by June activity.
    expect(report.period).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      invoiceGross: 231,
      invoiceNet: 200,
      vat: 31,
      cashCollected: 231,
      expenses: 40,
      operatingResult: 160,
    });
  });

  it('classifies identical invoice facts as exact duplicate candidates', () => {
    const groups = detectDuplicateInvoices([invoice(), invoice({ id: 'invoice-2' })]);
    expect(groups).toHaveLength(1); expect(groups[0].confidence).toBe('exact'); expect(groups[0].suggestedSurvivorId).toBe('invoice-1');
  });

  it('does not classify different line-item evidence as an exact duplicate', () => {
    const groups = detectDuplicateInvoices([invoice(), invoice({ id: 'invoice-2', items: [{ description: 'Different campaign', amount: 115.5 }] })]);
    expect(groups.every(group => group.confidence !== 'exact')).toBe(true);
  });
});
