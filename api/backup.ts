import type { HttpRequest, HttpResponse } from '../lib/http';
import {
  listBackups,
  listDatabaseBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  restoreBackupFromData,
  getApplicationBackupObject,
  getDatabaseBackupObject,
} from '../lib/backup';
import { requireAdmin, cors } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { log } from '../lib/serverLogger';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = await requireAdmin(req, res);
  if (!payload) return;

  try {
    if (req.method === 'GET') {
      if (req.query.action === 'download') {
        const source = req.query.source;
        const id = typeof req.query.id === 'string' ? req.query.id : '';
        const key = typeof req.query.key === 'string' ? req.query.key : '';
        const download = source === 'database'
          ? await getDatabaseBackupObject(key)
          : await getApplicationBackupObject(id);

        await prisma.auditLog.create({
          data: {
            action: 'BACKUP_DOWNLOADED',
            details: `${source === 'database' ? 'Database' : 'Application'} backup downloaded: ${download.fileName}`,
            userId: payload.userId,
            userEmail: payload.email,
            tableName: 'backups',
            recordId: source === 'database' ? key : id,
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
          },
        });

        res.setHeader('Content-Type', download.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        if (download.contentLength !== undefined) {
          res.setHeader('Content-Length', String(download.contentLength));
        }
        download.body.on('error', error => {
          log.error('[backup] Download stream failed', { error: error.message, source, id });
          if (!res.headersSent) res.status(500).json({ error: 'Backup download failed' });
          else res.destroy(error);
        });
        download.body.pipe(res);
        return;
      }

      const [backups, databaseBackups] = await Promise.all([listBackups(), listDatabaseBackups()]);
      return res.status(200).json({
        backups: backups.map(({ url: _url, ...backup }) => backup),
        databaseBackups,
      });
    }

    if (req.method === 'POST') {
      // Direct restore from uploaded JSON file content
      if (req.query.action === 'restore') {
        const result = await restoreBackupFromData(req.body);
        await recordBackupAudit(payload, req, 'BACKUP_RESTORED_FROM_UPLOAD', 'Uploaded application backup restored');
        log.info('[backup] Restored uploaded backup', { restoredBy: payload.email, restored: result.restored, errors: result.errors.length });
        return res.status(200).json({ success: result.errors.length === 0, restored: result.restored, errors: result.errors });
      }

      const result = await createBackup(payload.email);
      await recordBackupAudit(payload, req, 'BACKUP_CREATED', `Application backup created: ${result.id}`, result.id);
      log.info('[backup] Created backup', { id: result.id, createdBy: payload.email, recordCount: result.recordCount, size: result.size });
      return res.status(201).json({
        success: true,
        backup: {
          id: result.id,
          key: result.key,
          createdAt: result.manifest.exportedAt,
          createdBy: payload.email,
          size: result.size,
          recordCount: result.recordCount,
          tables: Object.keys(result.manifest.tableCounts).filter(k => result.manifest.tableCounts[k] > 0),
        },
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Backup id required' });
      await deleteBackup(id);
      await recordBackupAudit(payload, req, 'BACKUP_DELETED', `Application backup deleted: ${id}`, id);
      log.info('[backup] Deleted backup', { id, deletedBy: payload.email });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Backup id required' });
      const result = await restoreBackup(id);
      await recordBackupAudit(payload, req, 'BACKUP_RESTORED', `Application backup restored: ${id}`, id);
      log.info('[backup] Restored backup', { id, restoredBy: payload.email, restored: result.restored, errors: result.errors.length });
      return res.status(200).json({ success: result.errors.length === 0, restored: result.restored, errors: result.errors });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[backup] Unexpected error', { error: e.message });
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}

async function recordBackupAudit(
  payload: { userId: string; email: string },
  req: HttpRequest,
  action: string,
  details: string,
  recordId?: string,
) {
  await prisma.auditLog.create({
    data: {
      action,
      details,
      userId: payload.userId,
      userEmail: payload.email,
      tableName: 'backups',
      recordId: recordId || null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    },
  });
}
