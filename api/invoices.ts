import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, requireQuotationWritePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickInvoiceData } from '../lib/whitelist';

// ─── Validation schemas ───────────────────────────────────────────────────────

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required').max(500, 'Item description too long'),
  quantity: z.number().nonnegative('Quantity must be non-negative'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().nonnegative('Amount must be non-negative'),
  billboardId: z.string().optional(),
  contractId: z.string().optional(),
});

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  date: z.string().min(1, 'Date is required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required').max(100, 'Too many line items'),
  subtotal: z.number({ error: 'Subtotal must be a number' }),
  total: z.number({ error: 'Total must be a number' }),
  type: z.enum(['Invoice', 'Quotation', 'Proforma', 'Receipt']).optional(),
  terms: z.string().max(2000, 'Terms too long').optional(),
  notes: z.string().max(2000, 'Notes too long').optional(),
});

// pickInvoiceData moved to lib/whitelist.ts

// ─── Total validation ─────────────────────────────────────────────────────────

function validateTotals(data: any): string | null {
  const items: any[] = Array.isArray(data.items) ? data.items : [];
  const gross = items.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
  const discount = Math.min(gross, Math.max(0, Number(data.discountAmount) || 0));
  const afterDiscount = Math.max(0, gross - discount);
  const vatAmount = Number(data.vatAmount) || 0;

  const expSub   = Number((data.subtotal || 0).toFixed(2));
  const expTotal = Number((data.total    || 0).toFixed(2));
  const calcSub  = Number(afterDiscount.toFixed(2));
  const calcTot  = Number((afterDiscount + vatAmount).toFixed(2));

  const tolerance = 1;
  if (Math.abs(expSub - calcSub) > tolerance)
    return `Subtotal mismatch: expected ~${calcSub}, got ${expSub}`;
  if (Math.abs(expTotal - calcTot) > tolerance)
    return `Total mismatch: expected ~${calcTot}, got ${expTotal}`;
  return null;
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function handlePrismaError(e: any, res: VercelResponse, context: string): void {
  const code    = e?.code ?? 'UNKNOWN';
  const meta    = e?.meta  ? JSON.stringify(e.meta) : '';
  const message = e?.message ?? String(e);

  log.error(`[invoices] ${context}  prisma_code=${code}  ${meta}  ${message.slice(0, 300)}`);

  if (code === 'P2002') {
    res.status(409).json({ error: 'A record with that unique value already exists.', code });
    return;
  }
  if (code === 'P2025') {
    res.status(404).json({ error: 'Record not found.', code });
    return;
  }
  if (code?.startsWith('P1') || message.includes('ECONNREFUSED') || message.includes('timeout') || message.includes('database')) {
    res.status(503).json({ error: 'Database is temporarily unavailable. Please retry in a moment.', code });
    return;
  }
  res.status(500).json({ error: 'Internal server error', code });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { id } = req.query;
      if (id) {
        const row = await prisma.invoice.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip  = Math.max(0, Number(req.query.skip) || 0);
      const rows  = await prisma.invoice.findMany({ orderBy: { createdAt: 'asc' }, take: limit, skip });
      return res.status(200).json(rows);
    } catch (e: any) {
      handlePrismaError(e, res, 'GET');
    }
    return;
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body ?? {};

    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues.map(e => e.message),
      });
    }

    if (String(body.type).toLowerCase() === 'quotation') {
      if (!await requireQuotationWritePermission(req, res)) return;
    }

    const totalError = validateTotals(body);
    if (totalError) {
      return res.status(400).json({ error: 'Validation failed', details: [totalError] });
    }

    try {
      const data: any = pickInvoiceData(body);
      // Creation defaults (the whitelist leaves absent fields undefined so
      // partial PUTs can't reset them; status/type default in the schema)
      if (data.vatAmount == null) data.vatAmount = 0;

      // Server-side quoteNumber generation — prevents client-side counter collisions
      if (String(body.type).toLowerCase() === 'quotation' && !data.quoteNumber) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.invoice.count({ where: { quoteNumber: { startsWith: `QT-${today}` } } });
        data.quoteNumber = `QT-${today}-${String(count + 1).padStart(3, '0')}`;
      }

      if (data.quoteNumber) {
        const conflict = await prisma.invoice.findUnique({ where: { quoteNumber: data.quoteNumber } });
        if (conflict) {
          return res.status(409).json({ error: 'Quotation number already exists', quoteNumber: data.quoteNumber });
        }
      }

      // Auto-billing idempotency: a client running against stale local data
      // can re-post this month's rental invoice for a contract. Reject the
      // duplicate; manual invoices (non-"Monthly Rental" items) are unaffected.
      const isMonthlyRental = String(body.type).toLowerCase() === 'invoice'
        && data.contractId
        && String(body.items?.[0]?.description || '').startsWith('Monthly Rental');
      if (isMonthlyRental) {
        const monthPrefix = String(data.date || '').slice(0, 7);
        if (monthPrefix) {
          const sameMonth = await prisma.invoice.findMany({
            where: { contractId: data.contractId, type: 'Invoice', date: { startsWith: monthPrefix } },
            select: { id: true, items: true },
          });
          const duplicate = sameMonth.find(inv =>
            Array.isArray(inv.items) && String((inv.items as any[])[0]?.description || '').startsWith('Monthly Rental')
          );
          if (duplicate) {
            log.warn(`[invoices] POST rejected duplicate monthly invoice for contract ${data.contractId} (${monthPrefix})`);
            return res.status(409).json({ error: 'Monthly invoice already exists for this contract and month', existingId: duplicate.id });
          }
        }
      }

      const row = await prisma.invoice.create({ data });
      log.info(`[invoices] POST created ${row.type} ${row.id} for client ${row.clientId}`);
      return res.status(201).json(row);
    } catch (e: any) {
      handlePrismaError(e, res, 'POST');
    }
    return;
  }

  // ── PUT ────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const body = req.body ?? {};

    try {
      const existing = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found on server. It may have been deleted.' });
      }

      if (String(existing.type).toLowerCase() === 'quotation') {
        if (!await requireQuotationWritePermission(req, res)) return;
      }

      const totalError = validateTotals(body);
      if (totalError) {
        return res.status(400).json({ error: 'Validation failed', details: [totalError] });
      }

      if (body.quoteNumber && body.quoteNumber !== existing.quoteNumber) {
        const conflict = await prisma.invoice.findUnique({ where: { quoteNumber: body.quoteNumber } });
        if (conflict) {
          return res.status(409).json({ error: 'Quotation number already exists', quoteNumber: body.quoteNumber });
        }
      }

      const data = pickInvoiceData(body);
      const row = await prisma.invoice.update({ where: { id: id as string }, data });
      return res.status(200).json(row);
    } catch (e: any) {
      handlePrismaError(e, res, 'PUT');
    }
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    if (!await requireDeletePermission(req, res)) return;

    try {
      const target = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!target) {
        log.warn(`[invoices] DELETE requested for non-existent invoice ${id}`);
        return res.status(404).json({ error: 'Invoice not found' });
      }

      await prisma.invoice.delete({ where: { id: id as string } });
      log.info(`[invoices] DELETE removed ${id} type=${target.type} status=${target.status} total=${target.total}`);
      return res.status(200).json({ success: true });
    } catch (e: any) {
      handlePrismaError(e, res, 'DELETE');
    }
    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
