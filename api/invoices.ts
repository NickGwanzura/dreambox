import type { HttpRequest, HttpResponse } from '../lib/http';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, requireFeatureRead, requireFeatureWrite, requireQuotationApprovePermission, requireQuotationWritePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickInvoiceData } from '../lib/whitelist';
import { assertPeriodOpen, assertPeriodsOpen } from '../lib/accountingPeriod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const calendarDate = z.string().regex(DATE_RE, 'Date must use YYYY-MM-DD').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Date must be a valid calendar date');
const DEFAULT_VAT_RATE = 0.155;
const money = z.number().finite().nonnegative().max(1_000_000_000);
const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: money.optional(),
  unitPrice: money.optional(),
  amount: money,
  billboardId: z.string().max(200).optional(),
  contractId: z.string().max(200).optional(),
  contractLineId: z.string().max(200).optional(),
  side: z.enum(['A', 'B']).optional(),
  slots: z.number().int().nonnegative().optional(),
}).superRefine((item, ctx) => {
  if (item.quantity != null && item.unitPrice != null && Math.abs(item.amount - item.quantity * item.unitPrice) > 0.01) {
    ctx.addIssue({ code: 'custom', message: 'Line-item amount must equal quantity × unit price' });
  }
});

const invoiceSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  contractId: z.string().max(200).optional().nullable(),
  date: calendarDate,
  dueDate: z.union([
    calendarDate,
    z.literal(''),
  ]).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1).max(100),
  subtotal: money,
  discountAmount: money.optional().nullable(),
  discountDescription: z.string().trim().max(500).optional().nullable(),
  vatAmount: money.optional(),
  total: money,
  status: z.enum(['Paid', 'Pending', 'Overdue']).optional(),
  type: z.enum(['Invoice', 'Quotation', 'Proforma', 'Receipt']).default('Invoice'),
  paymentMethod: z.string().max(100).optional().nullable(),
  paymentReference: z.string().max(200).optional().nullable(),
  receivedBy: z.string().trim().max(200).optional().nullable(),
  receivingAccount: z.string().trim().max(200).optional().nullable(),
  proofPaymentUrl: z.string().url().max(2000).optional().nullable(),
  proofOriginalName: z.string().trim().max(255).optional().nullable(),
  proofMimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']).optional().nullable(),
  proofUploadedAt: z.union([z.string(), z.date()]).optional().nullable(),
  linkedInvoiceId: z.string().max(200).optional().nullable(),
  quoteNumber: z.string().max(100).optional().nullable(),
  expiryDate: calendarDate.optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  quoteStatus: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted']).optional().nullable(),
  convertedToInvoiceId: z.string().max(200).optional().nullable(),
  convertedToContractId: z.string().max(200).optional().nullable(),
  convertedAt: z.union([z.string(), z.date()]).optional().nullable(),
  sentAt: z.union([z.string(), z.date()]).optional().nullable(),
  sentTo: z.string().max(320).optional().nullable(),
  createdBy: z.string().max(320).optional().nullable(),
  assignedTo: z.string().max(320).optional().nullable(),
  hasVat: z.boolean().optional(),
});

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const EFFECTIVE_RECEIPT_APPROVALS = ['Approved', 'NotRequired'];

class PaymentIntegrityError extends Error {
  constructor(message: string, readonly status = 409, readonly existingId?: string) {
    super(message);
    this.name = 'PaymentIntegrityError';
  }
}

function withoutProofUrl<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const { proofPaymentUrl: _proofPaymentUrl, ...safe } = value as Record<string, unknown>;
  return { ...safe, hasPaymentProof: Boolean(_proofPaymentUrl) } as T;
}

async function lockInvoice(tx: any, invoiceId: string): Promise<void> {
  if (typeof tx.$queryRaw !== 'function') return;
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`);
}

async function lockPaymentReference(tx: any, paymentMethod: unknown, paymentReference: unknown): Promise<void> {
  if (typeof tx.$queryRaw !== 'function') return;
  const key = `${String(paymentMethod || '').trim().toLocaleLowerCase()}\u0000${String(paymentReference || '').trim().toLocaleLowerCase()}`;
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

async function duplicatePaymentReference(tx: any, paymentMethod: string, paymentReference: string, excludeId?: string): Promise<{ id: string } | null> {
  return tx.invoice.findFirst({
    where: {
      type: 'Receipt',
      isVoided: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      paymentMethod: { equals: paymentMethod, mode: 'insensitive' },
      paymentReference: { equals: paymentReference, mode: 'insensitive' },
    },
    select: { id: true },
  });
}

async function activeAllocationsForRecord(tx: any, recordId: string): Promise<Array<{ invoiceId: string }>> {
  return (await tx.paymentAllocation.findMany({
    where: { OR: [{ receiptId: recordId }, { invoiceId: recordId }], isReversed: false },
    select: { invoiceId: true },
  })) || [];
}

async function effectiveAllocatedTotal(tx: any, invoiceId: string): Promise<number> {
  const allocations = await tx.paymentAllocation.findMany({
    where: {
      invoiceId,
      isReversed: false,
      receipt: { is: { type: 'Receipt', isVoided: false, approvalStatus: { in: EFFECTIVE_RECEIPT_APPROVALS } } },
    },
    select: { amount: true },
  });
  return roundMoney((allocations || []).reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
}

async function recalculateInvoiceStatus(tx: any, invoiceId: string): Promise<void> {
  await lockInvoice(tx, invoiceId);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.type !== 'Invoice' || invoice.isVoided) return;
  const paid = await effectiveAllocatedTotal(tx, invoiceId);
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: Number(invoice.total) - paid <= 0.01 ? 'Paid' : 'Pending' } });
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function canonicalInvoiceData(body: any, vatRate: number) {
  const data: any = pickInvoiceData(body);
  const items = body.items.map((item: any) => ({ ...item, amount: roundMoney(item.amount) }));
  const gross = roundMoney(items.reduce((sum: number, item: any) => sum + item.amount, 0));
  const discount = roundMoney(body.discountAmount ?? 0);
  if (discount > gross) throw new Error('Discount cannot exceed the line-item total');
  const total = roundMoney(gross - discount);
  const hasVat = body.type !== 'Receipt' && (body.hasVat === true || Number(body.vatAmount) > 0);
  const subtotal = hasVat ? roundMoney(total / (1 + vatRate)) : total;
  const vatAmount = hasVat ? roundMoney(total - subtotal) : 0;

  data.items = items;
  data.discountAmount = discount || null;
  data.discountDescription = discount ? (body.discountDescription?.trim() || null) : null;
  data.subtotal = subtotal;
  data.vatAmount = vatAmount;
  data.total = total;
  const hasExplicitDueDate =
    Object.prototype.hasOwnProperty.call(body, 'dueDate') &&
    body.dueDate !== undefined;
  data.dueDate = body.type === 'Invoice'
    ? hasExplicitDueDate
      ? body.dueDate || null
      : addDays(body.date, 30)
    : null;
  data.status = body.type === 'Receipt' ? 'Paid' : (body.status === 'Overdue' ? 'Overdue' : 'Pending');
  return data;
}

function isBankPayment(method: unknown): boolean {
  return /bank|transfer|rtgs|swift|wire/i.test(String(method || ''));
}

function validatePaymentAudit(data: any): string | null {
  if (data.type !== 'Receipt') return null;
  if (!String(data.receivedBy || '').trim()) return 'Who received the payment is required.';
  if (!String(data.paymentMethod || '').trim()) return 'Payment method is required.';
  if (!String(data.paymentReference || '').trim()) return 'Payment reference is required.';
  if (isBankPayment(data.paymentMethod)) {
    if (!String(data.receivingAccount || '').trim()) return 'Receiving bank account is required for bank payments.';
    if (!data.proofPaymentUrl || !data.proofOriginalName || !data.proofMimeType || !data.proofUploadedAt) {
      return 'Proof of payment is required for bank payments.';
    }
  }
  return null;
}

function auditContext(req: HttpRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  return {
    requestId: String(req.headers['x-request-id'] || randomUUID()),
    ipAddress: String(Array.isArray(forwarded) ? forwarded[0] : forwarded || (req as any).socket?.remoteAddress || '').split(',')[0].trim() || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
  };
}

async function getVatRate(): Promise<number> {
  const profile = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' }, select: { vatRate: true } });
  return typeof profile?.vatRate === 'number' && profile.vatRate >= 0 ? profile.vatRate : DEFAULT_VAT_RATE;
}

const QUOTATION_SERVER_FIELDS = new Set([
  'type', 'status', 'createdBy', 'convertedToInvoiceId', 'convertedToContractId', 'convertedAt',
]);

function isQuotationOwner(quote: any, payload: any): boolean {
  return quote.createdBy === payload.email || quote.createdBy === payload.userId;
}

/** Convert only here: one transaction locks the source row, creates the
 * invoice, links the source and writes the timeline/audit trail. */
async function convertQuotationToInvoice(quotationId: string, payload: any, req: HttpRequest) {
  const audit = auditContext(req);
  return prisma.$transaction(async tx => {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`dreambox-quotation:${quotationId}`}))`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${quotationId} FOR UPDATE`);
    }
    const quote = await tx.invoice.findUnique({ where: { id: quotationId } });
    if (!quote || quote.type !== 'Quotation' || quote.isVoided) {
      throw new PaymentIntegrityError('Source quotation not found', 404);
    }
    if (quote.quoteStatus === 'Converted' || quote.convertedToInvoiceId || quote.convertedToContractId) {
      throw new PaymentIntegrityError('This quotation has already been converted', 409, quote.convertedToInvoiceId || quote.convertedToContractId || undefined);
    }
    if (quote.quoteStatus !== 'Accepted') {
      throw new PaymentIntegrityError('Only accepted quotations can be converted', 409);
    }
    const issueDate = new Date().toISOString().slice(0, 10);
    const invoice = await tx.invoice.create({
      data: {
        clientId: quote.clientId,
        contractId: quote.contractId,
        date: issueDate,
        dueDate: addDays(issueDate, 30),
        items: quote.items as any,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        discountDescription: quote.discountDescription,
        vatAmount: quote.vatAmount,
        total: quote.total,
        status: 'Pending',
        type: 'Invoice',
        notes: quote.notes,
        createdBy: payload.email,
      },
    });
    const converted = await tx.invoice.update({
      where: { id: quote.id },
      data: { quoteStatus: 'Converted', convertedToInvoiceId: invoice.id, convertedAt: new Date() },
    });
    await tx.quotationEvent.create({ data: { invoiceId: quote.id, type: 'converted', actorId: payload.userId, actorEmail: payload.email, details: `Converted to Invoice ${invoice.id}` } });
    await tx.auditLog.create({ data: { action: 'Quotation Converted to Invoice', details: `Quotation ${quote.quoteNumber || quote.id} converted to invoice ${invoice.id}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: quote.id, beforeData: quote as any, afterData: converted as any, ...audit } });
    return invoice;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function handlePrismaError(e: any, res: HttpResponse, context: string): void {
  const code = e?.code ?? 'UNKNOWN';
  const message = e?.message ?? String(e);
  log.error(`[invoices] ${context} prisma_code=${code} ${message.slice(0, 300)}`);
  if (code === 'P2002') { res.status(409).json({ error: 'A record with that unique value already exists.', code }); return; }
  if (code === 'P2025') { res.status(404).json({ error: 'Record not found.', code }); return; }
  if (code?.startsWith('P1') || /ECONNREFUSED|timeout|database/i.test(message)) {
    res.status(503).json({ error: 'Database is temporarily unavailable. Please retry in a moment.', code }); return;
  }
  res.status(500).json({ error: 'Internal server error', code });
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const payload = await requireFeatureRead(req, res, 'invoices');
    if (!payload) return;
    try {
      const { id } = req.query;
      if (id) {
        const row = await prisma.invoice.findUnique({ where: { id: id as string } });
        return row ? res.status(200).json(withoutProofUrl(row)) : res.status(404).json({ error: 'Not found' });
      }
      // Review queue: invoices with no payment logged at all (non-voided,
      // Pending/Overdue). A payment counts as logged when a non-voided receipt
      // is linked to the invoice or an active allocation references it.
      if (String(req.query.reviewQueue || '').toLowerCase() === 'true') {
        // Pending/Overdue invoices with no payment, plus Paid invoices with no
        // payment evidence at all — both are anomalies worth reviewing.
        const unpaidRows = await prisma.invoice.findMany({
          where: { type: 'Invoice', isVoided: false, status: { in: ['Pending', 'Overdue', 'Paid'] } },
          select: { id: true },
        });
        const invoiceIds = unpaidRows.map(row => row.id);
        if (invoiceIds.length === 0) return res.status(200).json([]);
        const [linkedReceipts, allocations] = await Promise.all([
          prisma.invoice.findMany({
            where: { type: 'Receipt', isVoided: false, linkedInvoiceId: { in: invoiceIds } },
            select: { id: true, linkedInvoiceId: true, total: true },
          }),
          prisma.paymentAllocation.findMany({
            where: { invoiceId: { in: invoiceIds }, isReversed: false },
            select: { invoiceId: true, amount: true },
          }),
        ]);
        const paidByInvoice = new Map<string, number>();
        for (const receipt of linkedReceipts) {
          if (!receipt.linkedInvoiceId) continue;
          paidByInvoice.set(receipt.linkedInvoiceId, roundMoney((paidByInvoice.get(receipt.linkedInvoiceId) || 0) + Number(receipt.total || 0)));
        }
        for (const allocation of allocations) {
          paidByInvoice.set(allocation.invoiceId, roundMoney((paidByInvoice.get(allocation.invoiceId) || 0) + Number(allocation.amount || 0)));
        }
        const flaggedIds = invoiceIds.filter(invoiceId => (paidByInvoice.get(invoiceId) || 0) <= 0.01);
        if (flaggedIds.length === 0) return res.status(200).json([]);
        const flagged = await prisma.invoice.findMany({ where: { id: { in: flaggedIds } }, orderBy: { date: 'asc' } });
        return res.status(200).json(flagged.map(row => withoutProofUrl({
          ...row,
          hasPaymentLogged: false,
          outstanding: Number(row.total || 0),
          flaggedForReview: true,
        })));
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const includeVoided = String(req.query.includeVoided || '').toLowerCase() === 'true' && ['Admin', 'Manager'].includes(payload.role);
      // Use a unique secondary key so cursor-like skip/take pages cannot
      // reshuffle records that share the same createdAt timestamp.
      const rows = await prisma.invoice.findMany({
        where: includeVoided ? undefined : { isVoided: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      });
      return res.status(200).json(rows.map(withoutProofUrl));
    } catch (e: any) { handlePrismaError(e, res, 'GET'); return; }
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};
    if (req.query.action === 'convertQuotation') {
      const payload = await requireQuotationApprovePermission(req, res);
      if (!payload) return;
      const quotationId = String(body.quotationId || '').trim();
      if (!quotationId) return res.status(400).json({ error: 'quotationId is required' });
      try {
        const invoice = await convertQuotationToInvoice(quotationId, payload, req);
        return res.status(201).json(withoutProofUrl(invoice));
      } catch (e: any) {
        if (e instanceof PaymentIntegrityError) return res.status(e.status).json({ error: e.message, ...(e.existingId ? { existingId: e.existingId } : {}) });
        if (e?.code === 'P2034') return res.status(409).json({ error: 'Quotation changed concurrently. Refresh and retry.' });
        handlePrismaError(e, res, 'convertQuotation'); return;
      }
    }
    const payload = String(body.type).toLowerCase() === 'quotation'
      ? await requireQuotationWritePermission(req, res)
      : await requireFeatureWrite(req, res, 'invoices');
    if (!payload) return;
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });

    try {
      const vatRate = await getVatRate();
      const data: any = canonicalInvoiceData(parsed.data, vatRate);
      if (data.type === 'Quotation') {
        // Lifecycle and authorship are facts established by the server, never
        // values a synced/browser payload may choose for itself.
        data.status = 'Pending';
        data.quoteStatus = 'Draft';
        data.createdBy = payload.email;
        data.convertedToInvoiceId = null;
        data.convertedToContractId = null;
        data.convertedAt = null;
      }
      const paymentAuditError = validatePaymentAudit(data);
      if (paymentAuditError) return res.status(400).json({ error: paymentAuditError });
      await assertPeriodOpen(data.date, payload.email);
      const audit = auditContext(req);

      if (data.type === 'Receipt') {
        data.receivedBy = data.receivedBy.trim();
        data.paymentMethod = data.paymentMethod.trim();
        data.paymentReference = data.paymentReference.trim();
        data.receivingAccount = data.receivingAccount?.trim() || null;
        data.receivedByUserId = payload.userId;
        data.createdBy = payload.email;
        data.recordedAt = new Date();
        data.postedAt = new Date();
        data.isVoided = false;
        data.approvalStatus = 'Pending';
        // Receipt status follows approval, not merely data entry.  Its financial
        // effect is represented by a PaymentAllocation only after approval.
        data.status = 'Pending';
        if (!data.linkedInvoiceId) return res.status(400).json({ error: 'A receipt must be linked to an invoice before it can be recorded.' });
      }

      if (data.type === 'Quotation' && !data.quoteNumber) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.invoice.count({ where: { quoteNumber: { startsWith: `QT-${today}` } } });
        data.quoteNumber = `QT-${today}-${String(count + 1).padStart(3, '0')}`;
      }

      if (data.type === 'Invoice' && data.contractId && String(data.items?.[0]?.description || '').startsWith('Monthly Rental')) {
        const monthPrefix = String(data.date).slice(0, 7);
        const sameMonth = await prisma.invoice.findMany({ where: { contractId: data.contractId, type: 'Invoice', date: { startsWith: monthPrefix } }, select: { id: true, items: true } });
        const duplicate = sameMonth.find(inv => Array.isArray(inv.items) && String((inv.items as any[])[0]?.description || '').startsWith('Monthly Rental'));
        if (duplicate) return res.status(409).json({ error: 'Monthly invoice already exists for this contract and month', existingId: duplicate.id });
      }

      if (data.type === 'Receipt') {
        const result = await prisma.$transaction(async tx => {
          await assertPeriodOpen(data.date, payload.email, tx);
          await lockPaymentReference(tx, data.paymentMethod, data.paymentReference);
          const duplicateReference = await duplicatePaymentReference(tx, data.paymentMethod, data.paymentReference);
          if (duplicateReference) throw new PaymentIntegrityError(`Payment reference already exists on receipt ${duplicateReference.id}.`, 409, duplicateReference.id);
          const invoice = await tx.invoice.findUnique({ where: { id: data.linkedInvoiceId } });
          if (!invoice || invoice.type !== 'Invoice' || invoice.isVoided) throw new PaymentIntegrityError('Linked invoice not found');
          if (invoice.clientId !== data.clientId) throw new PaymentIntegrityError('Receipt client must match the linked invoice');
          data.contractId = invoice.contractId;
          const receipt = await tx.invoice.create({ data });
          await tx.auditLog.create({ data: { action: 'Finance: Payment Recorded Pending Approval', details: `Receipt ${receipt.id} for $${data.total.toFixed(2)} linked to invoice ${invoice.id}; received by ${data.receivedBy}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: receipt.id, beforeData: undefined, afterData: receipt as any, ...audit } });
          return receipt;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return res.status(201).json(withoutProofUrl(result));
      }

      const row = await prisma.$transaction(async tx => {
        await assertPeriodOpen(data.date, payload.email, tx);
        const created = await tx.invoice.create({ data });
        await tx.auditLog.create({ data: { action: `Finance: ${created.type} Created`, details: `${created.type} ${created.id} ($${created.total})`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: created.id, afterData: created as any, ...audit } });
        return created;
      });
      return res.status(201).json(withoutProofUrl(row));
    } catch (e: any) {
      if (e instanceof PaymentIntegrityError) return res.status(e.status).json({ error: e.message, ...(e.existingId ? { existingId: e.existingId } : {}) });
      if (/Discount cannot|Linked invoice|Receipt client|Receipt exceeds|Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
      if (e?.code === 'P2002' || e?.code === 'P2034') return res.status(409).json({ error: 'Payment record changed concurrently. Refresh and retry.' });
      handlePrismaError(e, res, 'POST'); return;
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const authenticated = await requireAuth(req, res);
    if (!authenticated) return;
    try {
      const existing = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!existing) return res.status(404).json({ error: 'Invoice not found' });
      const payload = existing.type === 'Quotation'
        ? await requireQuotationWritePermission(req, res)
        : await requireFeatureWrite(req, res, 'invoices');
      if (!payload) return;

      const body = req.body ?? {};
      if (existing.type === 'Quotation') {
        if (payload.role === 'SalesAgent' && !isQuotationOwner(existing, payload)) {
          return res.status(403).json({ error: 'Sales Agents may edit only quotations they created.' });
        }
        const attemptedServerField = [...QUOTATION_SERVER_FIELDS].find(field => Object.prototype.hasOwnProperty.call(body, field) && body[field] !== (existing as any)[field]);
        if (attemptedServerField) {
          return res.status(403).json({ error: `${attemptedServerField} is controlled by the server.` });
        }
        if (body.quoteStatus === 'Converted') return res.status(403).json({ error: 'Use the quotation conversion action.' });
        if (body.quoteStatus === 'Accepted') {
          const approver = await requireQuotationApprovePermission(req, res);
          if (!approver) return;
        }
      }
      if (body.type && body.type !== existing.type && !(['Quotation', 'Proforma'].includes(existing.type) && body.type === 'Invoice')) {
        return res.status(400).json({ error: 'Document type cannot be changed this way' });
      }
      if (existing.type === 'Receipt') {
        for (const field of ['clientId', 'linkedInvoiceId', 'items', 'subtotal', 'vatAmount', 'total', 'discountAmount', 'type', 'date', 'paymentMethod', 'paymentReference', 'receivedBy', 'receivingAccount', 'proofPaymentUrl', 'proofOriginalName', 'proofMimeType', 'proofUploadedAt']) {
          if (body[field] != null && JSON.stringify(body[field]) !== JSON.stringify((existing as any)[field])) {
            return res.status(409).json({ error: 'Posted receipt financial fields are immutable. Delete and recreate the receipt.' });
          }
        }
      }
      if (existing.type === 'Invoice' && body.status === 'Paid' && existing.status !== 'Paid') {
        return res.status(409).json({ error: 'Record a linked receipt to mark an invoice paid.' });
      }

      const merged = { ...existing, ...body, type: body.type || existing.type };
      const parsed = invoiceSchema.safeParse(merged);
      if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      const financialChange = ['items', 'discountAmount', 'vatAmount', 'subtotal', 'total', 'clientId'].some(field => body[field] != null && JSON.stringify(body[field]) !== JSON.stringify((existing as any)[field]));
      if (financialChange && existing.type === 'Invoice') {
        const receiptCount = await prisma.invoice.count({ where: { type: 'Receipt', linkedInvoiceId: existing.id } });
        if (receiptCount > 0) return res.status(409).json({ error: 'An invoice with allocated payments cannot be financially edited.' });
      }

      const data = canonicalInvoiceData(parsed.data, await getVatRate());
      if (existing.type === 'Quotation') {
        // Preserve every server-owned lifecycle field even if a legacy client
        // sends it back as part of a full-record update.
        for (const field of QUOTATION_SERVER_FIELDS) data[field] = (existing as any)[field];
        data.quoteStatus = body.quoteStatus ?? existing.quoteStatus;
      }
      // A date move affects both the original and destination period.  The
      // transaction repeats this check so the write and lock check share a DB
      // boundary; a database trigger protects direct/competing writes too.
      await assertPeriodsOpen([existing.date, data.date], authenticated.email);
      const audit = auditContext(req);
      const row = await prisma.$transaction(async tx => {
        await assertPeriodsOpen([existing.date, data.date], payload.email, tx);
        const updated = await tx.invoice.update({ where: { id: id as string }, data });
        await tx.auditLog.create({ data: { action: `Finance: ${updated.type} Updated`, details: `${updated.type} ${updated.id} updated`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: updated.id, beforeData: existing as any, afterData: updated as any, ...audit } });
        return updated;
      });
      return res.status(200).json(withoutProofUrl(row));
    } catch (e: any) {
      if (/Discount cannot/.test(e?.message || '')) return res.status(400).json({ error: e.message });
      if (/Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
      handlePrismaError(e, res, 'PUT'); return;
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const payload = await requireDeletePermission(req, res);
    if (!payload) return;
    try {
      const target = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!target) return res.status(404).json({ error: 'Invoice not found' });
      await assertPeriodOpen(target.date, payload.email);
      if ((target as any).isVoided) return res.status(409).json({ error: 'This financial record is already voided.' });
      const reason = String((req.body as any)?.reason || req.query.reason || '').trim();
      if (reason.length < 10) return res.status(400).json({ error: 'A void reason of at least 10 characters is required.' });
      const audit = auditContext(req);
      await prisma.$transaction(async tx => {
        await lockInvoice(tx, target.id);
        const current = await tx.invoice.findUnique({ where: { id: target.id } });
        if (!current) throw new PaymentIntegrityError('Invoice not found', 404);
        if (current.isVoided) throw new PaymentIntegrityError('This financial record is already voided.');
        await assertPeriodOpen(current.date, payload.email, tx);

        // Reverse before voiding.  The database trigger rejects an isVoided
        // transition with any active allocation, so a successful transaction
        // cannot persist a voided document with live payment allocations.
        const activeAllocations = await activeAllocationsForRecord(tx, current.id);
        const affectedInvoiceIds = [...new Set(activeAllocations.map(allocation => allocation.invoiceId).filter(invoiceId => invoiceId !== current.id))].sort();
        for (const invoiceId of affectedInvoiceIds) await lockInvoice(tx, invoiceId);
        if (activeAllocations.length > 0) {
          await tx.paymentAllocation.updateMany({
            where: { OR: [{ receiptId: current.id }, { invoiceId: current.id }], isReversed: false },
            data: { isReversed: true, reversedAt: new Date(), reversedBy: payload.userId, reason: `Voided: ${reason}` },
          });
        }
        const voided = await tx.invoice.update({ where: { id: current.id }, data: { isVoided: true, voidReason: reason, voidedAt: new Date(), voidedBy: payload.userId } });
        for (const invoiceId of affectedInvoiceIds) await recalculateInvoiceStatus(tx, invoiceId);
        await tx.auditLog.create({ data: { action: `Finance: ${current.type} Voided`, details: `${current.type} ${current.id} ($${current.total}); ${activeAllocations.length} allocation(s) reversed; reason: ${reason}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: current.id, beforeData: current as any, afterData: voided as any, ...audit } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return res.status(200).json({ success: true, voided: true });
    } catch (e: any) {
      if (e instanceof PaymentIntegrityError) return res.status(e.status).json({ error: e.message });
      if (/Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
      if (e?.code === 'P2034') return res.status(409).json({ error: 'Payment state changed concurrently. Refresh and retry.' });
      handlePrismaError(e, res, 'DELETE'); return;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
