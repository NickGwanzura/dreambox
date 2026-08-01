import type { HttpRequest, HttpResponse } from '../lib/http';
import { cors, requireFeatureRead } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { getStoredFile, storageKeyFromUrl } from '../lib/storage';
import { log } from '../lib/serverLogger';
import type { Readable } from 'node:stream';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const payload = await requireFeatureRead(req, res, 'invoices');
  if (!payload) return;

  const receiptId = typeof req.query.receiptId === 'string' ? req.query.receiptId : '';
  if (!receiptId) return res.status(400).json({ error: 'Receipt id is required' });

  try {
    const receipt = await prisma.invoice.findFirst({
      where: { id: receiptId, type: 'Receipt' },
      select: { id: true, proofPaymentUrl: true, proofOriginalName: true, proofMimeType: true },
    });
    if (!receipt?.proofPaymentUrl) return res.status(404).json({ error: 'Proof of payment not found' });

    const key = storageKeyFromUrl(receipt.proofPaymentUrl, 'payment-proofs');
    const object = await getStoredFile(key);
    if (!object.Body) return res.status(404).json({ error: 'Proof of payment file is empty' });
    const fileName = (receipt.proofOriginalName || `${receipt.id}-proof`).replace(/[^a-zA-Z0-9._-]/g, '_');

    await prisma.auditLog.create({
      data: {
        action: 'PAYMENT_PROOF_ACCESSED',
        details: `Proof of payment accessed for receipt ${receipt.id}`,
        userId: payload.userId,
        userEmail: payload.email,
        tableName: 'invoices',
        recordId: receipt.id,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    res.setHeader('Content-Type', receipt.proofMimeType || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    (object.Body as Readable).on('error', error => {
      log.error('[payment-proof] Stream failed', { receiptId, error: error.message });
      if (!res.headersSent) res.status(500).json({ error: 'Could not load proof of payment' });
      else res.destroy(error);
    });
    (object.Body as Readable).pipe(res);
  } catch (error: any) {
    log.error('[payment-proof]', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Could not load proof of payment' });
  }
}
