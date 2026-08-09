import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';
import { isAllowedStorageReference, storageUrlForKey } from '../lib/storage';

const MAX_LOGO_BYTES = 6 * 1024 * 1024;

async function readWithLimit(response: Response): Promise<Buffer> {
  const length = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_LOGO_BYTES) throw new Error('Logo too large');
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_LOGO_BYTES) throw new Error('Logo too large');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}

/**
 * Returns the company logo as a base64 data URL.
 *
 * The R2 public bucket does not send CORS headers, so the browser cannot
 * fetch the logo URL directly for canvas/PDF work. This endpoint fetches it
 * server-side (same-origin for the client). The URL comes from the stored
 * company profile — never from the request — so it cannot be used as an
 * open proxy.
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const payload = await requireAuth(req, res);
  if (!payload) return;

  try {
    const profile = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
    const logo = profile?.logo || '';
    if (!logo) return res.status(404).json({ error: 'No logo set' });

    // Legacy inline data remains readable, but is never accepted by the
    // profile write endpoint. It is not a network fetch and therefore cannot
    // be abused as SSRF.
    if (logo.startsWith('data:')) return res.status(200).json({ dataUrl: logo });

    if (!isAllowedStorageReference(logo, 'logos')) {
      log.warn('[logo-proxy] rejected non-storage logo reference');
      return res.status(400).json({ error: 'Invalid logo storage reference' });
    }
    const target = logo.includes('://') ? logo : storageUrlForKey(logo);
    if (!target) return res.status(502).json({ error: 'Logo storage is not publicly configured' });

    const upstream = await fetch(target, { redirect: 'error' });
    if (!upstream.ok) {
      log.warn(`[logo-proxy] Upstream fetch failed: ${upstream.status} for ${logo}`);
      return res.status(502).json({ error: 'Could not fetch logo from storage' });
    }

    let buffer: Buffer;
    try { buffer = await readWithLimit(upstream); }
    catch (error: any) {
      if (error?.message === 'Logo too large') return res.status(502).json({ error: 'Logo too large' });
      throw error;
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
