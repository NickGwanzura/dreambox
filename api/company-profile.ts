import type { HttpRequest, HttpResponse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth, cors } from '../lib/auth';
import { uploadBase64Image, isBase64DataUrl } from '../lib/uploadBase64';
import { log } from '../lib/serverLogger.js';

// partnerLogos/campaignGallery are stored as JSON strings of [{ src, ... }].
// A client bug (or future client) can leak a raw base64 data URL into one of
// these entries; convert any that slip through to R2 so the DB never carries
// megabytes of inline image data, same protection logo/heroImageUrl already get.
async function uploadEmbeddedImages(json: string | undefined, existingJson: string | undefined): Promise<string | undefined> {
  if (!json) return json;
  let items: any[];
  try {
    items = JSON.parse(json);
    if (!Array.isArray(items)) return json;
  } catch {
    return json;
  }
  let existingItems: any[] = [];
  try { existingItems = JSON.parse(existingJson || '[]'); } catch { /* ignore */ }

  let changed = false;
  const uploaded = await Promise.all(items.map(async (item, i) => {
    if (!item || typeof item.src !== 'string' || !isBase64DataUrl(item.src)) return item;
    changed = true;
    const existingSrc = existingItems[i]?.src;
    const url = await uploadBase64Image('gallery', item.src, isBase64DataUrl(existingSrc || '') ? null : existingSrc);
    return { ...item, src: url ?? item.src };
  }));
  return changed ? JSON.stringify(uploaded) : json;
}

// pickCompanyProfileData — whitelist for the CompanyProfile model
function pickCompanyProfileData(body: any) {
  return {
    name:                body.name,
    vatNumber:           body.vatNumber           ?? undefined,
    regNumber:           body.regNumber           ?? undefined,
    email:               body.email               ?? undefined,
    supportEmail:        body.supportEmail        ?? undefined,
    phone:               body.phone               ?? undefined,
    website:             body.website             ?? undefined,
    address:             body.address             ?? undefined,
    city:                body.city                ?? undefined,
    country:             body.country             ?? undefined,
    logo:                body.logo                ?? undefined,
    bankName:            body.bankName            ?? undefined,
    bankAccountName:     body.bankAccountName     ?? undefined,
    bankAccountNumber:   body.bankAccountNumber   ?? undefined,
    bankBranch:          body.bankBranch          ?? undefined,
    bankSwift:           body.bankSwift           ?? undefined,
    paymentTerms:        body.paymentTerms        ?? undefined,
    senderEmail:         body.senderEmail         ?? undefined,
    senderName:          body.senderName          ?? undefined,
    emailSignature:      body.emailSignature      ?? undefined,
    contractTemplate:    body.contractTemplate    ?? undefined,
    vatRate:             body.vatRate != null     ? Number(body.vatRate) : undefined,
    heroImageUrl:        body.heroImageUrl        ?? undefined,
    partnerLogos:        body.partnerLogos        ?? undefined,
    campaignGallery:     body.campaignGallery     ?? undefined,
  };
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const payload = await requireAuth(req, res);
      if (!payload) return;
      const row = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
      return res.status(200).json(row ?? {});
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const payload = await requireAuth(req, res);
      if (!payload) return;
      const raw = req.body ?? {};
      const data = pickCompanyProfileData(raw);
      const existing = await prisma.companyProfile.findUnique({ where: { id: 'profile_v1' } });
      const logo = await uploadBase64Image('logos', data.logo, existing?.logo);
      const heroImageUrl = await uploadBase64Image('logos', data.heroImageUrl, (existing as any)?.heroImageUrl ?? null);
      const partnerLogos = await uploadEmbeddedImages(data.partnerLogos, (existing as any)?.partnerLogos);
      const campaignGallery = await uploadEmbeddedImages(data.campaignGallery, (existing as any)?.campaignGallery);
      const uploads = {
        ...(logo !== undefined && { logo }),
        ...(heroImageUrl !== undefined && { heroImageUrl }),
        ...(partnerLogos !== undefined && { partnerLogos }),
        ...(campaignGallery !== undefined && { campaignGallery }),
      };
      const row = await prisma.companyProfile.upsert({
        where: { id: 'profile_v1' },
        update: { ...data, ...uploads },
        create: { id: 'profile_v1', name: data.name ?? '', ...data, ...uploads },
      });
      return res.status(200).json(row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    log.error('[company-profile]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
