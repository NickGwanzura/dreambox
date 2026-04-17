import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';

const billboardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  town: z.string().min(1, 'Town is required'),
  type: z.enum(['Static', 'LED']),
  width: z.number(),
  height: z.number(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const row = await prisma.billboard.findUnique({ where: { id: id as string } });
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(toClient(row));
      }
      const rows = await prisma.billboard.findMany({ orderBy: { createdAt: 'asc' } });
      return res.status(200).json(rows.map(toClient));
    }

    if (req.method === 'POST') {
      const parsed = billboardSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      const data = fromClient(req.body);
      const row = await prisma.billboard.create({ data });
      return res.status(201).json(toClient(row));
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = fromClient(req.body);
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const existing = await prisma.billboard.findUnique({ where: { id: id as string } });
      const row = existing
        ? await prisma.billboard.update({ where: { id: id as string }, data })
        : await prisma.billboard.create({ data: { ...data, id: id as string } });
      return res.status(200).json(toClient(row));
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.billboard.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[billboards]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Map flat Prisma row → nested coordinates object expected by frontend
function toClient(row: any) {
  const { coordinatesLat, coordinatesLng, ...rest } = row;
  return { ...rest, coordinates: { lat: coordinatesLat ?? 0, lng: coordinatesLng ?? 0 } };
}

// Map nested coordinates → flat columns for Prisma
function fromClient(body: any) {
  const { coordinates, id, createdAt, updatedAt, ...rest } = body ?? {};
  return {
    ...rest,
    coordinatesLat: coordinates?.lat ?? null,
    coordinatesLng: coordinates?.lng ?? null,
  };
}
