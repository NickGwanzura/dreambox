import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

const MAX_LOGO_BYTES = 6 * 1024 * 1024;

/**
 * Returns the company logo as a base64 data URL.
 *
 * The R2 public bucket does not send CORS headers, so the browser cannot
 * fetch the logo URL directly for canvas/PDF work. This endpoint fetches it
 * server-side (same-origin for the client). The URL comes from the stored
 * company profile — never from the request — so it cannot be used as an
 * open proxy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    const profile = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
    const logo = profile?.logo || '';
    if (!logo) return res.status(404).json({ error: 'No logo set' });

    // Already stored inline — return as-is
    if (logo.startsWith('data:')) {
      return res.status(200).json({ dataUrl: logo });
    }

    const upstream = await fetch(logo);
    if (!upstream.ok) {
      log.warn(`[logo-proxy] Upstream fetch failed: ${upstream.status} for ${logo}`);
      return res.status(502).json({ error: 'Could not fetch logo from storage' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_LOGO_BYTES) {
      return res.status(502).json({ error: 'Logo too large' });
    }

    const mimetype = upstream.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ dataUrl });
  } catch (e: any) {
    log.error('[logo-proxy]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
