import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { cors } from '../lib/auth';
import { hasValidCoordinates } from '../utils/coordinates';
import { log } from '../lib/serverLogger.js';
import { parsePagination } from '../lib/pagination.js';
import { checkRateLimit } from '../lib/rateLimiter.js';
import { getClientIp } from '../lib/clientIp.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rate = await checkRateLimit(`public-billboards:${getClientIp(req)}`, { maxAttempts: 120, windowMs: 60_000 });
  if (!rate.allowed) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  try {
    const { take, skip } = parsePagination(req.query as any, 500);
    const rows = await prisma.billboard.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take, skip });
    const today = new Date().toISOString().slice(0, 10);
    const billboardIds = rows.map((row: any) => row.id);
    const activeContracts = billboardIds.length
      ? await prisma.contract.findMany({
          where: { billboardId: { in: billboardIds }, status: 'Active', startDate: { lte: today }, endDate: { gte: today } },
          select: { id: true, billboardId: true, startDate: true, endDate: true, status: true, side: true, slotNumber: true },
        })
      : [];
    const contractsByBillboard = new Map<string, any[]>();
    for (const contract of activeContracts) {
      const current = contractsByBillboard.get(contract.billboardId) || [];
      current.push(contract);
      contractsByBillboard.set(contract.billboardId, current);
    }
    return res.status(200).json(rows.map((row: any) => ({
      ...toPublicClient(row),
      // Public pages must derive occupancy from the same active contracts as
      // the authenticated app. No client identity or financial details leave
      // the server in this payload.
      activeContracts: contractsByBillboard.get(row.id) || [],
    })));
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
