/**
 * Cron endpoint: POST /api/cron/health-check
 * Hits the local /health endpoint and emails the system admin when the
 * platform or its database is degraded.
 *
 * Triggered by the internal scheduler in server.ts every 5 minutes (and by an
 * external cron if you prefer). Secured by CRON_SECRET header.
 */
import type { HttpRequest, HttpResponse } from '../../lib/http';
import { cors } from '../../lib/auth';
import { notifyAdminOpsAlert } from '../../lib/notifyAdmin';
import { log } from '../../lib/serverLogger.js';

const CRON_SECRET = process.env.CRON_SECRET || '';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-cron-secret'] as string;
  if (!CRON_SECRET) return res.status(503).json({ error: 'Cron endpoint not configured' });
  if (secret !== CRON_SECRET) return res.status(401).json({ error: 'Invalid secret' });

  const port = process.env.PORT || 3000;

  const fetchHealth = () =>
    new Promise<{ res: globalThis.Response; body: any }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Health check timed out')), 10_000);
      fetch(`http://localhost:${port}/health`, { cache: 'no-store' })
        .then(async res => {
          clearTimeout(timer);
          const body = await res.json().catch(() => ({}));
          resolve({ res, body });
        })
        .catch(e => {
          clearTimeout(timer);
          reject(e);
        });
    });

  try {
    const { res: healthRes, body } = await fetchHealth();
    const healthy = healthRes.status === 200 && body.status === 'ok' && body.db === 'connected';

    if (!healthy) {
      const lines: string[] = [
        `HTTP ${healthRes.status}`,
        `status: ${body.status ?? 'unknown'}`,
        `db: ${body.db ?? 'unknown'}`,
      ];
      if (body.maintenanceUntil) lines.push(`maintenance until: ${body.maintenanceUntil}`);
      if (body.error) lines.push(`detail: ${body.error}`);
      notifyAdminOpsAlert('Platform health check failed', [
        { title: 'Health endpoint', lines },
      ]);
      log.warn('[cron/health-check] platform degraded — admin notified');
      return res.status(200).json({ healthy: false, notified: true });
    }

    return res.status(200).json({ healthy: true });
  } catch (e: any) {
    notifyAdminOpsAlert('Platform health check failed', [
      { title: 'Fetch error', lines: [e?.message ?? String(e)] },
    ]);
    log.error(`[cron/health-check] fetch failed: ${e?.message}`);
    return res.status(200).json({ healthy: false, notified: true });
  }
}
