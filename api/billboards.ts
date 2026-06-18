import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireDeletePermission, cors } from '../lib/auth';
import { validateBillboard, ValidationError } from '../utils/validation';
import { hasValidCoordinates, isFallbackCoordinate } from '../utils/coordinates';
import { uploadBase64Image } from '../lib/uploadBase64';
import { log } from '../lib/serverLogger.js';

const coordinateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const billboardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  town: z.string().min(1, 'Town is required'),
  type: z.enum(['Static', 'LED']),
  width: z.number(),
  height: z.number(),
  coordinates: coordinateSchema.optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
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
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const rows = await prisma.billboard.findMany({ orderBy: { createdAt: 'asc' }, take: limit, skip });
      return res.status(200).json(rows.map(toClient));
    }

    if (req.method === 'POST') {
      const parsed = billboardSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(e => e.message) });
      }
      validateBillboard(req.body);
      // imageUrl is normally a pre-uploaded R2 URL; uploadBase64Image handles legacy base64 as fallback
      const imageUrl = await uploadBase64Image('billboards', req.body.imageUrl);
      const data = fromClient({ ...req.body, imageUrl });
      const { id: clientId, ...createData } = data;
      const row = await prisma.billboard.create({ data: clientId ? { ...createData, id: clientId } : createData });
      return res.status(201).json(toClient(row));
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      validateBillboard(req.body);
      const existing = await prisma.billboard.findUnique({ where: { id: id as string } });
      // imageUrl is normally a pre-uploaded R2 URL; uploadBase64Image handles legacy base64 as fallback
      const imageUrl = await uploadBase64Image('billboards', req.body.imageUrl, existing?.imageUrl);
      const { id: _stripId, ...updateData } = fromClient({ ...req.body, imageUrl });
      // Upsert: update if exists, create if not (handles client-side generated IDs)
      const row = existing
        ? await prisma.billboard.update({ where: { id: id as string }, data: updateData })
        : await prisma.billboard.create({ data: { ...updateData, id: id as string } });
      return res.status(200).json(toClient(row));
    }

    if (req.method === 'DELETE') {
      if (!requireDeletePermission(req, res)) return;
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.billboard.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[billboards]', e);
    if (e instanceof ValidationError) {
      return res.status(400).json({ error: e.message, field: e.field });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Map flat Prisma row → nested coordinates object expected by frontend
function toClient(row: any) {
  const { coordinatesLat, coordinatesLng, ...rest } = row;
  const lat = coordinatesLat ?? 0;
  const lng = coordinatesLng ?? 0;
  return {
    ...rest,
    coordinates: { lat, lng },
    hasValidCoordinates: hasValidCoordinates({ coordinates: { lat, lng } }),
  };
}

// Map nested coordinates → flat columns for Prisma
function fromClient(body: any) {
  const { coordinates, createdAt, updatedAt, hasValidCoordinates, ...rest } = body ?? {};
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;

  // Treat zero/fallback coordinates as missing so they don't pollute the map.
  const normalizedLat =
    typeof lat === 'number' && Number.isFinite(lat) && !(lat === 0 && lng === 0) && !isFallbackCoordinate(lat, lng ?? 0)
      ? lat
      : null;
  const normalizedLng =
    typeof lng === 'number' && Number.isFinite(lng) && !(lat === 0 && lng === 0) && !isFallbackCoordinate(lat ?? 0, lng)
      ? lng
      : null;

  return {
    ...rest,
    coordinatesLat: normalizedLat,
    coordinatesLng: normalizedLng,
  };
}
