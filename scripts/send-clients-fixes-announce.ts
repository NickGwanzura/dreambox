import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// Same hardcoded recipient snapshot used by the previous announce — Prisma adapter
// keeps dropping the application database connection on cold starts during these one-off sends.
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
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Three Fixes</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Client Directory + Contract PDF cleanup.
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, three things shipped today &mdash; the Client Directory search now actually searches, you can re-import client info from CSV to fix the &ldquo;Imported Contact&rdquo; placeholders, and the signature block on the contract PDF no longer overlaps the page footer.
        </td></tr>

        <!-- 1. CLIENT DIRECTORY SEARCH -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">1 &middot; Client Directory Search</p>
              <p style="font-size:17px;font-weight:700;color:#1e1b4b;margin:0 0 16px 0;">The search box is wired up. Finally.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                <strong>Where:</strong> sidebar &rarr; <strong>Clients</strong>. The search input next to the New Client button.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  Type to filter by <strong>company name, contact person, email, or phone</strong> &mdash; the grid filters in real-time.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  A small <strong>&times;</strong> appears inside the box to clear the query, and you get a count above the grid (&ldquo;3 of 47 clients match &hellip;&rdquo;).
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  Empty state has a one-click <strong>Clear Search</strong> link if you over-filter.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- 2. CSV RE-IMPORT -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:12px;border:1px solid #a7f3d0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">2 &middot; Fix Client Info via CSV</p>
              <p style="font-size:17px;font-weight:700;color:#064e3b;margin:0 0 16px 0;">Re-import to replace &ldquo;Imported Contact&rdquo; placeholders.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                Many clients were auto-created when billboards were imported, with <code style="background:#fff;color:#059669;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">Imported Contact</code> as the contact person and blank email/phone. You can now fix all of them in one upload.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 1.</strong> Sidebar &rarr; <strong>Clients</strong> &rarr; click <strong>Template</strong> in the header. Downloads a CSV of every existing client with the columns <em>Company Name, Contact Person, Email, Phone, Billing Day, Status</em>.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 2.</strong> Open the CSV, fill in the real Contact Person, Email, and Phone for the rows that need fixing. Save it.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 3.</strong> Click <strong>Import</strong>, pick your edited CSV. The system matches by company name (case-insensitive), <strong>updates only the fields you filled in</strong> (blanks are ignored, never overwrite good data with empty), and <strong>creates new clients</strong> for rows it doesn&apos;t recognize.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  A summary modal shows <strong>Updated / Created / Skipped</strong> counts so you know exactly what happened.
                </td></tr>
              </table>
              <p style="font-size:11px;color:#059669;margin-top:12px;line-height:1.5;">
                Tip: leave any cell blank to keep the existing value. Only set the cells you want changed.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- 3. SIGNATURE FOOTER FIX -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">3 &middot; Contract PDF Signature Block</p>
              <p style="font-size:17px;font-weight:700;color:#78350f;margin:0 0 16px 0;">Signature lines no longer overlap the page footer.</p>

              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0 0 12px 0;">
                On longer contracts, the &ldquo;Signature / Name / Designation / Date&rdquo; lines used to crash into the contact strip at the bottom of the page and into each other.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  Signature blocks are now rendered as a proper <strong>two-column panel</strong> &mdash; Company on the left, Advertiser on the right &mdash; with breathing room between rows.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  The whole signature section is treated as one unit: if it can&apos;t fit above the page footer, it moves to a fresh page automatically.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  Underscore placeholders (<code style="background:#fff;color:#78350f;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:11px;">________</code>) are replaced with a thin drawn line that stops cleanly at the column edge.
                </td></tr>
              </table>
              <p style="font-size:11px;color:#b45309;margin-top:12px;line-height:1.5;">
                Re-generate any contract PDF you&apos;ve already shared to see the cleaner signature page.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding-bottom:32px;">
          <a href="${APP_URL}"
            style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
            Open Dreambox CRM
          </a>
        </td></tr>

        <tr><td style="color:#94a3b8;font-size:11px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
          Reply to this email if anything in the new flow misbehaves.<br/><br/>
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

  console.log(`Sending clients-fixes update to ${RECIPIENTS.length} active users...\n`);

  for (const user of RECIPIENTS) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — client search, CSV re-import + cleaner contract signatures',
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
