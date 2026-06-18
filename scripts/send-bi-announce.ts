import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

function buildHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6366f1;">Dreambox Advertising</p>
            <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;line-height:1.2;">June 2026 Platform Update</h1>
            <p style="margin:10px 0 0;font-size:13px;color:#94a3b8;">Business Intelligence Module &amp; Critical Fixes</p>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="background:#ffffff;padding:32px 40px 0;">
            <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">Hi ${firstName},</p>
            <p style="margin:14px 0 0;font-size:14px;color:#475569;line-height:1.7;">
              We have just shipped a major update to the Dreambox CRM. The headline feature is a new
              <strong style="color:#0f172a;">Business Intelligence module</strong> available from your sidebar,
              alongside two important bug fixes that affected image saves and invoice updates.
            </p>
          </td>
        </tr>

        <tr><td style="background:#ffffff;padding:20px 40px 0;"><hr style="border:none;border-top:1px solid #f1f5f9;margin:0;"></td></tr>

        <!-- BI Module -->
        <tr>
          <td style="background:#ffffff;padding:24px 40px 0;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;">New Feature</p>
            <h2 style="margin:0 0 6px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:-0.02em;">&#128202; Business Intelligence</h2>
            <p style="margin:0 0 20px;font-size:13px;color:#64748b;line-height:1.6;">
              A forward-looking intelligence layer sitting on top of your live data. Find it in the sidebar under
              <em>Business Intelligence</em> (Admin and Manager roles).
            </p>

            <!-- 5 tabs -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

              <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <td style="padding:14px 18px;width:110px;vertical-align:top;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.07em;">Overview</p>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #e2e8f0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                    MRR, portfolio occupancy, and pending collections at a glance. Four auto-generated action cards flag overdue invoices, cold quotes, vacant boards, and at-risk client accounts. A live 60-day contract expiry watch list sits below.
                  </p>
                </td>
              </tr>

              <tr style="background:#ffffff;border-bottom:1px solid #e2e8f0;">
                <td style="padding:14px 18px;width:110px;vertical-align:top;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.07em;">Forecast</p>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #e2e8f0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                    4-month revenue projection built from active contract monthly rates (guaranteed) plus 30%-weighted pipeline value from open quotes and proformas. A separate table shows exactly which contracts are expiring in the next 30 days and how much monthly revenue is at risk.
                  </p>
                </td>
              </tr>

              <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <td style="padding:14px 18px;width:110px;vertical-align:top;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.07em;">Assets</p>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #e2e8f0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                    Every billboard in the portfolio with its current occupancy percentage, number of active contracts, and monthly revenue. Top-earning boards shown as a ranked bar chart. Vacant boards are flagged for immediate action.
                  </p>
                </td>
              </tr>

              <tr style="background:#ffffff;border-bottom:1px solid #e2e8f0;">
                <td style="padding:14px 18px;width:110px;vertical-align:top;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.07em;">Clients</p>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #e2e8f0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                    Client Lifetime Value ranking showing total paid, pending balances, active contracts, and days until next expiry. Accounts where a contract is expiring within 60 days and no active quote exists are highlighted in red as <em>at-risk</em>.
                  </p>
                </td>
              </tr>

              <tr style="background:#f8fafc;">
                <td style="padding:14px 18px;width:110px;vertical-align:top;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.07em;">Sales Funnel</p>
                </td>
                <td style="padding:14px 18px;border-left:1px solid #e2e8f0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.55;">
                    Quote &#8594; Invoice &#8594; Paid conversion rates with stage-by-stage drop-off analysis. A full <strong>Cold Quotes Report</strong> lists every quote with no activity for more than 14 days, sorted oldest-first, showing client, reference, type, status, days cold, expiry countdown, items quoted, and value. Total value at stake shown in the footer.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <tr><td style="background:#ffffff;padding:24px 40px 0;"><hr style="border:none;border-top:1px solid #f1f5f9;margin:0;"></td></tr>

        <!-- Bug fixes -->
        <tr>
          <td style="background:#ffffff;padding:24px 40px 0;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#10b981;">Bug Fixes</p>
            <h2 style="margin:0 0 16px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:-0.02em;">&#128295; What We Fixed</h2>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
              <tr>
                <td style="background:#f0fdf4;border-left:3px solid #10b981;border-radius:0 8px 8px 0;padding:14px 16px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:0.08em;">Billboard Images Now Persist</p>
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.55;">
                    Uploading a billboard photo and saving it appeared to work, but the image would disappear after a page refresh.
                    The server was correctly storing the image in cloud storage and returning the permanent URL, but the CRM was
                    discarding that response and keeping the temporary local copy. This is now fixed &mdash; images are permanent
                    the moment you save, and they appear correctly on the public website.
                  </p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f0fdf4;border-left:3px solid #10b981;border-radius:0 8px 8px 0;padding:14px 16px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:0.08em;">VAT Invoices No Longer Fail on Update</p>
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.55;">
                    Any invoice that included VAT was silently failing whenever the system tried to update it &mdash; including the
                    automatic overdue-status update that runs each time the CRM loads. The server validation was comparing the invoice
                    total against the line-item sum without accounting for VAT, so every VAT invoice appeared to have a mismatched
                    total. This is resolved; all invoice updates now validate and save correctly.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#ffffff;padding:32px 40px;text-align:center;">
            <p style="margin:0 0 20px;font-size:14px;color:#64748b;">Log in and explore Business Intelligence from the sidebar.</p>
            <a href="${APP_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:14px 36px;border-radius:10px;">
              Open Dreambox CRM
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f1f5f9;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">Dreambox Advertising &mdash; Harare, Zimbabwe</p>
            <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
              Built and maintained by <a href="https://spiritus.co.zw" style="color:#6366f1;text-decoration:none;">Spiritus Systems</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { email: true, firstName: true },
  });

  console.log(`Sending BI announcement to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'New: Business Intelligence Module + Fixes — Dreambox CRM',
        html: buildHtml(user.firstName),
      });
      console.log(`[OK]   ${user.email}`);
    } catch (err: any) {
      console.error(`[FAIL] ${user.email}: ${err.message}`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
