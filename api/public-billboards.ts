import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { cors } from '../lib/auth';
import { hasValidCoordinates } from '../utils/coordinates';
import { log } from '../lib/serverLogger.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rows = await prisma.billboard.findMany({ orderBy: { createdAt: 'asc' } });
    return res.status(200).json(rows.map(toPublicClient));
  } catch (e: any) {
    log.error('[public-billboards]', e);
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

  const lat = coordinatesLat ?? 0;
  const lng = coordinatesLng ?? 0;

  return {
    ...rest,
    coordinates: { lat, lng },
    hasValidCoordinates: hasValidCoordinates({ coordinates: { lat, lng } }),
  };
}
