import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { invoiceId } = req.query;
      if (!invoiceId) {
        return res.status(400).json({ error: 'invoiceId required' });
      }
      const rows = await prisma.quotationEvent.findMany({
        where: { invoiceId: invoiceId as string },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { invoiceId, type, details } = req.body ?? {};
      if (!invoiceId || !type) {
        return res.status(400).json({ error: 'invoiceId and type required' });
      }
      const row = await prisma.quotationEvent.create({
        data: {
          invoiceId,
          type,
          actorId: payload.userId,
          actorEmail: payload.email,
          details: details || '',
        },
      });
      return res.status(201).json(row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[quotation-events]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
