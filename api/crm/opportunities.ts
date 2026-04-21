import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id, companyId } = req.query;
      if (id) {
        const row = await prisma.cRMOpportunity.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(row);
      }
      const rows = await prisma.cRMOpportunity.findMany({
        where: companyId ? { companyId: companyId as string } : undefined,
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { id, createdAt, updatedAt, ...data } = req.body ?? {};
      const row = await prisma.cRMOpportunity.create({ data });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { id: _id, createdAt, updatedAt, ...data } = req.body ?? {};
      const existing = await prisma.cRMOpportunity.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.cRMOpportunity.update({ where: { id: id as string }, data })
        : await prisma.cRMOpportunity.create({ data: { ...data, id: id as string } });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.cRMOpportunity.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[crm/opportunities]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
