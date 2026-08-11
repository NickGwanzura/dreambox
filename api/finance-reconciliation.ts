import type { HttpRequest, HttpResponse } from '../lib/http';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { buildForensicFinanceReport } from '../services/forensicFinance';

const asMoney = (value: unknown): number => Number(value) || 0;
const MAX_RECONCILIATION_ROWS = 20_000;

/**
 * Reconciliation is intentionally read-only. It exposes enough ledger facts
 * to investigate discrepancies without returning a receipt document (and its
 * payment-proof URL) to the caller.
 */
function isRecognizedReceipt(receipt: any): boolean {
  const approvalStatus = receipt.approvalStatus;
  return approvalStatus === 'Approved' || approvalStatus === 'NotRequired' || approvalStatus == null;
}

function toForensicInvoice(row: any) {
  return {
    ...row,
    subtotal: asMoney(row.subtotal),
    discountAmount: row.discountAmount == null ? undefined : asMoney(row.discountAmount),
    vatAmount: asMoney(row.vatAmount),
    total: asMoney(row.total),
    proofUploadedAt: row.proofUploadedAt?.toISOString?.() ?? row.proofUploadedAt,
    recordedAt: row.recordedAt?.toISOString?.() ?? row.recordedAt,
    postedAt: row.postedAt?.toISOString?.() ?? row.postedAt,
    voidedAt: row.voidedAt?.toISOString?.() ?? row.voidedAt,
  };
}

function duplicateInvoiceSummary(invoice: any) {
  return {
    id: invoice.id,
    clientId: invoice.clientId,
    contractId: invoice.contractId || null,
    date: invoice.date,
    subtotal: asMoney(invoice.subtotal),
    vatAmount: asMoney(invoice.vatAmount),
    total: asMoney(invoice.total),
    status: invoice.status,
  };
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const actor = await requireManagerOrAdmin(req, res);
  if (!actor) return;

  try {
    const [documentRows, clients, expenseRows] = await Promise.all([
      prisma.invoice.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_RECONCILIATION_ROWS + 1 }),
      prisma.client.findMany({ take: MAX_RECONCILIATION_ROWS + 1 }),
      prisma.expense.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], take: MAX_RECONCILIATION_ROWS + 1 }),
    ]);

    if (documentRows.length > MAX_RECONCILIATION_ROWS || clients.length > MAX_RECONCILIATION_ROWS || expenseRows.length > MAX_RECONCILIATION_ROWS) {
      return res.status(413).json({ error: 'Reconciliation dataset is too large. Narrow the reporting period or run an offline export.' });
    }

    const documents = documentRows.map(toForensicInvoice);
    const expenses = expenseRows.map((row: any) => ({ ...row, amount: asMoney(row.amount) }));
    const report = buildForensicFinanceReport(documents as any, clients as any, expenses as any, new Date());
    const activeInvoices = documents.filter((document: any) => document.type === 'Invoice' && !document.isVoided);
    const activeReceipts = documents.filter((document: any) => document.type === 'Receipt' && !document.isVoided);
    const recognizedReceipts = activeReceipts.filter(isRecognizedReceipt);
    const reviewReceipts = activeReceipts.filter((receipt: any) => !isRecognizedReceipt(receipt));

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      basis: 'Read-only reconciliation of active ledger documents. Cash is limited to approved or legacy-recognized receipts; pending and rejected receipts are findings only.',
      controls: {
        invoiceCount: activeInvoices.length,
        receiptCount: activeReceipts.length,
        recognizedReceiptCount: recognizedReceipts.length,
        reviewReceiptCount: reviewReceipts.length,
        invoiceGross: activeInvoices.reduce((sum: number, invoice: any) => sum + asMoney(invoice.total), 0),
        invoiceNet: activeInvoices.reduce((sum: number, invoice: any) => sum + asMoney(invoice.subtotal), 0),
        vat: activeInvoices.reduce((sum: number, invoice: any) => sum + asMoney(invoice.vatAmount), 0),
        cashCollected: recognizedReceipts.reduce((sum: number, receipt: any) => sum + asMoney(receipt.total), 0),
        recordedReceiptGross: activeReceipts.reduce((sum: number, receipt: any) => sum + asMoney(receipt.total), 0),
        expenses: expenses.reduce((sum: number, expense: any) => sum + asMoney(expense.amount), 0),
        outstanding: report.totals.outstanding,
      },
      findings: report.exceptions.map(finding => ({
        severity: finding.severity,
        code: finding.code,
        recordId: finding.recordId,
        message: finding.message,
      })),
      exactDuplicateGroups: report.duplicateGroups
        .filter(group => group.confidence === 'exact')
        .map(group => ({
          confidence: group.confidence,
          key: group.key,
          suggestedSurvivorId: group.suggestedSurvivorId,
          invoices: group.invoices.map(duplicateInvoiceSummary),
        })),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Could not reconcile the finance ledger.',
      detail: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
}
