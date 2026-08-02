import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth, requireManagerOrAdmin, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { z } from 'zod';

const clientEventSchema = z.object({
  action: z.string().trim().min(1).max(120),
  details: z.string().trim().min(1).max(2000),
  tableName: z.string().trim().max(120).optional().nullable(),
  recordId: z.string().trim().max(200).optional().nullable(),
});

const proofUrlKey = (key: string) => key.replace(/[\s_-]/g, '').toLowerCase() === 'proofpaymenturl';

/**
 * Audit history is finance-sensitive.  Proof-of-payment object URLs are
 * credentials to private evidence and must never be exposed through the audit
 * feed, including when they appear in nested before/after snapshots.
 */
export function redactProofUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProofUrls);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      proofUrlKey(key) ? '[REDACTED]' : redactProofUrls(nested),
    ]),
  );
}

export function redactAuditLogForResponse<T extends { beforeData?: unknown; afterData?: unknown }>(row: T): T {
  return {
    ...row,
    beforeData: redactProofUrls(row.beforeData),
    afterData: redactProofUrls(row.afterData),
  } as T;
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const payload = await requireManagerOrAdmin(req, res);
      if (!payload) return;
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const rows = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return res.status(200).json(rows.map(redactAuditLogForResponse));
    }

    if (req.method === 'POST') {
      const payload = await requireAuth(req, res);
      if (!payload) return;
      const parsed = clientEventSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Valid action and details are required' });
      const { action, details, tableName, recordId } = parsed.data;
      const row = await prisma.auditLog.create({
        data: {
          action: `CLIENT_REPORTED: ${action}`,
          details,
          userId: payload.userId,
          userEmail: payload.email,
          tableName: tableName || null,
          recordId: recordId || null,
          source: 'CLIENT_REPORTED',
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        },
      });
      return res.status(201).json(redactAuditLogForResponse(row));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[audit-logs]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
