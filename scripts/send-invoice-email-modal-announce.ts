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
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td align="center" style="padding-bottom:4px;">
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">New</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Editable email when sending invoices.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, the &ldquo;Send&rdquo; button on invoices, quotations, receipts, and contracts now opens a proper editor &mdash; you can change the subject, rewrite the message, and add more recipients before it goes out. The PDF still attaches automatically.
        </td></tr>

        <!-- WHAT'S NEW -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">What changed</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px 0;">Click Email &rarr; review &rarr; send.</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>To:</strong> client&apos;s email is pre-filled. You can remove it, replace it, or add several. Press Enter, comma, or semicolon to add another.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>CC:</strong> add colleagues, accounts, or anyone else who should get a copy.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>Subject:</strong> editable. Defaults to <em>Invoice #&hellip; — $amount | Dreambox Advertising</em>.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  &bull; <strong>Message:</strong> rewrite the intro paragraph however you like. The itemised breakdown, banking details, and PDF attachment are added automatically beneath it.
                </td></tr>
              </table>
              <p style="font-size:11px;color:#6366f1;margin-top:14px;line-height:1.5;">
                Works the same way on Contracts (the &ldquo;Email&rdquo; button on each contract row).
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- SENDER ADDRESS -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Sender address</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 12px 0;">Now from info@dreamboxadvertising.com</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 8px 0;">
                Outgoing invoices and contracts now come from <strong>info@dreamboxadvertising.com</strong> instead of the old <em>noreply@crm</em> address. Replies from clients land directly in the company inbox.
              </p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 0 0;">
                Internal CRM emails (password resets, account verification, system announcements) still come from the CRM noreply address &mdash; that&apos;s unchanged.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- ACTION REQUIRED -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Heads up &mdash; Action required</p>
              <p style="font-size:17px;font-weight:700;color:#7f1d1d;margin:0 0 12px 0;">Resend domain must be configured.</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 10px 0;">
                Our email provider (<strong>Resend</strong>) only delivers mail from DNS-verified domains. The new sender domain <strong>dreamboxadvertising.com</strong> needs to be added and verified in Resend before invoice sending will actually work.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>1.</strong> Log into the Resend dashboard at <a href="https://resend.com/domains" style="color:#6366f1;text-decoration:underline;">resend.com/domains</a>.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>2.</strong> Add <code style="background:#fff;color:#7f1d1d;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:12px;">dreamboxadvertising.com</code> if it isn&apos;t there.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>3.</strong> Add the DNS records (TXT / MX / DKIM) Resend gives you to your domain&apos;s DNS provider.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>4.</strong> Wait for verification to flip to <strong>Verified</strong>.
                </td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>5.</strong> Test by sending a small invoice or quotation from the CRM and confirming it lands.
                </td></tr>
              </table>
              <p style="font-size:12px;color:#7f1d1d;background:#fee2e2;border-radius:8px;padding:10px 12px;margin:12px 0 0 0;line-height:1.5;">
                Until the domain is verified, the &ldquo;Send&rdquo; button will fail with an error. If you need to send invoices urgently before that&apos;s done, reply to this email and we&apos;ll switch the sender back to the old CRM address temporarily.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open CRM
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email if anything misbehaves or you&apos;d like the sender rolled back.<br/><br/>
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

  console.log(`Sending invoice-email-modal update to ${RECIPIENTS.length} active users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — editable email when sending invoices (Resend domain setup required)',
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
