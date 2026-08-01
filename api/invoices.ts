import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, requireFeatureRead, requireFeatureWrite, requireQuotationWritePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickInvoiceData } from '../lib/whitelist';
import { assertPeriodOpen } from '../lib/accountingPeriod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  date: z.string().regex(DATE_RE, 'Date must use YYYY-MM-DD'),
  dueDate: z.string().regex(DATE_RE, 'Due date must use YYYY-MM-DD').optional().nullable(),
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
  expiryDate: z.string().regex(DATE_RE).optional().nullable(),
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
  data.dueDate = body.type === 'Invoice' ? (body.dueDate || addDays(body.date, 30)) : null;
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
        return row ? res.status(200).json(row) : res.status(404).json({ error: 'Not found' });
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const includeVoided = String(req.query.includeVoided || '').toLowerCase() === 'true' && ['Admin', 'Manager'].includes(payload.role);
      return res.status(200).json(await prisma.invoice.findMany({ where: includeVoided ? undefined : { isVoided: false }, orderBy: { createdAt: 'asc' }, take: limit, skip }));
    } catch (e: any) { handlePrismaError(e, res, 'GET'); return; }
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};
    const payload = String(body.type).toLowerCase() === 'quotation'
      ? await requireQuotationWritePermission(req, res)
      : await requireFeatureWrite(req, res, 'invoices');
    if (!payload) return;
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });

    try {
      const vatRate = await getVatRate();
      const data: any = canonicalInvoiceData(parsed.data, vatRate);
      const paymentAuditError = validatePaymentAudit(data);
      if (paymentAuditError) return res.status(400).json({ error: paymentAuditError });
      await assertPeriodOpen(data.date, payload.email);
      const audit = auditContext(req);

      if (data.type === 'Receipt') {
        data.receivedBy = data.receivedBy.trim();
        data.paymentReference = data.paymentReference.trim();
        data.receivingAccount = data.receivingAccount?.trim() || null;
        data.receivedByUserId = payload.userId;
        data.createdBy = payload.email;
        data.recordedAt = new Date();
        data.postedAt = new Date();
        data.isVoided = false;
        data.approvalStatus = 'Pending';
        const duplicateReference = await prisma.invoice.findFirst({
          where: { type: 'Receipt', isVoided: false, paymentMethod: data.paymentMethod, paymentReference: { equals: data.paymentReference, mode: 'insensitive' } },
          select: { id: true },
        });
        if (duplicateReference) return res.status(409).json({ error: `Payment reference already exists on receipt ${duplicateReference.id}.`, existingId: duplicateReference.id });
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

      if (data.type === 'Receipt' && data.linkedInvoiceId) {
        const result = await prisma.$transaction(async tx => {
          const invoice = await tx.invoice.findUnique({ where: { id: data.linkedInvoiceId } });
          if (!invoice || invoice.type !== 'Invoice') throw new Error('Linked invoice not found');
          if (invoice.clientId !== data.clientId) throw new Error('Receipt client must match the linked invoice');
          const prior = await tx.invoice.findMany({ where: { type: 'Receipt', linkedInvoiceId: invoice.id, isVoided: false }, select: { total: true } });
          const paid = roundMoney(prior.reduce((sum, receipt) => sum + Number(receipt.total), 0));
          const remaining = roundMoney(Number(invoice.total) - paid);
          if (data.total <= 0 || data.total - remaining > 0.01) throw new Error(`Receipt exceeds the outstanding balance of $${remaining.toFixed(2)}`);
          data.contractId = invoice.contractId;
          const receipt = await tx.invoice.create({ data });
          await tx.paymentAllocation.create({ data: { receiptId: receipt.id, invoiceId: invoice.id, amount: data.total, allocatedBy: payload.userId } });
          const newRemaining = roundMoney(remaining - data.total);
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: newRemaining <= 0.01 ? 'Paid' : 'Pending' } });
          await tx.auditLog.create({ data: { action: 'Finance: Payment Posted', details: `Receipt ${receipt.id} allocated $${data.total.toFixed(2)} to invoice ${invoice.id}; received by ${data.receivedBy}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: receipt.id, beforeData: undefined, afterData: receipt as any, ...audit } });
          return receipt;
        });
        return res.status(201).json(result);
      }

      const row = await prisma.$transaction(async tx => {
        const created = await tx.invoice.create({ data });
        await tx.auditLog.create({ data: { action: `Finance: ${created.type} Created`, details: `${created.type} ${created.id} ($${created.total})`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: created.id, afterData: created as any, ...audit } });
        return created;
      });
      return res.status(201).json(row);
    } catch (e: any) {
      if (/Discount cannot|Linked invoice|Receipt client|Receipt exceeds|Accounting period/.test(e?.message || '')) return res.status(409).json({ error: e.message });
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
      await assertPeriodOpen(existing.date, authenticated.email);
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
      const audit = auditContext(req);
      const row = await prisma.$transaction(async tx => {
        const updated = await tx.invoice.update({ where: { id: id as string }, data });
        await tx.auditLog.create({ data: { action: `Finance: ${updated.type} Updated`, details: `${updated.type} ${updated.id} updated`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: updated.id, beforeData: existing as any, afterData: updated as any, ...audit } });
        return updated;
      });
      return res.status(200).json(row);
    } catch (e: any) {
      if (/Discount cannot/.test(e?.message || '')) return res.status(400).json({ error: e.message });
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
        const voided = await tx.invoice.update({ where: { id: target.id }, data: { isVoided: true, voidReason: reason, voidedAt: new Date(), voidedBy: payload.userId } });
        if (target.type === 'Receipt' && target.linkedInvoiceId) {
          await tx.paymentAllocation.updateMany({ where: { receiptId: target.id, isReversed: false }, data: { isReversed: true, reversedAt: new Date(), reversedBy: payload.userId, reason } });
          const linked = await tx.invoice.findUnique({ where: { id: target.linkedInvoiceId } });
          if (linked) {
            const remainingReceipts = await tx.invoice.findMany({ where: { type: 'Receipt', linkedInvoiceId: linked.id, isVoided: false }, select: { total: true } });
            const paid = remainingReceipts.reduce((sum, receipt) => sum + Number(receipt.total), 0);
            await tx.invoice.update({ where: { id: linked.id }, data: { status: Number(linked.total) - paid <= 0.01 ? 'Paid' : 'Pending' } });
          }
        }
        await tx.auditLog.create({ data: { action: `Finance: ${target.type} Voided`, details: `${target.type} ${target.id} ($${target.total}); reason: ${reason}`, userId: payload.userId, userEmail: payload.email, tableName: 'invoices', recordId: target.id, beforeData: target as any, afterData: voided as any, ...audit } });
      });
      return res.status(200).json({ success: true, voided: true });
    } catch (e: any) { handlePrismaError(e, res, 'DELETE'); return; }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
