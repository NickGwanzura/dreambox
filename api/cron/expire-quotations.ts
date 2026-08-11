/**
 * Cron endpoint: POST /api/cron/expire-quotations
 *
 * Marks quotations whose validity period (expiryDate) has passed as Expired.
 * Only non-terminal quotes (Draft/Sent) are touched — Rejected, Converted and
 * Accepted quotes are left alone (an accepted quote is a live negotiation even
 * if its nominal expiry date passed).
 *
 * Secured by the CRON_SECRET header, mirroring api/cron/backup.ts.
 *
 * Triggers:
 *  - Internal scheduler (server.ts setInterval, daily)
 *  - External cron service (hosting platform cron, cron-job.org, etc.)
 */
import type { HttpRequest, HttpResponse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { cors } from '../../lib/auth.js';
import { log } from '../../lib/serverLogger.js';
import { claimCronJob, completeCronJob, failCronJob } from '../../lib/cronJobs.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Cron work must never be exposed when its credential is absent.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  if (!cronSecret) {
    log.error('[cron/expire-quotations] CRON_SECRET env var is not set — refusing request');
    return res.status(503).json({ error: 'Cron endpoint not configured' });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let claimedKeys: string[] = [];
  try {
    // Strict-past UTC date: a quote expiring "today" stays valid all day, and the
    // daily cadence means this never flags a quote early regardless of client TZ.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const candidates = await prisma.invoice.findMany({
      where: {
        type: 'Quotation',
        isVoided: false,
        quoteStatus: { in: ['Draft', 'Sent'] },
        expiryDate: { not: null, lt: today },
      },
      select: { id: true, quoteNumber: true, expiryDate: true },
    });

    if (candidates.length === 0) {
      return res.status(200).json({ expired: 0 });
    }

    const claimed = [];
    for (const candidate of candidates) {
      const key = `expire-quotation:${candidate.id}:${today}`;
      if (await claimCronJob(key)) {
        claimed.push(candidate);
        claimedKeys.push(key);
      }
    }
    if (claimed.length === 0) return res.status(200).json({ expired: 0, skipped: candidates.length });

    // Atomic: status flip + audit trail + timeline rows share one transaction so
    // a partial failure can never leave quotes Expired without a record.
    await prisma.$transaction(async tx => {
      const ids = claimed.map(c => c.id);
      await tx.invoice.updateMany({
        where: { id: { in: ids }, quoteStatus: { in: ['Draft', 'Sent'] }, isVoided: false },
        data: { quoteStatus: 'Expired' },
      });
      for (const c of claimed) {
        await tx.auditLog.create({
          data: {
            action: 'Quotation Auto-Expired',
            details: `Quotation ${c.quoteNumber || c.id} auto-expired by cron (validity ended ${c.expiryDate})`,
            userId: null,
            userEmail: 'cron',
            tableName: 'invoices',
            recordId: c.id,
            source: 'CRON',
          },
        });
        await tx.quotationEvent.create({
          data: {
            invoiceId: c.id,
            type: 'expired',
            actorEmail: 'cron',
            details: `Auto-expired on ${today} — validity period passed`,
          },
        });
      }
    });

    await Promise.all(claimed.map(c => completeCronJob(`expire-quotation:${c.id}:${today}`, { id: c.id })));
    log.info(`[cron/expire-quotations] Expired ${claimed.length} quotation(s)`);
    return res.status(200).json({ expired: claimed.length, skipped: candidates.length - claimed.length });
  } catch (e: any) {
    // Claims are lease-based and can be retried after a failure.
    await Promise.all(claimedKeys.map(key => failCronJob(key, e)));
    log.error('[cron/expire-quotations]', e);
    return res.status(500).json({ error: e.message || 'Failed to expire quotations' });
  }
}
