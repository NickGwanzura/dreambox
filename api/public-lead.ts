import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { cors } from '../lib/auth';
import { checkRateLimit } from '../lib/rateLimiter.js';
import { notifyAdminWebsiteLead } from '../lib/notifyAdmin';
import { log } from '../lib/serverLogger.js';

const clean = (value: unknown): string =>
  String(value || '').trim().slice(0, 1000);

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).socket?.remoteAddress || 'unknown';
  const rateCheck = await checkRateLimit(`public-lead:ip:${ip}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  }

  try {
    const name = clean(req.body?.name);
    const companyName = clean(req.body?.company) || name || 'Website Enquiry';
    const email = clean(req.body?.email).toLowerCase();
    const phone = clean(req.body?.phone);
    const locationInterest = clean(req.body?.locationInterest) || 'Website enquiry';
    const billboardType = clean(req.body?.billboardType) || 'Outdoor Media';
    const campaignDuration = clean(req.body?.campaignDuration) || 'To be confirmed';
    const message = clean(req.body?.message);
    const estimatedValue = Number(req.body?.estimatedValue || 0) || undefined;
    const honeypot = clean(req.body?.website);

    // Spam honeypot: bots often fill this hidden field
    if (honeypot) {
      return res.status(400).json({ error: 'Invalid submission' });
    }

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    let company = await prisma.cRMCompany.findFirst({
      where: { name: { equals: companyName, mode: 'insensitive' } },
    });

    if (!company) {
      company = await prisma.cRMCompany.create({
        data: {
          name: companyName,
          industry: 'Advertising Prospect',
          website: '',
          streetAddress: '',
          city: '',
          country: 'Zimbabwe',
        },
      });
    }

    let contact = email
      ? await prisma.cRMContact.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        })
      : null;

    if (!contact) {
      contact = await prisma.cRMContact.create({
        data: {
          companyId: company.id,
          fullName: name,
          phone,
          email,
          isPrimary: true,
        },
      });
    }

    const now = new Date().toISOString();
    const followUp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const opportunity = await prisma.cRMOpportunity.create({
      data: {
        companyId: company.id,
        primaryContactId: contact.id,
        locationInterest,
        billboardType,
        campaignDuration,
        estimatedValue,
        status: 'new',
        stage: 'new_lead',
        leadSource: 'Website',
        callOutcomeNotes: message,
        numberOfAttempts: 0,
        nextFollowUpDate: followUp,
        createdBy: 'website',
        daysInCurrentStage: 0,
        stageHistory: [{ stage: 'new_lead', enteredAt: now, daysInStage: 0 }],
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CRM: Website Lead Created',
        details: `New website lead for "${company.name}" — ${locationInterest}`,
        userEmail: 'website',
        tableName: 'crm_opportunities',
        recordId: opportunity.id,
      },
    }).catch(() => undefined);

    notifyAdminWebsiteLead({
      name,
      email,
      phone,
      company: companyName,
      locationInterest,
      billboardType,
      campaignDuration,
      estimatedValue,
      message,
      opportunityId: opportunity.id,
    });

    return res.status(201).json({ company, contact, opportunity });
  } catch (e: any) {
    log.error('[public-lead]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
