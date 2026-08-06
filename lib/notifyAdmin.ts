import { Resend } from 'resend';
import { log } from './serverLogger.js';

export const SYSTEM_ADMIN_EMAIL = 'rufarod@gmail.com';
export const SYSTEM_ADMIN_NAME = 'Rufaro';

const FROM = 'Dreambox CRM <noreply@dreamboxadvertising.co.zw>';
const APP_URL = process.env.APP_URL || 'https://dreamboxadvertising.co.zw';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NewUserAlert {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: 'Pending' | 'Active' | string;
  source: 'public-signup' | 'admin-create' | 'bulk-invite';
  invitedBy?: string;
}

export function notifyAdminNewUser(user: NewUserAlert): void {
  const subject =
    user.status === 'Pending'
      ? `Approval needed: ${user.firstName} ${user.lastName} signed up`
      : `New user added: ${user.firstName} ${user.lastName}`;

  resend.emails
    .send({
      from: FROM,
      to: SYSTEM_ADMIN_EMAIL,
      subject,
      html: buildNewUserAlertEmail(user),
    })
    .catch(err => log.error(`[notifyAdmin] email failed for ${user.email}: ${err?.message ?? err}`));
}

function buildNewUserAlertEmail(user: NewUserAlert): string {
  const needsApproval = user.status === 'Pending';
  const sourceLabel =
    user.source === 'public-signup'
      ? 'Self-service signup'
      : user.source === 'bulk-invite'
      ? 'Admin bulk invite'
      : 'Admin invite';
  const ctaLabel = needsApproval ? 'Review & Approve' : 'Open User Management';
  const ctaUrl = `${APP_URL}/settings/users`;
  const invitedByRow = user.invitedBy
    ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Invited by:</strong> ${user.invitedBy}</td></tr>`
    : '';
  const banner = needsApproval
    ? `<tr><td style="background:#fef3c7;color:#78350f;font-size:13px;line-height:1.5;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
         ⚠ This account is <strong>pending your approval</strong>. The user cannot sign in until you activate it.
       </td></tr>`
    : `<tr><td style="background:#ecfdf5;color:#065f46;font-size:13px;line-height:1.5;padding:12px 16px;border-radius:8px;">
         ✓ This account is <strong>active</strong>. Reply to this email if it was created in error.
       </td></tr>`;

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
            <tr><td align="center" style="padding-bottom:24px;">
              <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
              <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
            </td></tr>
            <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">
              Hi ${SYSTEM_ADMIN_NAME},
            </td></tr>
            <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
              A new user has just been added to Dreambox CRM. As system administrator you have oversight of all new accounts.
            </td></tr>
            ${banner}
            <tr><td style="padding:20px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:20px;">
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Name:</strong> ${user.firstName} ${user.lastName}</td></tr>
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Email:</strong> ${user.email}</td></tr>
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Role:</strong> ${user.role}</td></tr>
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Status:</strong> ${user.status}</td></tr>
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Source:</strong> ${sourceLabel}</td></tr>
                ${invitedByRow}
              </table>
            </td></tr>
            <tr><td align="center" style="padding:16px 0 24px 0;">
              <a href="${ctaUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                ${ctaLabel}
              </a>
            </td></tr>
            <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
              You're receiving this because you're the system administrator for Dreambox CRM.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

export interface WebsiteLeadAlert {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  locationInterest?: string;
  billboardType?: string;
  campaignDuration?: string;
  estimatedValue?: number;
  message?: string;
  opportunityId?: string;
}

export function notifyAdminWebsiteLead(lead: WebsiteLeadAlert): void {
  const subject = `New website enquiry from ${lead.name}${lead.company ? ` (${lead.company})` : ''}`;
  resend.emails
    .send({
      from: FROM,
      to: SYSTEM_ADMIN_EMAIL,
      subject,
      html: buildWebsiteLeadEmail(lead),
    })
    .catch(err => log.error(`[notifyAdmin] website lead email failed for ${lead.email}: ${err?.message ?? err}`));
}

function buildWebsiteLeadEmail(lead: WebsiteLeadAlert): string {
  const crmUrl = lead.opportunityId ? `${APP_URL}/crm?opportunity=${lead.opportunityId}` : `${APP_URL}/crm`;
  const money = (value?: number) => (value ? `$${Math.round(value).toLocaleString()}` : '—');

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#ffffff;font-family:sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 0;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px;">
            <tr><td align="center" style="padding-bottom:24px;">
              <span style="font-size:24px;font-weight:700;color:#1e293b;">Dreambox</span>
              <span style="font-size:24px;font-weight:300;color:#6366f1;"> CRM</span>
            </td></tr>
            <tr><td style="color:#1e293b;font-size:16px;line-height:1.6;padding-bottom:16px;">
              Hi ${SYSTEM_ADMIN_NAME},
            </td></tr>
            <tr><td style="color:#64748b;font-size:14px;line-height:1.6;padding-bottom:20px;">
              A new enquiry has been submitted on the Dreambox website and added to the CRM.
            </td></tr>
            <tr><td style="background:#ecfdf5;color:#065f46;font-size:13px;line-height:1.5;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
              ✓ <strong>Lead source:</strong> Website
            </td></tr>
            <tr><td style="padding:20px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:20px;">
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Name:</strong> ${lead.name}</td></tr>
                <tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Email:</strong> ${lead.email}</td></tr>
                ${lead.phone ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Phone:</strong> ${lead.phone}</td></tr>` : ''}
                ${lead.company ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Company:</strong> ${lead.company}</td></tr>` : ''}
                ${lead.locationInterest ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Location interest:</strong> ${lead.locationInterest}</td></tr>` : ''}
                ${lead.billboardType ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Media type:</strong> ${lead.billboardType}</td></tr>` : ''}
                ${lead.campaignDuration ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Duration:</strong> ${lead.campaignDuration}</td></tr>` : ''}
                ${lead.estimatedValue ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Estimated value:</strong> ${money(lead.estimatedValue)}</td></tr>` : ''}
                ${lead.message ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;"><strong style="color:#1e293b;">Message:</strong> ${lead.message.replace(/\n/g, '<br>')}</td></tr>` : ''}
              </table>
            </td></tr>
            <tr><td align="center" style="padding:16px 0 24px 0;">
              <a href="${crmUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">
                View in CRM
              </a>
            </td></tr>
            <tr><td style="color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:24px;">
              You're receiving this because you're the system administrator for Dreambox CRM.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

export function isSystemAdmin(email: string | null | undefined): boolean {
  return email?.trim()?.toLowerCase() === SYSTEM_ADMIN_EMAIL;
}
