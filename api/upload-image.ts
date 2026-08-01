import type { HttpRequest, HttpResponse } from '../lib/http';
import { requireAuth, cors } from '../lib/auth';
import { uploadBase64Image } from '../lib/uploadBase64';
import { log } from '../lib/serverLogger.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  const { dataUrl, folder = 'logos' } = req.body ?? {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'dataUrl is required' });
  }
  if (!['logos', 'billboards', 'gallery'].includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  try {
    const url = await uploadBase64Image(folder as 'logos' | 'billboards' | 'gallery', dataUrl, null);
    if (!url) return res.status(400).json({ error: 'No data URL provided' });
    return res.status(200).json({ url });
  } catch (e: any) {
    log.error('[upload-image]', e);
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
}
