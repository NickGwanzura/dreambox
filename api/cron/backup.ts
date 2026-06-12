import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createBackup } from '../../lib/backup';
import { cors } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Optional cron secret protection
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await createBackup('cron');
    console.log('[cron/backup] Backup created:', result.key);
    return res.status(201).json({ success: true, key: result.key, url: result.url });
  } catch (e: any) {
    console.error('[cron/backup]', e);
    return res.status(500).json({ error: e.message || 'Backup failed' });
  }
}
