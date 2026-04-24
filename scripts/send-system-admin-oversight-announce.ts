import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

const RECIPIENTS: { email: string; firstName: string }[] = [
  { email: 'rufarod@gmail.com', firstName: 'Rufaro' },
  { email: 'nicholas.gwanzura@outlook.com', firstName: 'Nick' },
];

function buildHtml(firstName: string): string {
  const isRufaro = firstName === 'Rufaro';
  const personalNote = isRufaro
    ? `You&apos;re now the <strong style="color:#1e293b;">system administrator</strong> for Dreambox CRM &mdash; meaning every new account that lands in the system shows up in your inbox before it gets near the app.`
    : `Heads up on a governance change. Rufaro is now the formal <strong style="color:#1e293b;">system administrator</strong> with oversight of all new accounts. You (and Brian) still keep your existing admin + delete + settings privileges &mdash; nothing is taken away. This just adds an approval signal on top.`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:12px;">
          Hi ${firstName},
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          ${personalNote}
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What Changed</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Rufaro designated as system admin.</strong> Named explicitly in the code (<code style="background:#eef2ff;color:#4338ca;padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12px;">SYSTEM_ADMIN_EMAIL</code>) so the role is no longer just &ldquo;one of three privileged emails&rdquo; &mdash; it&apos;s the single point of oversight for account governance.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Every new user triggers an email to Rufaro.</strong> Fires on all three creation paths: public self-signup, admin single-create, and admin bulk-invite. Sent fire-and-forget so it never blocks the signup response.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Approval signal is loud.</strong> Self-signups still land as <em>Pending</em> (they can&apos;t sign in until activated), and the notification email carries a yellow &ldquo;needs approval&rdquo; banner plus a button straight to user management.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Admin-created users show up too.</strong> Even when an admin invites someone directly (status = Active), Rufaro still gets the notification &mdash; so nothing slips in silently.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What The Email Contains</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; Name, email, role, status of the new user
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; Source tag: self-signup vs. admin invite vs. bulk invite
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; Who invited them (for admin-created accounts)
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; One-click button to the user management screen
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          <strong style="color:#1e293b;">Action for you:</strong> ${isRufaro
            ? 'watch your inbox. When a Pending signup arrives, open user management from the email and approve or reject. No-one new can reach the app until you act.'
            : 'nothing right now. If Rufaro is out and a Pending approval is blocking someone, you can still approve/reject from the Users screen yourself &mdash; your admin powers are unchanged.'}
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
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set in .env');
  }

  console.log(`Sending system-admin-oversight update to ${RECIPIENTS.length} users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Rufaro is now system admin; new-user emails live',
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

main().catch(e => { console.error(e); process.exit(1); });
