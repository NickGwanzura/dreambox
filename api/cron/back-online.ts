/**
 * Cron endpoint: POST /api/cron/back-online
 * Sends a "Back Online" notification email to all active users.
 *
 * Triggered by the internal scheduler in server.ts at the MAINTENANCE_UNTIL end time (env-driven maintenance window).
 * Secured by CRON_SECRET header.
 */
import type { HttpRequest, HttpResponse } from '../../lib/http';
import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { cors } from '../../lib/auth';
import { log } from '../../lib/serverLogger.js';

const resend = new Resend(process.env.RESEND_API_KEY);
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  if (!cronSecret) {
    log.error('[cron/back-online] CRON_SECRET env var is not set');
    return res.status(503).json({ error: 'Cron endpoint not configured' });
  }
  if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  try {
    // Fetch all active users
    const users = await prisma.user.findMany({
      where: { status: 'Active' },
      select: { firstName: true, email: true },
    });

    if (users.length === 0) {
      log.info('[cron/back-online] No active users to notify');
      return res.status(200).json({ sent: 0, users: 0 });
    }

    const companyProfile = await prisma.companyProfile.findUnique({
      where: { id: 'profile_v1' },
      select: { senderName: true, senderEmail: true, name: true, phone: true, email: true },
    });

    const senderName = companyProfile?.senderName || 'Dreambox Advertising';
    const fromEmail = companyProfile?.senderEmail || 'info@dreamboxadvertising.com';
    const companyName = companyProfile?.name || 'Dreambox Advertising';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
          <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;text-align:center">
                  <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.3px">We’re Back Online</h1>
                  <p style="margin:8px 0 0;font-size:15px;color:#c4b5fd;line-height:1.5">Dreambox Advertising CRM</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:32px 40px">
                  <p style="margin:0 0 16px;font-size:15px;color:#1e293b;line-height:1.6">Hi ${companyName === 'Dreambox Advertising' ? 'team' : ''},</p>
                  <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">
                    The scheduled maintenance is complete and the Dreambox CRM platform is fully operational again.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;padding:20px;margin:0 0 20px">
                    <tr>
                      <td style="font-size:14px;color:#475569;padding-bottom:8px">What’s available now:</td>
                    </tr>
                    <tr><td style="padding:3px 0;font-size:14px;color:#1e293b">✅ Create and manage invoices &amp; quotations</td></tr>
                    <tr><td style="padding:3px 0;font-size:14px;color:#1e293b">✅ Access all contracts, billboards &amp; clients</td></tr>
                    <tr><td style="padding:3px 0;font-size:14px;color:#1e293b">✅ CRM, analytics &amp; reporting</td></tr>
                    <tr><td style="padding:3px 0;font-size:14px;color:#1e293b">✅ PDF generation &amp; document emailing</td></tr>
                  </table>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 0">
                        <a href="${process.env.APP_URL || 'https://dreamboxadvertising.co.zw'}/login"
                           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px">
                          Open Dreambox CRM
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:24px 0 0;font-size:14px;color:#94a3b8;line-height:1.5">
                    If you have any questions, contact us at <a href="mailto:info@dreamboxadvertising.com" style="color:#4f46e5;text-decoration:none">info@dreamboxadvertising.com</a> or call <strong>+263 778 018 909</strong>.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                  <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
                    Dreambox Advertising &mdash; Harare, Zimbabwe<br>
                    This is an automated system notification.
                  </p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `;

    // Send individual emails (Resend supports bulk, but sending individually
    // prevents one bad address from blocking the whole batch)
    let sent = 0;
    const errors: string[] = [];
    for (const user of users) {
      try {
        await resend.emails.send({
          from: `${senderName} <${fromEmail}>`,
          to: user.email,
          subject: 'Dreambox CRM — Back Online',
          html: html.replace('Hi team,', `Hi ${user.firstName},`),
        });
        sent++;
      } catch (e: any) {
        errors.push(`${user.email}: ${e?.message?.slice(0, 80) || 'unknown'}`);
      }
    }

    log.info(`[cron/back-online] Sent ${sent}/${users.length} emails` + (errors.length ? `, errors: ${errors.join('; ')}` : ''));

    return res.status(200).json({
      sent,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    log.error('[cron/back-online] Failed:', { message: e.message });
    return res.status(500).json({ error: e.message });
  }
}
