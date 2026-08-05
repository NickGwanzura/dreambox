import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

const contractDateSchema = z
  .string()
  .min(1, 'Date is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const year = parseInt(val.slice(0, 4), 10);
    return year >= 2000 && year <= 2099;
  }, 'Year must be between 2000 and 2099');

// Schema for POST (create)
const contractSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  billboardId: z.string().min(1, 'Billboard ID is required'),
  startDate: contractDateSchema,
  endDate: contractDateSchema,
  monthlyRate: z.number({ error: 'Monthly rate is required' }),
  sourceQuotationId: z.string().max(200).optional(),
}).refine(d => d.startDate <= d.endDate, { message: 'End date must be on or after start date', path: ['endDate'] });

// Full schema for PUT (update) — validates ALL fields that come through syncToDatabase
const contractUpdateSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  billboardId: z.string().min(1, 'Billboard ID is required'),
  startDate: contractDateSchema,
  endDate: contractDateSchema,
  monthlyRate: z.number({ error: 'Monthly rate is required' }),
  installationCost: z.number().optional().default(0),
  printingCost: z.number().optional().default(0),
  productionCost: z.number().optional().default(0),
  hasVat: z.boolean().optional().default(false),
  totalContractValue: z.number({ error: 'Total contract value is required' }),
  status: z.enum(['Active', 'Pending', 'Expired']).optional(),
  details: z.string().optional().default(''),
  slotNumber: z.number().int().optional().nullable(),
  side: z.string().optional().nullable(),
  createdAt: z.string().optional().nullable(),
  lastModifiedDate: z.string().optional().nullable(),
  lastModifiedBy: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  masterContractId: z.string().optional().nullable(),
  sourceQuotationId: z.string().optional().nullable(),
}).refine(d => d.startDate <= d.endDate, { message: 'End date must be on or after start date', path: ['endDate'] });

class ContractConversionError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = 'ContractConversionError';
  }
}

// Creates a contract from a quotation and marks the quotation Converted in the
// SAME transaction. The quote row is locked with SELECT ... FOR UPDATE so two
// concurrent conversions (two devices) serialize: the loser reads the already-
// Converted quote and is rejected with 409 instead of creating a duplicate.
// Note: FOR UPDATE is a no-op on SQLite (desktop builds); production runs on
// Postgres where the lock fully closes the race.
async function createContractFromQuotation(data: any, sourceQuotationId: string, payload: any) {
  return prisma.$transaction(async tx => {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${sourceQuotationId} FOR UPDATE`);
    }
    const quote = await tx.invoice.findUnique({ where: { id: sourceQuotationId } });
    if (!quote || quote.type !== 'Quotation' || quote.isVoided) {
      throw new ContractConversionError('Source quotation not found', 404);
    }
    if (quote.quoteStatus === 'Converted' || quote.convertedToContractId || quote.convertedToInvoiceId) {
      throw new ContractConversionError(`Quotation ${quote.quoteNumber || quote.id} has already been converted`);
    }
    const created = await tx.contract.create({ data });
    await tx.invoice.update({
      where: { id: sourceQuotationId },
      data: { quoteStatus: 'Converted', convertedToContractId: created.id, convertedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: 'Contract Created from Quotation',
        details: `Contract ${created.id} created from quotation ${sourceQuotationId}${quote.quoteNumber ? ` (${quote.quoteNumber})` : ''}`,
        userId: payload.userId,
        userEmail: payload.email,
        tableName: 'contracts',
        recordId: created.id,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'Quotation Converted to Contract',
        details: `Quotation ${sourceQuotationId} converted to contract ${created.id}`,
        userId: payload.userId,
        userEmail: payload.email,
        tableName: 'invoices',
        recordId: sourceQuotationId,
      },
    });
    // Timeline parity with the invoice path (convertQuotationToInvoice logs a
    // 'converted' event) so QuotationTimeline shows the contract conversion.
    await tx.quotationEvent.create({
      data: {
        invoiceId: sourceQuotationId,
        type: 'converted',
        actorEmail: payload.email,
        details: `Converted to Contract ${created.id}`,
      },
    });
    return created;
  });
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.contract.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 1000));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const rows = await prisma.contract.findMany({ orderBy: { dbCreatedAt: 'asc' }, take: limit, skip });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = contractSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      // Only pick fields that exist in the Prisma schema
      const {
        id, clientId, billboardId, startDate, endDate, monthlyRate,
        installationCost, printingCost, productionCost, hasVat,
        totalContractValue, status, details, slotNumber, side,
        createdAt, lastModifiedDate, lastModifiedBy, assignedTo, masterContractId,
        sourceQuotationId,
      } = req.body ?? {};

      // Server-side availability guard — prevents duplicate slot/side bookings even via direct API calls
      const incomingStatus = status ?? 'Pending';
      if (incomingStatus === 'Active' && billboardId && startDate && endDate) {
        if (slotNumber != null) {
          const conflict = await prisma.contract.findFirst({
            where: {
              billboardId,
              slotNumber: Number(slotNumber),
              status: 'Active',
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
          });
          if (conflict) {
            return res.status(409).json({
              error: `Slot ${slotNumber} is already booked for these dates`,
              conflictingContract: conflict.id,
            });
          }
        } else if (side) {
          const sideFilter = side === 'Both'
            ? [{ side: 'A' }, { side: 'B' }, { side: 'Both' }]
            : [{ side: side as string }, { side: 'Both' }];
          const conflict = await prisma.contract.findFirst({
            where: {
              billboardId,
              status: 'Active',
              startDate: { lte: endDate },
              endDate: { gte: startDate },
              OR: sideFilter,
            },
          });
          if (conflict) {
            return res.status(409).json({
              error: `Side ${side} is already booked for these dates`,
              conflictingContract: conflict.id,
            });
          }
        }
      }

      const data = {
        id, clientId, billboardId, startDate, endDate, monthlyRate,
        installationCost: installationCost ?? 0,
        printingCost: printingCost ?? 0,
        productionCost: productionCost ?? 0,
        hasVat: hasVat ?? false,
        totalContractValue: totalContractValue ?? monthlyRate,
        status: incomingStatus,
        details: details ?? '',
        slotNumber: slotNumber ?? null,
        side: side ?? null,
        createdAt: createdAt ?? null,
        lastModifiedDate: lastModifiedDate ?? null,
        lastModifiedBy: lastModifiedBy ?? null,
        assignedTo: assignedTo ?? null,
        masterContractId: masterContractId ?? null,
        sourceQuotationId: sourceQuotationId ?? null,
      };
      // When the contract is being created from a quotation, the quotation's
      // Converted flip happens server-side and atomically (see
      // createContractFromQuotation) — this is the guard against cross-device
      // duplicate conversions.
      const row = sourceQuotationId
        ? await createContractFromQuotation(data, sourceQuotationId, payload)
        : await prisma.contract.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { id: _id, dbCreatedAt, updatedAt, ...data } = req.body ?? {};

      // FIX #1: Validate all incoming data with Zod before touching the database
      const parsed = contractUpdateSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }

      // FIX #2: Only update if the contract exists — NEVER silently create (prevents duplicates)
      const existing = await prisma.contract.findUnique({ where: { id: id as string } });
      if (!existing) {
        return res.status(404).json({ error: 'Contract not found on server. Sync the contract locally first, then retry.' });
      }

      // Server-side availability guard for edits — re-check if dates/slot/side changed or status became Active
      const updatedStatus = parsed.data.status ?? existing.status;
      if (updatedStatus === 'Active') {
        const { billboardId: updBillboardId, startDate: updStart, endDate: updEnd, slotNumber: updSlot, side: updSide } = parsed.data;
        if (updBillboardId && updStart && updEnd) {
          if (updSlot != null) {
            const conflict = await prisma.contract.findFirst({
              where: {
                billboardId: updBillboardId,
                slotNumber: updSlot,
                status: 'Active',
                startDate: { lte: updEnd },
                endDate: { gte: updStart },
                id: { not: id as string },
              },
            });
            if (conflict) {
              return res.status(409).json({
                error: `Slot ${updSlot} is already booked for these dates`,
                conflictingContract: conflict.id,
              });
            }
          } else if (updSide) {
            const sideFilter = updSide === 'Both'
              ? [{ side: 'A' }, { side: 'B' }, { side: 'Both' }]
              : [{ side: updSide }, { side: 'Both' }];
            const conflict = await prisma.contract.findFirst({
              where: {
                billboardId: updBillboardId,
                status: 'Active',
                startDate: { lte: updEnd },
                endDate: { gte: updStart },
                OR: sideFilter,
                id: { not: id as string },
              },
            });
            if (conflict) {
              return res.status(409).json({
                error: `Side ${updSide} is already booked for these dates`,
                conflictingContract: conflict.id,
              });
            }
          }
        }
      }

      const row = await prisma.contract.update({ where: { id: id as string }, data: parsed.data });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Verify the contract exists
      const existing = await prisma.contract.findUnique({ where: { id: id as string } });
      if (!existing) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      // Safety guard: only allow deletion of contracts that are already ended/expired
      if (existing.status !== 'Expired') {
        return res.status(400).json({
          error: 'Only contracts with status "Expired" can be permanently deleted. End the contract first.',
        });
      }

      const linkedInvoiceCount = await prisma.invoice.count({ where: { contractId: id as string } });
      if (linkedInvoiceCount > 0) {
        return res.status(409).json({
          error: 'Contracts with linked invoices cannot be permanently deleted. Void or retain the financial records for the audit trail.',
        });
      }

      // Cascade-delete ALL linked data in a single transaction so partial deletion is impossible.
      const [invoicesRes, amendmentsRes] = await prisma.$transaction([
        prisma.invoice.deleteMany({ where: { contractId: id as string } }),
        prisma.contractAmendment.deleteMany({ where: { contractId: id as string } }),
      ]);
      await prisma.contract.delete({ where: { id: id as string } });

      // Write audit log server-side
      await prisma.auditLog.create({
        data: {
          action: 'Permanent Delete',
          details: `Deleted contract ${id} (${existing.clientId}, ${existing.monthlyRate}/mo, invoices: ${invoicesRes.count}, amendments: ${amendmentsRes.count})`,
          userId: payload.userId,
          userEmail: payload.email,
          tableName: 'contracts',
          recordId: id as string,
        },
      }).catch((e: any) => log.warn('[contracts] audit log write failed:', e?.message));

      return res.status(200).json({
        success: true,
        invoicesDeleted: invoicesRes.count,
        amendmentsDeleted: amendmentsRes.count,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    if (e instanceof ContractConversionError) {
      return res.status(e.status).json({ error: e.message });
    }
    log.error('[contracts]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
