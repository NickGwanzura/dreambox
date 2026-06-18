import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, requireQuotationWritePermission, requireQuotationApprovePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required').max(500, 'Item description too long'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().nonnegative('Amount must be non-negative'),
  billboardId: z.string().optional(),
  contractId: z.string().optional(),
});

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  date: z.string().min(1, 'Date is required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required').max(100, 'Too many line items'),
  subtotal: z.number({ error: 'Subtotal is required' }),
  total: z.number({ error: 'Total is required' }),
  type: z.enum(['Invoice', 'Quotation', 'Proforma', 'Receipt']).optional(),
  terms: z.string().max(2000, 'Terms too long').optional(),
  notes: z.string().max(2000, 'Notes too long').optional(),
});

function validateTotals(data: any): string | null {
  const items: any[] = Array.isArray(data.items) ? data.items : [];
  const grossItems = items.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
  const discountAmount = Math.min(grossItems, Math.max(0, Number(data.discountAmount) || 0));
  const grossAfterDiscount = Math.max(0, grossItems - discountAmount);
  const vatAmount = Number(data.vatAmount) || 0;
  const expectedSubtotal = Number((data.subtotal || 0).toFixed(2));
  const expectedTotal = Number((data.total || 0).toFixed(2));
  const calcSubtotal = Number(grossAfterDiscount.toFixed(2));
  const calcTotal = Number((grossAfterDiscount + vatAmount).toFixed(2));

  // Allow small floating point tolerance
  const tolerance = 1;
  if (Math.abs(expectedSubtotal - calcSubtotal) > tolerance) {
    return `Subtotal mismatch: expected ~${calcSubtotal}, got ${expectedSubtotal}`;
  }
  if (Math.abs(expectedTotal - calcTotal) > tolerance) {
    return `Total mismatch: expected ~${calcTotal}, got ${expectedTotal}`;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.invoice.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const rows = await prisma.invoice.findMany({ orderBy: { createdAt: 'asc' }, take: limit, skip });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = invoiceSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const body = req.body ?? {};
      const { createdAt, updatedAt, id: _clientId, ...data } = body;

      // Permission check for quotations
      if (String(body.type).toLowerCase() === 'quotation') {
        if (!requireQuotationWritePermission(req, res)) return;
      }

      // Server-side total validation
      const totalError = validateTotals(body);
      if (totalError) {
        return res.status(400).json({ error: 'Validation failed', details: [totalError] });
      }

      // Server-side quoteNumber generation for Quotations — prevents client-side counter collisions
      // across concurrent sessions and page reloads.
      if (String(body.type).toLowerCase() === 'quotation' && !data.quoteNumber) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.invoice.count({ where: { quoteNumber: { startsWith: `QT-${today}` } } });
        data.quoteNumber = `QT-${today}-${String(count + 1).padStart(3, '0')}`;
      }

      // Duplicate quote number protection (for manually supplied numbers or races on same counter)
      if (data.quoteNumber) {
        const conflict = await prisma.invoice.findUnique({ where: { quoteNumber: data.quoteNumber } });
        if (conflict) {
          return res.status(409).json({ error: 'Quotation number already exists', quoteNumber: data.quoteNumber });
        }
      }

      // Always let Prisma generate the UUID — never trust client-supplied IDs
      const row = await prisma.invoice.create({ data });
      log.info(`[invoices] POST created ${row.type} ${row.id} for client ${row.clientId}`);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const body = req.body ?? {};
      const { id: _id, createdAt, updatedAt, ...data } = body;

      // Only update if the invoice exists — NEVER silently create (prevents deleted invoices from reappearing)
      const existing = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!existing) {
        return res.status(404).json({ error: 'Invoice not found on server. It may have been deleted.' });
      }

      // Permission check for quotations
      if (String(existing.type).toLowerCase() === 'quotation') {
        if (!requireQuotationWritePermission(req, res)) return;
      }

      // Server-side total validation
      const totalError = validateTotals(body);
      if (totalError) {
        return res.status(400).json({ error: 'Validation failed', details: [totalError] });
      }

      // Duplicate quote number protection on update
      if (body.quoteNumber && body.quoteNumber !== existing.quoteNumber) {
        const conflict = await prisma.invoice.findUnique({ where: { quoteNumber: body.quoteNumber } });
        if (conflict) {
          return res.status(409).json({ error: 'Quotation number already exists', quoteNumber: body.quoteNumber });
        }
      }

      const row = await prisma.invoice.update({ where: { id: id as string }, data });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Verify invoice exists before checking permissions
      const target = await prisma.invoice.findUnique({ where: { id: id as string } });
      if (!target) {
        log.warn(`[invoices] DELETE requested for non-existent invoice ${id}`);
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (!requireDeletePermission(req, res)) return;

      await prisma.invoice.delete({ where: { id: id as string } });
      log.info(`[invoices] DELETE removed invoice ${id} (type=${target.type}, status=${target.status}, total=${target.total})`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[invoices]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
