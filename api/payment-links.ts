import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireFeatureWrite, cors } from '../lib/auth';
import { assertPeriodOpen } from '../lib/accountingPeriod';
import { log } from '../lib/serverLogger.js';
import { getClientIp } from '../lib/clientIp.js';

const linkSchema = z.object({
  receiptId: z.string().min(1, 'receiptId is required'),
  invoiceId: z.string().min(1, 'invoiceId is required'),
});

const BANK_METHOD_RE = /bank|transfer|rtgs|swift|wire/i;

function auditContext(req: any) {
  return {
    requestId: String(req.headers['x-request-id'] || randomUUID()),
    ipAddress: getClientIp(req) || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
  };
}

/** Empty strings are treated as missing (legacy batch stored '' in evidence fields). */
function cleanOrNull(v: string | null | undefined): string | null {
  return v == null || String(v).trim() === '' ? null : String(v).trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * POST /api/payment-links  { receiptId, invoiceId }
 * Links an unlinked receipt (payment) to an invoice: backfills the receipt's
 * evidence fields the way the record-payment flow does, sets linkedInvoiceId,
 * records a payment_allocations row, and writes an audit entry. Bank-transfer
 * receipts without an uploaded proof are rejected (the DB CHECK requires it).
 */
export default async function handler(req: any, res: any) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireFeatureWrite(req, res, 'invoices');
  if (!payload) return;

  const parsed = linkSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(i => i.message) });
  }
  const { receiptId, invoiceId } = parsed.data;

  try {
    const [receipt, invoice] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: receiptId } }),
      prisma.invoice.findUnique({ where: { id: invoiceId } }),
    ]);

    if (!receipt || receipt.type !== 'Receipt') {
      return res.status(404).json({ error: 'Payment receipt not found.' });
    }
    if ((receipt as any).isVoided) {
      return res.status(409).json({ error: 'This payment is voided and cannot be linked.' });
    }
    if (receipt.linkedInvoiceId) {
      return res.status(409).json({ error: 'This payment is already linked to an invoice.' });
    }
    // A receipt settles an issued invoice.  Proformas are not receivables and
    // linking one would make a non-posted document look paid.
    if (!invoice || invoice.type !== 'Invoice') {
      return res.status(404).json({ error: 'Target invoice not found.' });
    }
    if ((invoice as any).isVoided) {
      return res.status(409).json({ error: 'The target invoice is voided.' });
    }
    if (receipt.clientId && invoice.clientId && receipt.clientId !== invoice.clientId) {
      return res.status(409).json({ error: 'The payment and invoice belong to different clients.' });
    }
    if (Number(receipt.total) <= 0) {
      return res.status(400).json({ error: 'Zero-value payments cannot be linked.' });
    }

    // Bank transfers must carry proof + receiving account — the DB CHECK
    // enforces all of it, so reject early with a clear message.
    const method = String(receipt.paymentMethod || '');
    if (BANK_METHOD_RE.test(method) && (!(receipt as any).proofPaymentUrl || !(receipt as any).receivingAccount)) {
      return res.status(409).json({
        error: 'Bank transfer payments need an uploaded proof and a receiving account before they can be linked. Upload the proof or reverse the payment instead.',
      });
    }

    await assertPeriodOpen(String(receipt.date || ''), payload.email);
    const audit = auditContext(req);
    const amount = round2(Number(receipt.total));

    const before = {
      linkedInvoiceId: receipt.linkedInvoiceId,
      paymentReference: receipt.paymentReference,
      receivedBy: (receipt as any).receivedBy,
      receivedByUserId: (receipt as any).receivedByUserId,
      recordedAt: (receipt as any).recordedAt,
      postedAt: (receipt as any).postedAt,
    };

    const updated = await prisma.$transaction(async tx => {
      await assertPeriodOpen(String(receipt.date || ''), payload.email, tx as any);

      // Never over-allocate — checked BEFORE any write. Paid = max(linked
      // receipts, allocations) so both representations (app links vs ledger
      // allocations) are respected without double-counting.
      const [linkedSum, allocSum] = await Promise.all([
        tx.invoice.aggregate({
          where: { type: 'Receipt', isVoided: false, linkedInvoiceId: invoiceId },
          _sum: { total: true },
        }),
        tx.paymentAllocation.aggregate({
          where: { invoiceId, isReversed: false },
          _sum: { amount: true },
        }),
      ]);
      const paid = Math.max(Number(linkedSum._sum.total ?? 0), Number(allocSum._sum.amount ?? 0));
      if (paid + amount > Number(invoice.total) + 0.01) {
        throw new Error('This payment would over-allocate the invoice (already fully paid).');
      }

      // Guard the same-receipt race: only link if still unlinked.
      const res = await (tx.invoice as any).updateMany({
        where: { id: receiptId, linkedInvoiceId: null },
        data: {
          linkedInvoiceId: invoiceId,
          // Adopt the invoice's client if the legacy receipt never had one.
          ...(receipt.clientId ? {} : { clientId: invoice.clientId }),
          paymentReference: cleanOrNull((receipt as any).paymentReference) ?? receiptId,
          receivedBy: cleanOrNull((receipt as any).receivedBy) ?? 'System cleanup (legacy RCT batch)',
          receivedByUserId: cleanOrNull((receipt as any).receivedByUserId) ?? payload.userId,
          recordedAt: (receipt as any).recordedAt ?? receipt.createdAt,
          postedAt: (receipt as any).postedAt ?? receipt.createdAt,
        },
      });
      if (res.count !== 1) {
        throw new Error('This payment was already linked. Refresh and retry.');
      }
      const row = await tx.invoice.findUnique({ where: { id: receiptId } });

      await tx.paymentAllocation.create({
        data: { receiptId, invoiceId, amount, allocatedBy: payload.userId, allocatedAt: new Date() },
      });

      // Keep the invoice status honest — mirror recalculateInvoiceStatus.
      if (invoice.type === 'Invoice' && !(invoice as any).isVoided) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: Number(invoice.total) - (paid + amount) <= 0.01 ? 'Paid' : 'Pending' },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'Finance: Payment Linked',
          details: `Linked receipt ${receiptId} ($${receipt.total}) to invoice ${invoiceId} (${invoice.status})`,
          userId: payload.userId,
          userEmail: payload.email,
          tableName: 'invoices',
          recordId: receiptId,
          beforeData: before as any,
          afterData: row as any,
          source: 'SERVER',
          ...audit,
        },
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    log.info(`Payment linked  receipt=${receiptId}  ->  invoice=${invoiceId}  by=${payload.email}`);
    return res.status(200).json({ success: true, receipt: updated });
  } catch (e: any) {
    if (e?.code === 'P2002' || e?.code === 'P2034') {
      return res.status(409).json({ error: 'Payment record changed concurrently. Refresh and retry.' });
    }
    if (/Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
    if (/already linked|over-allocate/.test(e?.message || '')) {
      return res.status(409).json({ error: e.message });
    }
    if (/check constraint|violates check/.test(e?.message || '')) {
      return res.status(409).json({ error: 'The receipt is missing required payment evidence. Upload proof or reverse the payment instead.' });
    }
    log.error('[payment-links]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
