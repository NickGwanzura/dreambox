import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma';
import { cors } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rows = await prisma.billboard.findMany({ orderBy: { createdAt: 'asc' } });
    return res.status(200).json(rows.map(toPublicClient));
  } catch (e: any) {
    console.error('[public-billboards]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function toPublicClient(row: any) {
  const {
    coordinatesLat,
    coordinatesLng,
    notes,
    sideAClientId,
    sideBClientId,
    createdAt,
    updatedAt,
    ...rest
  } = row;

  return {
    ...rest,
    coordinates: { lat: coordinatesLat ?? 0, lng: coordinatesLng ?? 0 },
  };
}
