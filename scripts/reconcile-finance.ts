/**
 * Forensic finance reconciliation and duplicate correction.
 *
 * Default: read-only report
 * Apply exact duplicate voids only:
 *   npm run finance:reconcile -- --apply --confirm=VOID_EXACT_DUPLICATES
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--confirm=VOID_EXACT_DUPLICATES');
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const stableItems = (items: any) => (Array.isArray(items) ? items : []).map((item: any) => `${String(item.description || '').trim().toLowerCase()}|${cents(item.amount)}`).sort().join(';;');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (apply && !confirmed) throw new Error('Apply mode requires --confirm=VOID_EXACT_DUPLICATES. Run without --apply first and review the report.');

  const [documents, expenses] = await Promise.all([
    prisma.invoice.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.expense.findMany(),
  ]);
  const invoices = documents.filter(doc => doc.type === 'Invoice' && !doc.isVoided);
  const receipts = documents.filter(doc => doc.type === 'Receipt' && !doc.isVoided);
  const byExactKey = new Map<string, typeof invoices>();
  for (const invoice of invoices) {
    const key = [invoice.clientId, invoice.contractId || '', invoice.date, cents(invoice.total), stableItems(invoice.items)].join('::');
    byExactKey.set(key, [...(byExactKey.get(key) || []), invoice]);
  }
  const duplicateGroups = [...byExactKey.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, survivor: rows[0], duplicates: rows.slice(1) }));

  const findings: any[] = [];
  for (const receipt of receipts) {
    if (!receipt.receivedBy) findings.push({ severity: 'critical', code: 'MISSING_RECEIVER', id: receipt.id });
    if (!receipt.paymentReference) findings.push({ severity: 'critical', code: 'MISSING_REFERENCE', id: receipt.id });
    if (!receipt.linkedInvoiceId || !invoices.some(invoice => invoice.id === receipt.linkedInvoiceId)) findings.push({ severity: 'critical', code: 'ORPHAN_PAYMENT', id: receipt.id, linkedInvoiceId: receipt.linkedInvoiceId });
    if (/bank|transfer|rtgs|swift|wire/i.test(receipt.paymentMethod || '') && !receipt.proofPaymentUrl) findings.push({ severity: 'critical', code: 'MISSING_BANK_PROOF', id: receipt.id });
  }
  for (const group of duplicateGroups) findings.push({ severity: 'critical', code: 'EXACT_DUPLICATE_INVOICE', survivor: group.survivor.id, duplicates: group.duplicates.map(i => i.id), key: group.key });

  const applied: any[] = [];
  const skipped: any[] = [];
  if (apply) {
    for (const group of duplicateGroups) {
      for (const duplicate of group.duplicates) {
        const [survivorReceipts, duplicateReceipts] = await Promise.all([
          prisma.invoice.findMany({ where: { type: 'Receipt', linkedInvoiceId: group.survivor.id, isVoided: false } }),
          prisma.invoice.findMany({ where: { type: 'Receipt', linkedInvoiceId: duplicate.id, isVoided: false } }),
        ]);
        const combinedPaid = [...survivorReceipts, ...duplicateReceipts].reduce((sum, receipt) => sum + cents(receipt.total), 0);
        if (combinedPaid > cents(group.survivor.total) + 1) {
          skipped.push({ duplicate: duplicate.id, reason: 'Reassigning payments would overallocate the survivor; manual review required.' });
          continue;
        }
        await prisma.$transaction(async tx => {
          for (const receipt of duplicateReceipts) {
            await tx.invoice.update({ where: { id: receipt.id }, data: { linkedInvoiceId: group.survivor.id } });
            await tx.paymentAllocation.updateMany({ where: { receiptId: receipt.id, invoiceId: duplicate.id, isReversed: false }, data: { invoiceId: group.survivor.id } });
          }
          const voidReason = `Confirmed exact duplicate of invoice ${group.survivor.id}; preserved during forensic reconciliation`;
          const voided = await tx.invoice.update({ where: { id: duplicate.id }, data: { isVoided: true, voidReason, voidedAt: new Date(), voidedBy: 'finance-reconciliation-script' } });
          const paid = combinedPaid / 100;
          await tx.invoice.update({ where: { id: group.survivor.id }, data: { status: paid + 0.01 >= Number(group.survivor.total) ? 'Paid' : 'Pending' } });
          await tx.auditLog.create({ data: { action: 'Finance: Duplicate Invoice Voided', details: `${duplicate.id} voided as exact duplicate of survivor ${group.survivor.id}; ${duplicateReceipts.length} payment(s) reassigned`, userEmail: 'finance-reconciliation-script', tableName: 'invoices', recordId: duplicate.id, beforeData: duplicate as any, afterData: voided as any } });
        });
        applied.push({ duplicate: duplicate.id, survivor: group.survivor.id, reassignedPayments: duplicateReceipts.map(r => r.id) });
      }
    }
  }

  const report = {
    mode: apply ? 'APPLY_CONFIRMED_EXACT_DUPLICATES' : 'DRY_RUN_READ_ONLY',
    generatedAt: new Date().toISOString(),
    controls: {
      invoiceCount: invoices.length,
      receiptCount: receipts.length,
      invoiceGross: invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
      invoiceNet: invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0),
      vat: invoices.reduce((sum, invoice) => sum + Number(invoice.vatAmount), 0),
      receipts: receipts.reduce((sum, receipt) => sum + Number(receipt.total), 0),
      expenses: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    },
    findings,
    exactDuplicateGroups: duplicateGroups.map(group => ({ survivor: group.survivor.id, duplicates: group.duplicates.map(i => i.id), clientId: group.survivor.clientId, contractId: group.survivor.contractId, date: group.survivor.date, total: Number(group.survivor.total) })),
    applied,
    skipped,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }).finally(() => process.env.DATABASE_URL ? prisma.$disconnect() : undefined);
