/**
 * Cron endpoint: POST /api/cron/expense-report
 * Sends an expense breakdown email to Brian every 3 days.
 * Secured by a CRON_SECRET header to prevent unauthorized triggers.
 *
 * Can be called by:
 * - Internal scheduler (server.ts setInterval)
 * - External cron service (Railway cron, cron-job.org, etc.)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const CRON_SECRET = process.env.CRON_SECRET || '';
const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const BRIAN_EMAILS = ['chiduroobc@gmail.com', 'chiduurobc@gmail.com'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Authenticate: localhost (internal scheduler) or matching CRON_SECRET
  const secret = req.headers['x-cron-secret'] as string;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).socket?.remoteAddress || '';
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocalhost && (!CRON_SECRET || secret !== CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Fetch expenses from the last 3 days
    const recentExpenses = await prisma.expense.findMany({
      where: { createdAt: { gte: threeDaysAgo } },
      orderBy: { createdAt: 'desc' },
    });

    // Category breakdown
    const byCategory: Record<string, { total: number; count: number; items: typeof recentExpenses }> = {};
    let grandTotal = 0;

    for (const exp of recentExpenses) {
      if (!byCategory[exp.category]) {
        byCategory[exp.category] = { total: 0, count: 0, items: [] };
      }
      byCategory[exp.category].total += exp.amount;
      byCategory[exp.category].count += 1;
      byCategory[exp.category].items.push(exp);
      grandTotal += exp.amount;
    }

    const catColors: Record<string, string> = {
      Maintenance: '#ef4444', Printing: '#f59e0b', Electricity: '#3b82f6',
      Labor: '#8b5cf6', Other: '#64748b',
    };

    const periodLabel = `${threeDaysAgo.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Build category rows
    const categoryRows = Object.entries(byCategory)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([cat, data]) => {
        const color = catColors[cat] || '#64748b';
        const pct = grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0;
        const itemRows = data.items.map(exp =>
          `<tr>
            <td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${exp.description}</td>
            <td style="padding:6px 12px;font-size:12px;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9;">$${exp.amount.toLocaleString()}</td>
            <td style="padding:6px 12px;font-size:11px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">${new Date(exp.date).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}</td>
          </tr>`
        ).join('');

        return `
          <tr>
            <td colspan="3" style="padding:16px 12px 8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};"></span>
                <strong style="color:#1e293b;font-size:14px;">${cat}</strong>
                <span style="color:#94a3b8;font-size:12px;margin-left:auto;">${data.count} item${data.count !== 1 ? 's' : ''} · ${pct}%</span>
                <strong style="color:#1e293b;font-size:14px;">$${data.total.toLocaleString()}</strong>
              </div>
            </td>
          </tr>
          ${itemRows}`;
      }).join('');

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:8px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;">Expense Report</span>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr>
              <td style="text-align:center;">
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Period</div>
                <div style="font-size:14px;color:#1e293b;font-weight:600;">${periodLabel}</div>
              </td>
              <td style="text-align:center;">
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total Expenses</div>
                <div style="font-size:22px;color:#ef4444;font-weight:700;">$${grandTotal.toLocaleString()}</div>
              </td>
              <td style="text-align:center;">
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Items</div>
                <div style="font-size:14px;color:#1e293b;font-weight:600;">${recentExpenses.length}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        ${recentExpenses.length > 0 ? `
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:10px 12px;text-align:left;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Description</th>
                <th style="padding:10px 12px;text-align:right;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Amount</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Date</th>
              </tr>
            </thead>
            <tbody>
              ${categoryRows}
              <tr style="background:#f1f5f9;">
                <td style="padding:12px;font-size:13px;font-weight:700;color:#1e293b;">Total</td>
                <td style="padding:12px;font-size:13px;font-weight:700;color:#ef4444;text-align:right;">$${grandTotal.toLocaleString()}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </td></tr>
        ` : `
        <tr><td style="text-align:center;padding:32px 0;">
          <div style="color:#94a3b8;font-size:14px;">No expenses recorded in the last 3 days.</div>
        </td></tr>
        `}

        <tr><td style="padding-top:24px;border-top:1px solid #e2e8f0;margin-top:24px;">
          <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">
            This is an automated report from Dreambox CRM. Generated ${now.toLocaleString('en-ZW')}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Send to both of Brian's emails
    const results = await Promise.allSettled(
      BRIAN_EMAILS.map(email =>
        resend.emails.send({
          from: FROM,
          to: email,
          subject: `Expense Report: ${periodLabel} — $${grandTotal.toLocaleString()}`,
          html,
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    log.info(`[cron/expense-report] Sent ${sent} emails, ${failed} failed. Total: $${grandTotal}, Items: ${recentExpenses.length}`);

    return res.status(200).json({
      message: `Expense report sent (${sent} emails)`,
      period: periodLabel,
      total: grandTotal,
      items: recentExpenses.length,
      categories: Object.keys(byCategory).length,
    });
  } catch (e: any) {
    log.error(`[cron/expense-report] ${e?.message}`, { stack: e?.stack });
    return res.status(500).json({ error: 'Failed to generate expense report' });
  }
}
