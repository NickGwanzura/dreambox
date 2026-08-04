import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

const reportTypeSchema = z.enum(['CheckIn', 'CampaignProof', 'Issue']);
const reportStatusSchema = z.enum(['Pending', 'Submitted', 'Resolved']);
const recordIdSchema = z.string().trim().min(1, 'A record ID is required').max(191, 'Record ID is too long');
const reportIdSchema = z.string().uuid('Report ID must be a UUID');
const optionalFiniteNumber = z.number().finite().optional().nullable();

const photoUrlSchema = z.string()
  .trim()
  .min(1, 'Photo URL cannot be empty')
  .max(2_048, 'Photo URL is too long')
  .refine(value => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Photo must be a durable HTTP(S) URL, not browser-local data');

const capturedAtSchema = z.string()
  .trim()
  .min(1, 'Captured time is required')
  .max(64, 'Captured time is invalid')
  .refine(
    value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(new Date(value).getTime()),
    'Captured time must be an ISO date-time',
  );

const createSchema = z.object({
  id: reportIdSchema,
  type: reportTypeSchema,
  billboardId: recordIdSchema,
  contractId: recordIdSchema.optional().nullable(),
  note: z.string().trim().max(4_000, 'Note is too long').optional().nullable(),
  photoUrl: photoUrlSchema.optional().nullable(),
  latitude: optionalFiniteNumber.refine(value => value == null || (value >= -90 && value <= 90), 'Latitude must be between -90 and 90'),
  longitude: optionalFiniteNumber.refine(value => value == null || (value >= -180 && value <= 180), 'Longitude must be between -180 and 180'),
  accuracy: optionalFiniteNumber.refine(value => value == null || (value >= 0 && value <= 100_000), 'Accuracy must be between 0 and 100000 metres'),
  capturedAt: capturedAtSchema,
}).strict().superRefine((value, ctx) => {
  const hasLatitude = value.latitude != null;
  const hasLongitude = value.longitude != null;
  const hasCoordinates = hasLatitude && hasLongitude;
  const hasNote = !!value.note?.trim();
  const hasPhoto = !!value.photoUrl;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude and longitude must be supplied together' });
  }
  if (value.accuracy != null && !hasCoordinates) {
    ctx.addIssue({ code: 'custom', path: ['accuracy'], message: 'Accuracy requires latitude and longitude' });
  }
  if (value.type === 'CampaignProof' && !value.contractId) {
    ctx.addIssue({ code: 'custom', path: ['contractId'], message: 'Campaign proof requires an active contract' });
  }
  if (value.type === 'CheckIn' && !hasCoordinates) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Check-in requires a captured location' });
  }
  if (value.type === 'Issue' && !hasNote && !hasPhoto) {
    ctx.addIssue({ code: 'custom', path: ['note'], message: 'Issue reports need a note or photo' });
  }
});

const updateSchema = z.object({
  status: reportStatusSchema.optional(),
  note: z.string().trim().max(4_000, 'Note is too long').nullable().optional(),
  photoUrl: photoUrlSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Provide a status, note, or photo URL to update');

const querySchema = z.object({
  billboardId: recordIdSchema.optional(),
  contractId: recordIdSchema.optional(),
  status: reportStatusSchema.optional(),
}).strict();

function validationError(res: HttpResponse, issues: readonly { message: string }[]) {
  return res.status(400).json({ error: 'Validation failed', details: issues.map(issue => issue.message) });
}

function cleanOptionalString(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned || null;
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(value as Date).toISOString();
}

/** Maps Prisma dates/nulls to the browser-facing FieldReport interface. */
function toClient(row: any) {
  return {
    id: row.id,
    type: row.type,
    billboardId: row.billboardId,
    ...(row.contractId ? { contractId: row.contractId } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.photoUrl ? { photoUrl: row.photoUrl } : {}),
    ...(row.latitude != null ? { latitude: row.latitude } : {}),
    ...(row.longitude != null ? { longitude: row.longitude } : {}),
    ...(row.accuracy != null ? { accuracy: row.accuracy } : {}),
    status: row.status,
    reportedBy: row.reportedBy,
    ...(row.reportedByEmail ? { reportedByEmail: row.reportedByEmail } : {}),
    capturedAt: toIso(row.capturedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(res, parsed.error.issues);

      const where = {
        ...(parsed.data.billboardId ? { billboardId: parsed.data.billboardId } : {}),
        ...(parsed.data.contractId ? { contractId: parsed.data.contractId } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      };
      const rows = await prisma.fieldReport.findMany({
        where,
        orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      });
      return res.status(200).json(rows.map(toClient));
    }

    if (req.method === 'POST') {
      const parsed = createSchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(res, parsed.error.issues);

      const data = parsed.data;
      const [billboard, contract] = await Promise.all([
        prisma.billboard.findUnique({ where: { id: data.billboardId }, select: { id: true } }),
        data.contractId
          ? prisma.contract.findUnique({ where: { id: data.contractId }, select: { id: true, billboardId: true } })
          : Promise.resolve(null),
      ]);
      if (!billboard) return res.status(404).json({ error: 'Billboard not found' });
      if (data.contractId && !contract) return res.status(404).json({ error: 'Contract not found' });
      if (contract && contract.billboardId !== data.billboardId) {
        return res.status(400).json({ error: 'The selected contract does not belong to this billboard' });
      }

      // A stable client-generated report ID makes image/report retries idempotent.
      // Check ownership before upsert so an improbable UUID collision cannot expose
      // or overwrite another reporter's record.
      const existing = await prisma.fieldReport.findUnique({ where: { id: data.id } });
      if (existing) {
        if (existing.reportedBy !== payload.userId) {
          return res.status(409).json({ error: 'This report ID is already in use' });
        }
        return res.status(200).json(toClient(existing));
      }

      const row = await prisma.fieldReport.upsert({
        where: { id: data.id },
        create: {
          id: data.id,
          type: data.type,
          billboardId: data.billboardId,
          contractId: data.contractId ?? null,
          note: cleanOptionalString(data.note),
          photoUrl: data.photoUrl ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          accuracy: data.accuracy ?? null,
          // Server rows are submitted. Pending is reserved for the device queue.
          status: 'Submitted',
          reportedBy: payload.userId,
          reportedByEmail: payload.email || null,
          capturedAt: new Date(data.capturedAt),
        },
        // Do not let a retry mutate a record after its first successful submit.
        update: {},
      });
      if (row.reportedBy !== payload.userId) {
        return res.status(409).json({ error: 'This report ID is already in use' });
      }
      return res.status(201).json(toClient(row));
    }

    if (req.method === 'PUT') {
      const reportId = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!reportId) return res.status(400).json({ error: 'id required' });
      const parsedId = reportIdSchema.safeParse(reportId);
      if (!parsedId.success) return validationError(res, parsedId.error.issues);
      const parsed = updateSchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(res, parsed.error.issues);
      if (parsed.data.status === 'Resolved' && payload.role !== 'Admin' && payload.role !== 'Manager') {
        return res.status(403).json({ error: 'Only Managers and Admins can resolve field reports' });
      }

      const existing = await prisma.fieldReport.findUnique({ where: { id: parsedId.data } });
      if (!existing) return res.status(404).json({ error: 'Field report not found' });

      const nextNote = parsed.data.note === undefined ? existing.note : cleanOptionalString(parsed.data.note);
      const nextPhotoUrl = parsed.data.photoUrl === undefined ? existing.photoUrl : parsed.data.photoUrl;
      if (existing.type === 'Issue' && !nextNote && !nextPhotoUrl) {
        return res.status(400).json({ error: 'Issue reports need a note or photo' });
      }

      const updateData = {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.note !== undefined ? { note: nextNote } : {}),
        ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl } : {}),
      };
      const row = await prisma.fieldReport.update({ where: { id: parsedId.data }, data: updateData });
      return res.status(200).json(toClient(row));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    log.error('[field-reports]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
