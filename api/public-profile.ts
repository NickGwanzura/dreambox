import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma';
import { cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const row = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
    if (!row) return res.status(200).json({});

    return res.status(200).json({
      name: row.name,
      email: row.email,
      phone: row.phone,
      heroImageUrl: row.heroImageUrl || null,
      partnerLogos: row.partnerLogos || null,
    });
  } catch (e: any) {
    log.error('[public-profile]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
