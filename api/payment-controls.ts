import type { HttpRequest, HttpResponse } from '../lib/http';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { cors, requireManagerOrAdmin } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { assertPeriodsOpen } from '../lib/accountingPeriod';

const actionSchema = z.object({
  receiptId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'resolve-remediation']),
  note: z.string().trim().min(10).max(2000),
});

const EFFECTIVE_RECEIPT_APPROVALS = ['Approved', 'NotRequired'];
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

class PaymentIntegrityError extends Error {
  constructor(message: string, readonly status = 409, readonly existingId?: string) {
    super(message);
    this.name = 'PaymentIntegrityError';
  }
}

function withoutProofUrl<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const { proofPaymentUrl: _proofPaymentUrl, ...safe } = value as Record<string, unknown>;
  return safe as T;
}

function isBankPayment(method: unknown): boolean {
  return /bank|transfer|rtgs|swift|wire/i.test(String(method || ''));
}

function assertReceiptEvidence(receipt: any): void {
  if (!String(receipt.receivedBy || '').trim()) throw new PaymentIntegrityError('Receipt is missing the payment receiver and cannot be approved.');
  if (!String(receipt.receivedByUserId || '').trim()) throw new PaymentIntegrityError('Receipt is missing the payment recorder and cannot be approved.');
  if (!String(receipt.paymentMethod || '').trim()) throw new PaymentIntegrityError('Receipt is missing the payment method and cannot be approved.');
  if (!String(receipt.paymentReference || '').trim()) throw new PaymentIntegrityError('Receipt is missing the payment reference and cannot be approved.');
  if (isBankPayment(receipt.paymentMethod) && (!String(receipt.receivingAccount || '').trim() || !receipt.proofPaymentUrl || !receipt.proofOriginalName || !receipt.proofMimeType || !receipt.proofUploadedAt)) {
    throw new PaymentIntegrityError('Bank receipt evidence is incomplete and cannot be approved.');
  }
}

async function lockInvoice(tx: any, invoiceId: string): Promise<void> {
  if (typeof tx.$queryRaw !== 'function') return;
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`);
}

async function lockPaymentReference(tx: any, paymentMethod: unknown, paymentReference: unknown): Promise<void> {
  if (typeof tx.$queryRaw !== 'function') return;
  const key = `${String(paymentMethod || '').trim().toLocaleLowerCase()}\u0000${String(paymentReference || '').trim().toLocaleLowerCase()}`;
  // Serializes the application-level duplicate check even on databases whose
  // legacy duplicate rows prevent installation of the partial unique index.
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

async function activeReceiptAllocations(tx: any, receiptId: string): Promise<Array<{ id?: string; invoiceId: string; amount: unknown }>> {
  return (await tx.paymentAllocation.findMany({
    where: { receiptId, isReversed: false },
    select: { id: true, invoiceId: true, amount: true },
  })) || [];
}

async function effectiveAllocatedTotal(tx: any, invoiceId: string, excludeReceiptId?: string): Promise<number> {
  const allocations = await tx.paymentAllocation.findMany({
    where: {
      invoiceId,
      isReversed: false,
      ...(excludeReceiptId ? { receiptId: { not: excludeReceiptId } } : {}),
      receipt: {
        is: {
          type: 'Receipt',
          isVoided: false,
          approvalStatus: { in: EFFECTIVE_RECEIPT_APPROVALS },
        },
      },
    },
    select: { amount: true },
  });
  return roundMoney((allocations || []).reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
}

async function recalculateInvoiceStatus(tx: any, invoiceId: string): Promise<void> {
  await lockInvoice(tx, invoiceId);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.type !== 'Invoice' || invoice.isVoided) return;
  const paid = await effectiveAllocatedTotal(tx, invoice.id);
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: Number(invoice.total) - paid <= 0.01 ? 'Paid' : 'Pending' },
  });
}

async function assertNoDuplicateReference(tx: any, receipt: any): Promise<void> {
  await lockPaymentReference(tx, receipt.paymentMethod, receipt.paymentReference);
  const duplicate = await tx.invoice.findFirst({
    where: {
      type: 'Receipt',
      isVoided: false,
      id: { not: receipt.id },
      paymentMethod: { equals: String(receipt.paymentMethod || '').trim(), mode: 'insensitive' },
      paymentReference: { equals: String(receipt.paymentReference || '').trim(), mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (duplicate) throw new PaymentIntegrityError(`Payment reference already exists on receipt ${duplicate.id}.`, 409, duplicate.id);
}

async function approveReceipt(tx: any, receipt: any, payload: any, note: string): Promise<any> {
  if (!['Pending', 'NotRequired'].includes(receipt.approvalStatus || 'NotRequired')) {
    throw new PaymentIntegrityError(`Receipt is already ${String(receipt.approvalStatus || 'approved').toLowerCase()}.`);
  }
  if (receipt.receivedByUserId === payload.userId) throw new PaymentIntegrityError('The payment recorder cannot approve their own payment.');
  assertReceiptEvidence(receipt);
  await assertPeriodsOpen([receipt.date], payload.email, tx);
  await assertNoDuplicateReference(tx, receipt);

  const allocations = await activeReceiptAllocations(tx, receipt.id);
  const targetIds = new Set(allocations.map(allocation => allocation.invoiceId));
  if (receipt.linkedInvoiceId) targetIds.add(receipt.linkedInvoiceId);
  const invoiceIds = [...targetIds].sort();
  const invoices = new Map<string, any>();

  for (const invoiceId of invoiceIds) {
    await lockInvoice(tx, invoiceId);
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.type !== 'Invoice' || invoice.isVoided) {
      throw new PaymentIntegrityError('Linked invoice is missing, voided, or not an invoice. Resolve the payment remediation before approval.');
    }
    await assertPeriodsOpen([invoice.date], payload.email, tx);
    invoices.set(invoiceId, invoice);
  }

  if (receipt.linkedInvoiceId && allocations.some(allocation => allocation.invoiceId !== receipt.linkedInvoiceId)) {
    throw new PaymentIntegrityError('Receipt allocation does not match its linked invoice. Resolve the payment remediation before approval.');
  }

  const proposedByInvoice = new Map<string, number>();
  if (allocations.length > 0) {
    for (const allocation of allocations) {
      proposedByInvoice.set(allocation.invoiceId, roundMoney((proposedByInvoice.get(allocation.invoiceId) || 0) + Number(allocation.amount)));
    }
  } else if (receipt.linkedInvoiceId) {
    proposedByInvoice.set(receipt.linkedInvoiceId, roundMoney(Number(receipt.total)));
  }

  const proposedTotal = roundMoney([...proposedByInvoice.values()].reduce((sum, amount) => sum + amount, 0));
  if (allocations.length > 0 && Math.abs(proposedTotal - Number(receipt.total)) > 0.01) {
    throw new PaymentIntegrityError('Receipt allocation total does not match the receipt total. Resolve the payment remediation before approval.');
  }

  for (const [invoiceId, proposed] of proposedByInvoice) {
    const invoice = invoices.get(invoiceId);
    const alreadyAllocated = await effectiveAllocatedTotal(tx, invoiceId, receipt.id);
    const remaining = roundMoney(Number(invoice.total) - alreadyAllocated);
    if (proposed <= 0 || proposed - remaining > 0.01) {
      throw new PaymentIntegrityError(`Receipt exceeds the outstanding balance of $${Math.max(0, remaining).toFixed(2)}.`);
    }
  }

  // Marking the receipt approved before inserting the allocation satisfies the
  // database trigger that forbids allocations for pending/rejected receipts.
  const now = new Date();
  const approved = await tx.invoice.update({
    where: { id: receipt.id },
    data: { approvalStatus: 'Approved', approvedBy: payload.userId, approvedAt: now, approvalNote: note, status: 'Paid' },
  });
  if (allocations.length === 0 && receipt.linkedInvoiceId) {
    await tx.paymentAllocation.create({
      data: { receiptId: receipt.id, invoiceId: receipt.linkedInvoiceId, amount: receipt.total, allocatedBy: payload.userId },
    });
  }
  for (const invoiceId of invoiceIds) await recalculateInvoiceStatus(tx, invoiceId);
  return approved;
}

async function rejectReceipt(tx: any, receipt: any, payload: any, note: string): Promise<any> {
  if (receipt.approvalStatus === 'Rejected') throw new PaymentIntegrityError('Receipt is already rejected.');
  await assertPeriodsOpen([receipt.date], payload.email, tx);
  const allocations = await activeReceiptAllocations(tx, receipt.id);
  const invoiceIds = [...new Set(allocations.map(allocation => allocation.invoiceId))].sort();
  for (const invoiceId of invoiceIds) {
    await lockInvoice(tx, invoiceId);
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (invoice?.type === 'Invoice' && !invoice.isVoided) await assertPeriodsOpen([invoice.date], payload.email, tx);
  }

  // Reverse first: the database guard deliberately rejects a transition to an
  // ineffective approval state while an active allocation remains.
  if (allocations.length > 0) {
    await tx.paymentAllocation.updateMany({
      where: { receiptId: receipt.id, isReversed: false },
      data: { isReversed: true, reversedAt: new Date(), reversedBy: payload.userId, reason: `Rejected: ${note}` },
    });
  }
  const rejected = await tx.invoice.update({
    where: { id: receipt.id },
    data: { approvalStatus: 'Rejected', approvedBy: null, approvedAt: null, approvalNote: note, status: 'Pending' },
  });
  for (const invoiceId of invoiceIds) await recalculateInvoiceStatus(tx, invoiceId);
  return rejected;
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireManagerOrAdmin(req, res);
  if (!payload) return;
  if (req.method === 'GET') {
    try {
      const receipts = await prisma.invoice.findMany({
        where: {
          type: 'Receipt',
          isVoided: false,
          OR: [
            { receivedBy: null },
            { receivedByUserId: null },
            { paymentReference: null },
            { approvalStatus: { in: ['Pending', 'Rejected'] } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      return res.status(200).json(receipts.map(withoutProofUrl));
    } catch {
      return res.status(500).json({ error: 'Could not load payment controls.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = actionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Receipt, action, and a meaningful note are required.' });
  const { receiptId, action, note } = parsed.data;

  try {
    const updated = await prisma.$transaction(async tx => {
      const receipt = await tx.invoice.findUnique({ where: { id: receiptId } });
      if (!receipt || receipt.type !== 'Receipt') throw new PaymentIntegrityError('Receipt not found', 404);
      if (receipt.isVoided) throw new PaymentIntegrityError('Voided receipts cannot be approved or rejected.');

      const row = action === 'approve'
        ? await approveReceipt(tx, receipt, payload, note)
        : action === 'reject'
          ? await rejectReceipt(tx, receipt, payload, note)
          : receipt;
      await tx.paymentReview.upsert({
        where: { receiptId },
        create: { receiptId, status: action === 'resolve-remediation' ? 'Resolved' : 'Closed', resolvedBy: payload.userId, resolvedAt: new Date(), resolutionNote: note },
        update: { status: action === 'resolve-remediation' ? 'Resolved' : 'Closed', resolvedBy: payload.userId, resolvedAt: new Date(), resolutionNote: note },
      });
      await tx.auditLog.create({
        data: {
          action: `PAYMENT_${action.toUpperCase()}`,
          details: `Receipt ${receiptId}: ${note}`,
          userId: payload.userId,
          userEmail: payload.email,
          tableName: 'invoices',
          recordId: receiptId,
          beforeData: receipt as any,
          afterData: row as any,
        },
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.status(200).json(withoutProofUrl(updated));
  } catch (error: any) {
    if (error instanceof PaymentIntegrityError) {
      return res.status(error.status).json({ error: error.message, ...(error.existingId ? { existingId: error.existingId } : {}) });
    }
    if (error?.code === 'P2002') return res.status(409).json({ error: 'A duplicate payment reference or review already exists. Refresh and retry.' });
    if (error?.code === 'P2034') return res.status(409).json({ error: 'Payment state changed concurrently. Refresh and retry.' });
    if (/Accounting period/.test(error?.message || '')) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: 'Could not update payment controls.' });
  }
}
