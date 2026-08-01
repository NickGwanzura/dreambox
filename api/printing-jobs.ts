import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { pickPrintingJobData } from '../lib/whitelist';

const printingJobSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  billboardId: z.string().optional().nullable(),
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  dimensions: z.string().min(1, 'Dimensions are required'),
  pvcCost: z.number().nonnegative(),
  inkCost: z.number().nonnegative(),
  electricityCost: z.number().nonnegative(),
  operatorCost: z.number().nonnegative(),
  weldingCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  chargedAmount: z.number().nonnegative(),
});

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.printingJob.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.printingJob.findMany({ orderBy: { createdAt: 'asc' } });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const parsed = printingJobSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickPrintingJobData(req.body ?? {});
      const row = await prisma.printingJob.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const parsed = printingJobSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = pickPrintingJobData(req.body ?? {});
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.printingJob.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.printingJob.update({ where: { id: id as string }, data })
        : await prisma.printingJob.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!await requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.printingJob.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[printing-jobs]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
