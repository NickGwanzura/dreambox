import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin, cors } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const payload = requireAuth(req, res);
      if (!payload) return;
      const row = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
      return res.status(200).json(row ?? {});
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const adminPayload = requireAdmin(req, res);
      if (!adminPayload) return;
      const { id, ...data } = req.body ?? {};
      const row = await prisma.companyProfile.upsert({
        where: { id: 'profile_v1' },
        update: data,
        create: { id: 'profile_v1', name: data.name ?? '', ...data },
      });
      return res.status(200).json(row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[company-profile]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
