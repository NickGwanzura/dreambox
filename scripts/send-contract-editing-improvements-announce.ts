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
          <span style="display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">Update</span>
        </td></tr>

        <tr><td align="center" style="color:#1e293b;font-size:22px;font-weight:800;padding:12px 0 8px 0;">
          Contract Editing, Simplified
        </td></tr>

        <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:24px;" align="center">
          Hi ${firstName}, the contract editing experience just got a major upgrade. We&apos;ve rebuilt the contract adjustment modal from the ground up with clearer labels, better text contrast, and a more intuitive layout. Here&apos;s what&apos;s new and how to use it.
        </td></tr>

        <!-- WHAT'S NEW -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">What&apos;s New: Improved Edit Modal</p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Darker, clearer labels.</strong> All form labels and section headers are now easier to read (changed from light grey to darker slate).
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Consistent input text color.</strong> All input fields now have explicit dark text, preventing any greyed-out appearance.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Better helper text contrast.</strong> Hint text and descriptions are now more readable with improved color contrast.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>&#10003; Smoother visual hierarchy.</strong> Section headers, labels, inputs, and helper text each have distinct, appropriate weights and colors.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- HOW TO USE -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">How to Edit a Contract</p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 1.</strong> Go to <strong>Contracts</strong> (or <strong>Rentals</strong>) and find the contract you want to modify.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 2.</strong> Click the <strong>&ldquo;Adjust Term&rdquo;</strong> button (calendar icon) on the contract card, or open the contract and click <strong>&ldquo;Adjust Term&rdquo;</strong> at the bottom of the detail panel.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 3.</strong> The edit modal opens with all contract fields clearly visible:
                  <ul style="margin:8px 0 0 20px;padding:0;">
                    <li>Billboard assignment (change billboard if needed)</li>
                    <li>Contract status (Active / Pending / Expired)</li>
                    <li>Rental period (start & end dates with quick-add buttons)</li>
                    <li>Financials (monthly rate, installation, printing, production fees, VAT)</li>
                  </ul>
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 4.</strong> Make your changes. The <strong>&ldquo;Updated term length&rdquo;</strong> indicator shows the new duration in months as you adjust dates.
                </td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  <strong>Step 5.</strong> Click <strong>&ldquo;Save Changes&rdquo;</strong>. All conflict checks still apply — you cannot double-book a billboard side or slot.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- QUICK ACTIONS -->
        <tr><td style="padding-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:12px;border:1px solid #fde68a;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Quick Date Actions</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                The <strong>+1 Month</strong>, <strong>+3 Months</strong>, and <strong>+12 Months</strong> buttons let you extend contracts in one click. <strong>End Today</strong> closes a contract early. The term length recalculates instantly.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- NOTE -->
        <tr><td style="padding-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;padding:24px;">
            <tr><td>
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Important</p>
              <p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">
                Contract value recalculates automatically when dates change. The new total reflects the adjusted duration at the existing monthly rate plus any one-time fees (installation, printing, production). The contract history log still records every change.
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
          Reply to this email with any questions. The updated contract editor is live on crm.dreamboxadvertising.co.zw.<br/><br/>
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

  console.log(`Sending contract editing update to ${users.length} active users...\n`);

  for (const user of users) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Dreambox CRM — Contract editing improved: clearer labels, better contrast, easier to use',
        html: buildHtml(user.firstName || 'there'),
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
