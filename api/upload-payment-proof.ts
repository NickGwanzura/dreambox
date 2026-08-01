import type { HttpRequest, HttpResponse } from '../lib/http';
import { z } from 'zod';
import { requireFeatureWrite, cors } from '../lib/auth';
import { uploadFile } from '../lib/storage';
import { log } from '../lib/serverLogger.js';

const DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 7 * 1024 * 1024;
const requestSchema = z.object({
  dataUrl: z.string().max(10_000_000),
  originalName: z.string().trim().min(1).max(255),
});

function validSignature(buffer: Buffer, mime: string): boolean {
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const payload = await requireFeatureWrite(req, res, 'invoices');
  if (!payload) return;

  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'A valid proof-of-payment file is required.' });
  const match = parsed.data.dataUrl.match(DATA_URL_RE);
  if (!match || !ALLOWED.has(match[1])) {
    return res.status(400).json({ error: 'Proof must be a PDF, JPEG, PNG, or WebP file.' });
  }

  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) return res.status(400).json({ error: 'Proof file must be 7 MB or smaller.' });
    if (!validSignature(buffer, match[1])) return res.status(400).json({ error: 'The uploaded file content does not match its declared type.' });
    const uploaded = await uploadFile('payment-proofs', { buffer, originalName: parsed.data.originalName, mimetype: match[1] });
    log.info(`[payment-proof] Uploaded by ${payload.email} key=${uploaded.key}`);
    return res.status(201).json({ url: uploaded.url, originalName: parsed.data.originalName, mimeType: match[1], uploadedAt: new Date().toISOString() });
  } catch (e: any) {
    log.error('[payment-proof]', e);
    return res.status(500).json({ error: e?.message || 'Proof upload failed' });
  }
}
