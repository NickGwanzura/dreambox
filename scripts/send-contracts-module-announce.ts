import 'dotenv/config';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY!);

// Snapshot of active users taken via psql (Prisma adapter was dropping the application database
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
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
          <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
        </td></tr>

        <tr><td align="center" style="padding-bottom:4px;">
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Big Update</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          The Contracts Module, rebuilt.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, contracts just got a lot easier. Creating one is now a 3-step guided flow, every contract can produce a full legal PDF, and the legal document itself is now editable by you inside the CRM. Here&apos;s how to use it.
        </td></tr>

        <!-- HOW TO CREATE A CONTRACT -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">1 &middot; Creating a Contract</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px 0;">3-step wizard: Client &rarr; Billboard &rarr; Duration</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                <strong>Where:</strong> sidebar &rarr; <strong>Contracts</strong> &rarr; click <strong>New Rental</strong> (top-right).
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 1 — Client.</strong> Click a client card. Name, contact person, and avatar show up for quick scanning. &ldquo;Next&rdquo; stays locked until one is picked.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 2 — Billboard.</strong> Click a billboard card. You see name, type tag (Static / LED), location, size, and rate hint per side. No date check yet — that&apos;s step 3.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 3 — Duration.</strong> Start/end dates, side-availability checker (Static) or slot picker (LED), monthly rate, install fee, production fee (auto-filled for 7×6 and 12×4 static boards), VAT toggle, and an optional AI pitch draft. Click <strong>Generate Contract &amp; Invoice</strong> and the first month&apos;s invoice is produced in the same go.
                </td></tr>
              </table>
              <p style="font-size:11px;color:#6366f1;margin-top:12px;line-height:1.5;">
                The stepper at the top of the modal shows where you are — green check = done, dark = current, grey = upcoming. You can go back at any step.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- GENERATE LEGAL PDF -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">2 &middot; Generating the Legal Contract PDF</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 16px 0;">One button, full legal document.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                <strong>Where:</strong> open any contract (Contracts page &rarr; click a row) and scroll to the bottom of the detail panel.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Click the indigo &ldquo;Generate Full Legal Contract&rdquo; button.</strong> It produces a multi-page A4 PDF named <code style="background:#fff7ed;color:#78350f;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">Contract_[id]_[client].pdf</code> that you can email, print, or attach.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>What gets filled in automatically:</strong> client name &amp; address, billboard name + size + location, rate paragraph with slot / side / monthly total, start and end dates, contract duration in months, today&apos;s date, and your company details.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Built from your template.</strong> The document uses the text you have saved in the Contract Template page (or the built-in default, for now). Change the template once &rarr; every future legal PDF follows the new wording.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- EDIT TEMPLATE -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:12px;border:1px solid #a7f3d0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">3 &middot; Editing the Contract Template</p>
              <p style="font-size:17px;font-weight:700;color:#064e3b;margin:0 0 16px 0;">Change the legal wording without waiting on a dev.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                <strong>Where:</strong> sidebar &rarr; <strong>Contract Template</strong> (just above Settings &mdash; admin-only).
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>The template is plain text</strong> with tokens like <code style="background:#fff;color:#059669;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">{{advertiser_name}}</code>, <code style="background:#fff;color:#059669;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">{{rate_block}}</code>, <code style="background:#fff;color:#059669;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">{{start_date}}</code>. When you generate a legal PDF, those tokens get replaced with real data.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Full list of tokens</strong> is at the top of the page — 19 placeholders, click any of them to copy to clipboard, paste wherever in the text.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Preview button</strong> splits the screen into editor + live preview so you can see the document take shape as you edit.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Load Default</strong> drops in our Varun-Beverages-style template if you want to start from a known-good baseline. <strong>Clear</strong> wipes your edits and falls back to the built-in default.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Remember to hit Save Template</strong> after edits. The save indicator briefly turns green to confirm.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- QUICK TIPS -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:20px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Quick Tips</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; The wizard <strong>remembers your picks</strong> if you hit Back — no re-selection needed.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; Production fee only shows for static boards — for 7×6 or 12×4 it auto-fills, otherwise it&apos;s blank.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; The AI proposal draft in step 3 is optional — skip it if you don&apos;t need a pitch email.
                </td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#475569;line-height:1.5;">
                  &bull; Contract Template edits are scoped to the whole company — what you save affects every future legal PDF for everyone.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Contracts Module
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email with any questions. The contract template and wizard are both live on crm.dreamboxadvertising.co.zw.<br/><br/>
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
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set in .env');

  const users = await prisma.user.findMany({
    where: { status: 'Active' },
    select: { email: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Sending contracts-module update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Big update: Contracts module rebuilt (wizard + legal PDFs + editable template)',
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
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
