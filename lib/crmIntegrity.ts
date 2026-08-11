import { prisma } from './prisma.js';

export async function assertCRMOpportunity(opportunityId: unknown): Promise<{ id: string; companyId: string }> {
  const id = String(opportunityId || '').trim();
  if (!id) throw new Error('Opportunity ID is required');
  const opportunity = await prisma.cRMOpportunity.findUnique({ where: { id }, select: { id: true, companyId: true } });
  if (!opportunity) throw new Error('Opportunity not found');
  return opportunity;
}

export async function assertCRMActivityParents(opportunityId: unknown, contactId?: unknown): Promise<void> {
  const opportunity = await assertCRMOpportunity(opportunityId);
  if (contactId == null || String(contactId).trim() === '') return;
  const contact = await prisma.cRMContact.findUnique({ where: { id: String(contactId) }, select: { id: true, companyId: true } });
  if (!contact) throw new Error('Contact not found');
  if (contact.companyId !== opportunity.companyId) {
    throw new Error('Contact must belong to the opportunity company');
  }
}

export function isIntegrityError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '');
  return /not found|must belong|ID is required|referenced/i.test(message);
}
