/**
 * Cron endpoint: POST /api/cron/contract-expiry
 * Reminds about active contracts that expire in 14, 7, 3, or 1 days — a
 * milestone-based schedule so each contract triggers at most four emails with
 * no state table. Emails go to the contract's assigned user (if any) and a
 * digest to the system admin.
 *
 * Triggered by the internal scheduler in server.ts once a day.
 * Secured by CRON_SECRET header.
 */
import type { HttpRequest, HttpResponse } from '../../lib/http';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';
import { notifyAdminOpsAlert } from '../../lib/notifyAdmin';
import { log } from '../../lib/serverLogger.js';
import { claimCronJob, completeCronJob, failCronJob } from '../../lib/cronJobs.js';
import { escapeHtml } from '../../lib/htmlEscape.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Dreambox CRM <noreply@dreamboxadvertising.co.zw>';
const APP_URL = process.env.APP_URL || 'https://dreamboxadvertising.co.zw';

const MILESTONES_DAYS = [14, 7, 3, 1];

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  if (!cronSecret) return res.status(503).json({ error: 'Cron endpoint not configured' });
  if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  let claimedKeys: string[] = [];
  try {
    const milestoneDates = MILESTONES_DAYS.map(isoDate);

    const contracts = await prisma.contract.findMany({
      where: { status: 'Active', endDate: { in: milestoneDates } },
      select: {
        id: true, details: true, endDate: true, monthlyRate: true, assignedTo: true,
        clientId: true, billboardId: true,
      },
    });

    if (contracts.length === 0) {
      return res.status(200).json({ checked: milestoneDates, expiring: 0, emailsSent: 0 });
    }

    const claimedContracts = [];
    for (const contract of contracts) {
      const key = `contract-expiry:${contract.id}:${contract.endDate}`;
      if (await claimCronJob(key)) {
        claimedContracts.push(contract);
        claimedKeys.push(key);
      }
    }
    if (claimedContracts.length === 0) return res.status(200).json({ checked: milestoneDates, expiring: 0, emailsSent: 0, skipped: contracts.length });

    // Batch-resolve related names.
    const [clients, billboards, assignedUsers] = await Promise.all([
      prisma.client.findMany({ where: { id: { in: claimedContracts.map(c => c.clientId) } }, select: { id: true, companyName: true } }),
      prisma.billboard.findMany({ where: { id: { in: claimedContracts.map(c => c.billboardId).filter(Boolean) } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: claimedContracts.map(c => c.assignedTo).filter(Boolean) } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    ]);

    const clientName = new Map(clients.map(c => [c.id, c.companyName]));
    const boardName = new Map(billboards.map(b => [b.id, b.name]));
    const userBy = new Map(assignedUsers.map(u => [u.id, u]));

    const rows = claimedContracts.map(c => {
      const days = Math.round((new Date(c.endDate + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000);
      return {
        id: c.id,
        client: clientName.get(c.clientId) || 'Unknown client',
        billboard: c.billboardId ? boardName.get(c.billboardId) || 'Unknown board' : '—',
        details: c.details || '—',
        endDate: c.endDate,
        daysLeft: Math.max(0, days),
        monthlyRate: c.monthlyRate,
        assignedTo: c.assignedTo,
      };
    });

    let emailsSent = 0;

    // Digest to the admin.
    notifyAdminOpsAlert('Contracts expiring soon', [
      {
        title: `${rows.length} active contract(s) expiring in the next 14 days`,
        lines: rows.map(
          r => `• ${r.client} — ${r.billboard} — ends ${r.endDate} (${r.daysLeft}d left) — ${r.details}`,
        ),
      },
    ]);
    emailsSent += 1;

    // Individual reminders to assigned users.
    const byUser = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.assignedTo) continue;
      const list = byUser.get(r.assignedTo) ?? [];
      list.push(r);
      byUser.set(r.assignedTo, list);
    }

    for (const [userId, list] of byUser) {
      const user = userBy.get(userId);
      if (!user?.email) continue;
      const lines = list
        .map(r => `${escapeHtml(r.client)} — ${escapeHtml(r.billboard)} — ends ${escapeHtml(r.endDate)} (${r.daysLeft} day(s) left)`)
        .join('<br>');
      const sent = await resend.emails
        .send({
          from: FROM,
          to: user.email,
          subject: `Dreambox: ${list.length} contract(s) expiring soon`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
              <h2 style="color:#1e293b;">Contract${list.length > 1 ? 's' : ''} expiring soon</h2>
              <p style="color:#475569;line-height:1.6;">Hi ${escapeHtml(user.firstName)}, the following active contract${list.length > 1 ? 's are' : ' is'} approaching its end date — worth a renewal conversation:</p>
              <div style="background:#f8fafc;border-radius:10px;padding:20px;margin:16px 0;">
                <div style="color:#334155;font-size:14px;line-height:1.8;">${lines}</div>
              </div>
              <a href="${APP_URL}/contracts" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">Open Contracts</a>
            </div>`,
        })
        .catch(e => {
          log.error(`[cron/contract-expiry] reminder failed for ${user.email}: ${e?.message}`);
          return null;
        });
      if (sent) emailsSent += 1;
    }

    await Promise.all(claimedKeys.map(key => completeCronJob(key, { emailsSent })));
    log.info(`[cron/contract-expiry] ${rows.length} expiring, ${emailsSent} emails sent`);
    return res.status(200).json({ checked: milestoneDates, expiring: rows.length, emailsSent });
  } catch (e: any) {
    await Promise.all(claimedKeys.map(key => failCronJob(key, e)));
    log.error('[cron/contract-expiry]', e);
    return res.status(500).json({ error: e.message });
  }
}
