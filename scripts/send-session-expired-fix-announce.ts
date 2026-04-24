import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = 'Dreambox CRM <noreply@crm.dreamboxadvertising.co.zw>';
const APP_URL = 'https://crm.dreamboxadvertising.co.zw';

const RECIPIENTS: { email: string; firstName: string }[] = [
  { email: 'nicholas.gwanzura@outlook.com', firstName: 'Nick' },
  { email: 'rufarod@gmail.com', firstName: 'Rufaro' },
];

function buildHtml(firstName: string): string {
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
          Quick fix to the login flow. A few newly invited users were hitting <strong style="color:#1e293b;">&ldquo;Session expired. Please sign in again.&rdquo;</strong> the very first time they tried to sign in &mdash; which was confusing because they&apos;d never had a session in the first place. Root cause found and fixed.
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What Was Wrong</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  The API client was treating <strong>every</strong> 401 response as an expired session &mdash; even on the sign-in request itself. So a mistyped password on first attempt came back as &ldquo;Session expired&rdquo; instead of &ldquo;Invalid email or password&rdquo;.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  A stale token left in the browser could also false-positive as expired because of a JWT base64 decoding quirk, bouncing users off the app before the server even saw the request.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What&apos;s Fixed</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Real error messages on sign-in</strong> &mdash; wrong password now says &ldquo;Invalid email or password&rdquo; with attempts remaining, as it should.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; &ldquo;Session expired&rdquo; only shows when a real session actually expired</strong> &mdash; not on first-time sign-in attempts.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Pending-approval users get the right message</strong> &mdash; &ldquo;Account awaiting administrator approval&rdquo; instead of a misleading expiry notice.
                </td></tr>
                <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Stale tokens no longer false-trigger</strong> &mdash; the local expiry check now correctly reads JWT payloads, and defers to the server when it can&apos;t decode one.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
          <strong style="color:#1e293b;">Action for you:</strong> nothing. This is already live. If Charles (or any other new user) pings you about being kicked out, send them a fresh reset link from Settings &rarr; Users, or reply to this email and I&apos;ll push one through.
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

  console.log(`Sending session-expired-fix update to ${RECIPIENTS.length} users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — fixed: new users seeing “Session expired” on first sign-in',
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
