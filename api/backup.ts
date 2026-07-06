import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listBackups, createBackup, deleteBackup, restoreBackup, restoreBackupFromData } from '../lib/backup';
import { requireAuth, requireAdmin, cors } from '../lib/auth';
import { log } from '../lib/serverLogger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      const backups = await listBackups();
      return res.status(200).json({ backups });
    }

    if (req.method === 'POST') {
      if (!await requireAdmin(req, res)) return;

      // Direct restore from uploaded JSON file content
      if (req.query.action === 'restore') {
        const result = await restoreBackupFromData(req.body);
        log.info('[backup] Restored uploaded backup', { restoredBy: payload.email, restored: result.restored, errors: result.errors.length });
        return res.status(200).json({ success: result.errors.length === 0, restored: result.restored, errors: result.errors });
      }

      const result = await createBackup(payload.email);
      log.info('[backup] Created backup', { id: result.id, createdBy: payload.email, recordCount: result.recordCount, size: result.size });
      return res.status(201).json({
        success: true,
        backup: {
          id: result.id,
          key: result.key,
          url: result.url,
          createdAt: result.manifest.exportedAt,
          createdBy: payload.email,
          size: result.size,
          recordCount: result.recordCount,
          tables: Object.keys(result.manifest.tableCounts).filter(k => result.manifest.tableCounts[k] > 0),
        },
      });
    }

    if (req.method === 'DELETE') {
      if (!await requireAdmin(req, res)) return;
      const { id } = req.query;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Backup id required' });
      await deleteBackup(id);
      log.info('[backup] Deleted backup', { id, deletedBy: payload.email });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      if (!await requireAdmin(req, res)) return;
      const { id } = req.query;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Backup id required' });
      const result = await restoreBackup(id);
      log.info('[backup] Restored backup', { id, restoredBy: payload.email, restored: result.restored, errors: result.errors.length });
      return res.status(200).json({ success: result.errors.length === 0, restored: result.restored, errors: result.errors });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[backup] Unexpected error', { error: e.message });
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
