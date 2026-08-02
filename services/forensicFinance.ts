import type { Client, Expense, Invoice } from '../types';

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const money = (value: number) => value / 100;
const active = (doc: Invoice) => !doc.isVoided;
const dayMs = 86_400_000;

// Receipt approval was added after the legacy ledger existed. Legacy rows carry
// `NotRequired` (or no field in offline snapshots) and remain posted, while all
// newly recorded receipts must be explicitly approved before they affect cash
// or receivables.
function isPostedReceipt(receipt: Invoice): boolean {
  const approvalStatus = (receipt as any).approvalStatus;
  return approvalStatus === 'Approved' || approvalStatus === 'NotRequired' || approvalStatus == null;
}

export interface InvoiceForensicRow {
  invoice: Invoice;
  clientName: string;
  paid: number;
  balance: number;
  lastPaymentDate?: string;
  daysOutstanding: number;
  agingBucket: 'Current' | '1–30' | '31–60' | '61–90' | '90+';
}

export interface FinanceException {
  severity: 'critical' | 'warning';
  code: string;
  recordId: string;
  message: string;
}

export interface DuplicateInvoiceGroup {
  confidence: 'exact' | 'probable';
  key: string;
  invoices: Invoice[];
  suggestedSurvivorId: string;
}

/**
 * An optional P&L window.  Ledger balances and aging remain as-of controls,
 * while this scope determines which activity is included in the period P&L.
 */
export interface FinanceReportPeriod {
  startDate: string;
  endDate: string;
}

function agingBucket(days: number): InvoiceForensicRow['agingBucket'] {
  if (days <= 0) return 'Current';
  if (days <= 30) return '1–30';
  if (days <= 60) return '31–60';
  if (days <= 90) return '61–90';
  return '90+';
}

function stableItems(items: Invoice['items']): string {
  return (items || []).map(item => `${String(item.description || '').trim().toLowerCase()}|${cents(item.amount)}`).sort().join(';;');
}

export function detectDuplicateInvoices(invoices: Invoice[]): DuplicateInvoiceGroup[] {
  const candidates = invoices.filter(i => active(i) && i.type === 'Invoice');
  const groups = new Map<string, Invoice[]>();
  for (const invoice of candidates) {
    const key = [invoice.clientId, invoice.contractId || '', invoice.date, cents(invoice.total), stableItems(invoice.items)].join('::');
    groups.set(key, [...(groups.get(key) || []), invoice]);
  }
  const exact = [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({
    confidence: 'exact' as const,
    key,
    invoices: rows,
    suggestedSurvivorId: [...rows].sort((a, b) => String((a as any).createdAt || '').localeCompare(String((b as any).createdAt || '')) || a.id.localeCompare(b.id))[0].id,
  }));

  const exactIds = new Set(exact.flatMap(group => group.invoices.map(i => i.id)));
  const probableGroups = new Map<string, Invoice[]>();
  for (const invoice of candidates.filter(i => !exactIds.has(i.id))) {
    const month = invoice.date.slice(0, 7);
    const key = [invoice.clientId, invoice.contractId || '', month, cents(invoice.total)].join('::');
    probableGroups.set(key, [...(probableGroups.get(key) || []), invoice]);
  }
  const probable = [...probableGroups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({
    confidence: 'probable' as const,
    key,
    invoices: rows,
    suggestedSurvivorId: [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0].id,
  }));
  return [...exact, ...probable];
}

export function buildForensicFinanceReport(
  invoices: Invoice[],
  clients: Client[],
  expenses: Expense[],
  asOf = new Date(),
  period?: FinanceReportPeriod,
) {
  const clientNames = new Map(clients.map(c => [c.id, c.companyName]));
  const postedInvoices = invoices.filter(i => active(i) && i.type === 'Invoice');
  // Only approved receipts affect cash and receivables. Pending receipts stay
  // visible as exceptions but must not settle invoices in the report.
  const receipts = invoices.filter(i => active(i) && i.type === 'Receipt' && isPostedReceipt(i));
  const reviewReceipts = invoices.filter(i => active(i) && i.type === 'Receipt' && !receipts.some(posted => posted.id === i.id));
  const receiptsByInvoice = new Map<string, Invoice[]>();
  for (const receipt of receipts) {
    if (!receipt.linkedInvoiceId) continue;
    receiptsByInvoice.set(receipt.linkedInvoiceId, [...(receiptsByInvoice.get(receipt.linkedInvoiceId) || []), receipt]);
  }

  const rows: InvoiceForensicRow[] = postedInvoices.map(invoice => {
    const allocated = receiptsByInvoice.get(invoice.id) || [];
    const paidCents = allocated.reduce((sum, r) => sum + cents(r.total), 0);
    const balanceCents = Math.max(0, cents(invoice.total) - paidCents);
    const due = invoice.dueDate || invoice.date;
    const dueTime = Date.parse(`${due}T00:00:00Z`);
    const days = balanceCents > 0 && Number.isFinite(dueTime) ? Math.max(0, Math.floor((asOf.getTime() - dueTime) / dayMs)) : 0;
    return {
      invoice,
      clientName: clientNames.get(invoice.clientId) || 'Unknown client',
      paid: money(paidCents),
      balance: money(balanceCents),
      lastPaymentDate: allocated.map(r => r.date).sort().at(-1),
      daysOutstanding: days,
      agingBucket: agingBucket(days),
    };
  });

  const exceptions: FinanceException[] = [];
  for (const receipt of reviewReceipts) {
    const approvalStatus = String((receipt as any).approvalStatus || 'Pending');
    exceptions.push({
      severity: 'warning',
      code: approvalStatus === 'Rejected' ? 'REJECTED_RECEIPT' : 'PENDING_RECEIPT_REVIEW',
      recordId: receipt.id,
      message: approvalStatus === 'Rejected'
        ? 'Rejected payment is excluded from cash and receivables.'
        : 'Payment is awaiting approval and is excluded from cash and receivables.',
    });
  }
  for (const receipt of receipts) {
    if (!receipt.receivedBy) exceptions.push({ severity: 'critical', code: 'MISSING_RECEIVER', recordId: receipt.id, message: 'Payment has no named receiver.' });
    if (!receipt.paymentReference) exceptions.push({ severity: 'critical', code: 'MISSING_REFERENCE', recordId: receipt.id, message: 'Payment has no reference.' });
    if (!receipt.linkedInvoiceId || !postedInvoices.some(i => i.id === receipt.linkedInvoiceId)) exceptions.push({ severity: 'critical', code: 'ORPHAN_PAYMENT', recordId: receipt.id, message: 'Payment is not allocated to a valid posted invoice.' });
    if (/bank|transfer|rtgs|swift|wire/i.test(String(receipt.paymentMethod || '')) && !receipt.proofPaymentUrl) exceptions.push({ severity: 'critical', code: 'MISSING_BANK_PROOF', recordId: receipt.id, message: 'Bank payment has no proof of payment.' });
    if (/bank|transfer|rtgs|swift|wire/i.test(String(receipt.paymentMethod || '')) && !receipt.receivingAccount) exceptions.push({ severity: 'warning', code: 'MISSING_BANK_ACCOUNT', recordId: receipt.id, message: 'Bank payment has no receiving account.' });
  }
  for (const row of rows) {
    if (row.invoice.status === 'Paid' && row.balance > 0.009) exceptions.push({ severity: 'critical', code: 'FALSE_PAID_STATUS', recordId: row.invoice.id, message: `Marked paid with $${row.balance.toFixed(2)} outstanding.` });
    if (row.paid - Number(row.invoice.total) > 0.01) exceptions.push({ severity: 'critical', code: 'OVERALLOCATED', recordId: row.invoice.id, message: 'Allocated payments exceed invoice total.' });
  }

  const duplicateGroups = detectDuplicateInvoices(invoices);
  for (const group of duplicateGroups) {
    exceptions.push({ severity: group.confidence === 'exact' ? 'critical' : 'warning', code: `${group.confidence.toUpperCase()}_DUPLICATE`, recordId: group.invoices.map(i => i.id).join(', '), message: `${group.invoices.length} ${group.confidence} duplicate candidates; suggested survivor ${group.suggestedSurvivorId}.` });
  }

  const billedCents = postedInvoices.reduce((sum, i) => sum + cents(i.total), 0);
  const netRevenueCents = postedInvoices.reduce((sum, i) => sum + cents(i.subtotal), 0);
  const vatCents = postedInvoices.reduce((sum, i) => sum + cents(i.vatAmount), 0);
  const collectedCents = receipts.reduce((sum, i) => sum + cents(i.total), 0);
  const expensesCents = expenses.reduce((sum, e) => sum + cents(e.amount), 0);
  const aging = rows.reduce((acc, row) => { acc[row.agingBucket] += row.balance; return acc; }, { Current: 0, '1–30': 0, '31–60': 0, '61–90': 0, '90+': 0 } as Record<InvoiceForensicRow['agingBucket'], number>);

  const isInPeriod = (date: string) => !!period && date >= period.startDate && date <= period.endDate;
  const periodInvoices = period ? postedInvoices.filter(invoice => isInPeriod(invoice.date)) : [];
  const periodReceipts = period ? receipts.filter(receipt => isInPeriod(receipt.date)) : [];
  const periodExpenses = period ? expenses.filter(expense => isInPeriod(expense.date)) : [];
  const periodBilledCents = periodInvoices.reduce((sum, invoice) => sum + cents(invoice.total), 0);
  const periodNetRevenueCents = periodInvoices.reduce((sum, invoice) => sum + cents(invoice.subtotal), 0);
  const periodVatCents = periodInvoices.reduce((sum, invoice) => sum + cents(invoice.vatAmount), 0);
  const periodCollectedCents = periodReceipts.reduce((sum, receipt) => sum + cents(receipt.total), 0);
  const periodExpensesCents = periodExpenses.reduce((sum, expense) => sum + cents(expense.amount), 0);

  return {
    asOf: asOf.toISOString(),
    invoices: rows,
    receipts,
    reviewReceipts,
    exceptions,
    duplicateGroups,
    aging,
    totals: {
      billed: money(billedCents),
      netRevenue: money(netRevenueCents),
      vatLiability: money(vatCents),
      collected: money(collectedCents),
      outstanding: rows.reduce((sum, row) => sum + row.balance, 0),
      expenses: money(expensesCents),
      operatingResult: money(netRevenueCents - expensesCents),
    },
    // Keep the as-of ledger controls above intact, but expose an explicitly
    // period-scoped P&L whenever the caller supplies a reporting window.
    // This prevents invoices from before the selected start date from being
    // included in a period operating result merely because they are needed for
    // end-date receivables aging.
    period: period ? {
      startDate: period.startDate,
      endDate: period.endDate,
      invoiceGross: money(periodBilledCents),
      invoiceNet: money(periodNetRevenueCents),
      vat: money(periodVatCents),
      cashCollected: money(periodCollectedCents),
      expenses: money(periodExpensesCents),
      operatingResult: money(periodNetRevenueCents - periodExpensesCents),
    } : undefined,
  };
}
