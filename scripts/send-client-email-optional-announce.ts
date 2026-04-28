import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// Snapshot of active users — hardcoded to avoid Neon cold-start drops via Prisma.
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

        <tr><td align="center" style="padding-bottom:4px;">
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Small fix</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Client email is now optional.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, quick fix on the client directory: the <strong>Email Address</strong> field is no longer required when you add or edit a client. Plenty of clients only give a phone number — saving was failing for them. That&apos;s now sorted.
        </td></tr>

        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">What changed</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>Add Client</strong> &mdash; email field can be left blank.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>Edit Client</strong> &mdash; same; existing clients without an email can be saved.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>CSV re-import</strong> &mdash; rows missing email no longer fail validation.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; Company name, contact person, and phone are still required.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:13px;line-height:1.6;padding-bottom:24px;">
          <strong>Where:</strong> sidebar &rarr; <strong>Clients</strong>. Same form, just no red-asterisk on Email anymore. Empty email shows as <em>&mdash;</em> in the client cards and detail view.
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Clients
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email if anything still misbehaves.<br/><br/>
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

  console.log(`Sending client-email-optional update to ${RECIPIENTS.length} active users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — clients: email field is now optional',
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
