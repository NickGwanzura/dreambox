import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const rows = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { action, details, tableName, recordId } = req.body ?? {};
      if (!action || !details) {
        return res.status(400).json({ error: 'action and details are required' });
      }
      const row = await prisma.auditLog.create({
        data: {
          action,
          details,
          userId: payload.userId,
          userEmail: payload.email,
          tableName: tableName || null,
          recordId: recordId || null,
        },
      });
      return res.status(201).json(row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[audit-logs]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
