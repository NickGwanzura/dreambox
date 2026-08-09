import type { HttpRequest, HttpResponse } from '../../lib/http';
import { createBackup } from '../../lib/backup';
import { cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Cron work must never be exposed when its credential is absent.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  if (!cronSecret) {
    log.error('[cron/backup] CRON_SECRET env var is not set — refusing request');
    return res.status(503).json({ error: 'Cron endpoint not configured' });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await createBackup('cron');
    log.info('[cron/backup] Backup created:', result.key);
    return res.status(201).json({ success: true, key: result.key, url: result.url });
  } catch (e: any) {
    log.error('[cron/backup]', e);
    return res.status(500).json({ error: e.message || 'Backup failed' });
  }
}
