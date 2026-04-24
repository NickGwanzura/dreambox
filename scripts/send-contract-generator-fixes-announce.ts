import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// Snapshot of active users taken via psql (Prisma adapter was dropping the Neon
// connection on cold starts this session — bypassing the ORM for this send).
const RECIPIENTS: { email: string; firstName: string }[] = [
  { email: 'chiduroobc@gmail.com', firstName: 'Brian' },
  { email: 'chiduurobc@gmail.com', firstName: 'Brian' },
  { email: 'admin@dreambox.com', firstName: 'Admin' },
  { email: 'nicholas.gwanzura@outlook.com', firstName: 'Nicholas' },
  { email: 'rufarod@gmail.com', firstName: 'Rufaro' },
  { email: 'panamuze@gmail.com', firstName: 'Panashe' },
  { email: 'chantecharles11@gmail.com', firstName: 'Chante' },
  { email: 'chantecharles6@gmail.com', firstName: 'Chante' },
  { email: 'julietmberitiana@gmail.com', firstName: 'Juliet' },
];

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

function buildHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:12px;">
          Hi ${firstName},
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          Cleanup pass on the contract PDF generator. Two things you&apos;ll notice immediately, plus a quieter fix under the hood.
        </td></tr>

        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px 0;">What changed</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.55;">
                  <strong>&#10003; Contract duration now reads correctly.</strong> A contract from 1 Jan to 31 Dec used to print as &ldquo;13 months&rdquo; because the old math double-counted. A Jan&nbsp;1 &rarr; Feb&nbsp;1 contract printed as 2 months. Fixed &mdash; the duration on the generated PDF now matches the calendar.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.55;">
                  <strong>&#10003; PDFs are fully branded from Company Profile.</strong> The contact strip at the bottom of every page, and the &ldquo;Contact Us&rdquo; band on the Availability Sheet, used to be hardcoded Dreambox strings. They now read from Settings &rarr; Company Profile &mdash; edit once, every PDF picks it up.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.55;">
                  <strong>&#10003; One contract PDF, not two.</strong> The legacy short rental-agreement PDF has been retired. Every PDF button now produces the long-form legal contract built from your editable template &mdash; rate paragraph, indemnity, arbitration, signature blocks, all of it.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.55;">
                  <strong>&#10003; Tidier rate paragraph.</strong> The auto-composed rate block inside the contract now reads as three clean bullet points: monthly rate, one-time charges (only if any), and total contract value. The previous version had a mix of bulleted and flush-left lines.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;">
          <strong style="color:#1e293b;">Nothing to do on your side.</strong> Existing contracts re-generate correctly next time you download. If you want to tweak branding, go to Settings &rarr; Company Profile and the changes propagate to every PDF the system produces.
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Dreambox CRM
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Dreambox Advertising (Pvt) Ltd &middot; 54 Brooke Village, Borrowdale Brooke, Harare<br/>
          +263 778 018 909 &middot; info@dreamboxadvertising.com &middot; crm.dreamboxadvertising.co.zw
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set in .env');

  console.log(`Sending contract-generator-fixes update to ${RECIPIENTS.length} active users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — contract PDFs: duration fix + fully dynamic branding',
        html: buildHtml(user.firstName),
      });
      if (error) {
        console.error(`[FAIL] ${user.email}: ${error.message ?? JSON.stringify(error)}`);
      } else {
        console.log(`[OK] ${user.email}  id=${data?.id}`);
      }
    } catch (err: any) {
      console.error(`[FAIL] ${user.email}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
