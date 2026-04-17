/**
 * Supabase → Neon migration script
 * Run with: npx tsx scripts/migrate-from-supabase.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env before running this migration.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Supabase fetch helper ───────────────────────────────────────────────────

async function fetchTable<T = Record<string, unknown>>(table: string): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  [WARN] ${table}: HTTP ${res.status} — ${text.slice(0, 120)}`);
    return [];
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    console.warn(`  [WARN] ${table}: unexpected response shape`, JSON.stringify(data).slice(0, 120));
    return [];
  }
  return data as T[];
}

// ─── Value normalizers ───────────────────────────────────────────────────────

function normalizeRole(role: string | null | undefined): string {
  if (!role) return 'Staff';
  if (role === 'Sales Agent') return 'SalesAgent';
  return role;
}

function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'Active';
  return status;
}

function normalizeTaskStatus(status: string | null | undefined): string {
  if (!status) return 'Todo';
  if (status === 'In Progress') return 'InProgress';
  return status;
}

function normalizeUserStatus(status: string | null | undefined): string {
  if (!status) return 'Pending';
  return status;
}

// ─── Migration functions ─────────────────────────────────────────────────────

async function migrateUsers(tempPassword: string): Promise<number> {
  console.log('\n[users]');
  const rows = await fetchTable('users');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const passwordHash = await bcrypt.hash(tempPassword, 12);

  let count = 0;
  for (const row of rows as any[]) {
    try {
      await prisma.user.upsert({
        where: { email: row.email },
        update: {},
        create: {
          id: row.id,
          firstName: row.firstName ?? row.first_name ?? 'User',
          lastName: row.lastName ?? row.last_name ?? '',
          email: row.email,
          username: row.username ?? null,
          passwordHash,
          role: normalizeRole(row.role) as any,
          status: normalizeUserStatus(row.status) as any,
          mustResetPassword: true,
          createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
        },
      });
      count++;
    } catch (e: any) {
      console.warn(`  [WARN] user ${row.email}: ${e.message}`);
    }
  }
  console.log(`  inserted/skipped ${count}/${rows.length}`);
  return count;
}

async function migrateBillboards(): Promise<number> {
  console.log('\n[billboards]');
  const rows = await fetchTable('billboards');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => {
    // coordinates may be stored as JSON {lat, lng} or flat fields
    let lat: number | null = null;
    let lng: number | null = null;
    if (r.coordinates && typeof r.coordinates === 'object') {
      lat = r.coordinates.lat ?? null;
      lng = r.coordinates.lng ?? null;
    } else {
      lat = r.coordinatesLat ?? r.coordinates_lat ?? null;
      lng = r.coordinatesLng ?? r.coordinates_lng ?? null;
    }

    return {
      id: r.id,
      name: r.name,
      location: r.location,
      town: r.town ?? '',
      type: r.type ?? 'Static',
      width: r.width ?? 0,
      height: r.height ?? 0,
      imageUrl: r.imageUrl ?? r.image_url ?? null,
      coordinatesLat: lat,
      coordinatesLng: lng,
      visibility: r.visibility ?? null,
      dailyTraffic: r.dailyTraffic ?? r.daily_traffic ?? null,
      sideARate: r.sideARate ?? r.side_a_rate ?? null,
      sideBRate: r.sideBRate ?? r.side_b_rate ?? null,
      sideAStatus: r.sideAStatus ?? r.side_a_status ?? null,
      sideBStatus: r.sideBStatus ?? r.side_b_status ?? null,
      sideAClientId: r.sideAClientId ?? r.side_a_client_id ?? null,
      sideBClientId: r.sideBClientId ?? r.side_b_client_id ?? null,
      ratePerSlot: r.ratePerSlot ?? r.rate_per_slot ?? null,
      totalSlots: r.totalSlots ?? r.total_slots ?? null,
      rentedSlots: r.rentedSlots ?? r.rented_slots ?? null,
      lastMaintenanceDate: r.lastMaintenanceDate ?? r.last_maintenance_date ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    };
  });

  const result = await prisma.billboard.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateClients(): Promise<number> {
  console.log('\n[clients]');
  const rows = await fetchTable('clients');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    companyName: r.companyName ?? r.company_name ?? '',
    contactPerson: r.contactPerson ?? r.contact_person ?? '',
    email: r.email ?? '',
    phone: r.phone ?? '',
    status: normalizeStatus(r.status) as any,
    billingDay: r.billingDay ?? r.billing_day ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.client.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateContracts(): Promise<number> {
  console.log('\n[contracts]');
  const rows = await fetchTable('contracts');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    clientId: r.clientId ?? r.client_id,
    billboardId: r.billboardId ?? r.billboard_id,
    startDate: r.startDate ?? r.start_date ?? '',
    endDate: r.endDate ?? r.end_date ?? '',
    monthlyRate: r.monthlyRate ?? r.monthly_rate ?? 0,
    installationCost: r.installationCost ?? r.installation_cost ?? 0,
    printingCost: r.printingCost ?? r.printing_cost ?? 0,
    hasVat: r.hasVat ?? r.has_vat ?? false,
    totalContractValue: r.totalContractValue ?? r.total_contract_value ?? 0,
    status: normalizeStatus(r.status) as any,
    details: r.details ?? '',
    slotNumber: r.slotNumber ?? r.slot_number ?? null,
    side: r.side ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
    lastModifiedDate: r.lastModifiedDate ?? r.last_modified_date ?? null,
    lastModifiedBy: r.lastModifiedBy ?? r.last_modified_by ?? null,
    assignedTo: r.assignedTo ?? r.assigned_to ?? null,
    dbCreatedAt: r.dbCreatedAt ? new Date(r.dbCreatedAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.contract.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateInvoices(): Promise<number> {
  console.log('\n[invoices]');
  const rows = await fetchTable('invoices');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    contractId: r.contractId ?? r.contract_id ?? null,
    clientId: r.clientId ?? r.client_id,
    date: r.date ?? '',
    items: r.items ?? [],
    subtotal: r.subtotal ?? 0,
    discountAmount: r.discountAmount ?? r.discount_amount ?? null,
    discountDescription: r.discountDescription ?? r.discount_description ?? null,
    vatAmount: r.vatAmount ?? r.vat_amount ?? 0,
    total: r.total ?? 0,
    status: normalizeStatus(r.status) as any,
    type: (r.type === 'Quote' ? 'Quotation' : r.type) ?? 'Invoice',
    paymentMethod: r.paymentMethod ?? r.payment_method ?? null,
    paymentReference: r.paymentReference ?? r.payment_reference ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.invoice.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateExpenses(): Promise<number> {
  console.log('\n[expenses]');
  const rows = await fetchTable('expenses');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    category: r.category ?? 'Other',
    description: r.description ?? '',
    amount: r.amount ?? 0,
    date: r.date ?? '',
    reference: r.reference ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.expense.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateTasks(): Promise<number> {
  console.log('\n[tasks]');
  const rows = await fetchTable('tasks');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    title: r.title ?? '',
    description: r.description ?? '',
    assignedTo: r.assignedTo ?? r.assigned_to ?? '',
    priority: r.priority ?? 'Medium',
    status: normalizeTaskStatus(r.status) as any,
    dueDate: r.dueDate ?? r.due_date ?? '',
    createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
    relatedBillboardId: r.relatedBillboardId ?? r.related_billboard_id ?? null,
    dbCreatedAt: r.dbCreatedAt ? new Date(r.dbCreatedAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.task.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateMaintenanceLogs(): Promise<number> {
  console.log('\n[maintenance_logs]');
  const rows = await fetchTable('maintenance_logs');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    billboardId: r.billboardId ?? r.billboard_id,
    date: r.date ?? '',
    type: r.type ?? 'Routine',
    description: r.description ?? '',
    cost: r.cost ?? 0,
    performedBy: r.performedBy ?? r.performed_by ?? '',
    nextDueDate: r.nextDueDate ?? r.next_due_date ?? '',
    notes: r.notes ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.maintenanceLog.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateOutsourcedBillboards(): Promise<number> {
  console.log('\n[outsourced_billboards]');
  const rows = await fetchTable('outsourced_billboards');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    billboardId: r.billboardId ?? r.billboard_id,
    billboardName: r.billboardName ?? r.billboard_name ?? null,
    mediaOwner: r.mediaOwner ?? r.media_owner ?? '',
    ownerContact: r.ownerContact ?? r.owner_contact ?? '',
    monthlyPayout: r.monthlyPayout ?? r.monthly_payout ?? 0,
    contractStart: r.contractStart ?? r.contract_start ?? '',
    contractEnd: r.contractEnd ?? r.contract_end ?? '',
    status: normalizeStatus(r.status) as any,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.outsourcedBillboard.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migratePrintingJobs(): Promise<number> {
  console.log('\n[printing_jobs]');
  const rows = await fetchTable('printing_jobs');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    clientId: r.clientId ?? r.client_id,
    billboardId: r.billboardId ?? r.billboard_id ?? null,
    date: r.date ?? '',
    description: r.description ?? '',
    dimensions: r.dimensions ?? '',
    pvcCost: r.pvcCost ?? r.pvc_cost ?? 0,
    inkCost: r.inkCost ?? r.ink_cost ?? 0,
    electricityCost: r.electricityCost ?? r.electricity_cost ?? 0,
    operatorCost: r.operatorCost ?? r.operator_cost ?? 0,
    weldingCost: r.weldingCost ?? r.welding_cost ?? 0,
    totalCost: r.totalCost ?? r.total_cost ?? 0,
    chargedAmount: r.chargedAmount ?? r.charged_amount ?? 0,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.printingJob.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCompanyProfile(): Promise<number> {
  console.log('\n[company_profile]');
  const rows = await fetchTable('company_profile');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const r = (rows as any[])[0];
  try {
    await prisma.companyProfile.upsert({
      where: { id: 'profile_v1' },
      update: {
        name: r.name ?? 'Dreambox Advertising',
        vatNumber: r.vatNumber ?? r.vat_number ?? null,
        regNumber: r.regNumber ?? r.reg_number ?? null,
        email: r.email ?? null,
        supportEmail: r.supportEmail ?? r.support_email ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        address: r.address ?? null,
        city: r.city ?? null,
        country: r.country ?? null,
        logo: r.logo ?? null,
      },
      create: {
        id: 'profile_v1',
        name: r.name ?? 'Dreambox Advertising',
        vatNumber: r.vatNumber ?? r.vat_number ?? null,
        regNumber: r.regNumber ?? r.reg_number ?? null,
        email: r.email ?? null,
        supportEmail: r.supportEmail ?? r.support_email ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        address: r.address ?? null,
        city: r.city ?? null,
        country: r.country ?? null,
        logo: r.logo ?? null,
      },
    });
    console.log(`  upserted 1/1`);
    return 1;
  } catch (e: any) {
    console.warn(`  [WARN] company_profile: ${e.message}`);
    return 0;
  }
}

// ─── CRM tables ──────────────────────────────────────────────────────────────

async function migrateCRMCompanies(): Promise<number> {
  console.log('\n[crm_companies]');
  const rows = await fetchTable('crm_companies');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    name: r.name ?? '',
    industry: r.industry ?? null,
    website: r.website ?? null,
    streetAddress: r.streetAddress ?? r.street_address ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.cRMCompany.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMContacts(): Promise<number> {
  console.log('\n[crm_contacts]');
  const rows = await fetchTable('crm_contacts');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    companyId: r.companyId ?? r.company_id,
    fullName: r.fullName ?? r.full_name ?? '',
    jobTitle: r.jobTitle ?? r.job_title ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    linkedinUrl: r.linkedinUrl ?? r.linkedin_url ?? null,
    isPrimary: r.isPrimary ?? r.is_primary ?? false,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.cRMContact.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMOpportunities(): Promise<number> {
  console.log('\n[crm_opportunities]');
  const rows = await fetchTable('crm_opportunities');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    companyId: r.companyId ?? r.company_id,
    primaryContactId: r.primaryContactId ?? r.primary_contact_id,
    secondaryContactId: r.secondaryContactId ?? r.secondary_contact_id ?? null,
    locationInterest: r.locationInterest ?? r.location_interest ?? null,
    billboardType: r.billboardType ?? r.billboard_type ?? null,
    campaignDuration: r.campaignDuration ?? r.campaign_duration ?? null,
    estimatedValue: r.estimatedValue ?? r.estimated_value ?? null,
    actualValue: r.actualValue ?? r.actual_value ?? null,
    status: r.status ?? 'Active',
    stage: r.stage ?? 'Prospect',
    leadSource: r.leadSource ?? r.lead_source ?? null,
    lastContactDate: r.lastContactDate ?? r.last_contact_date ?? null,
    nextFollowUpDate: r.nextFollowUpDate ?? r.next_follow_up_date ?? null,
    callOutcomeNotes: r.callOutcomeNotes ?? r.call_outcome_notes ?? null,
    numberOfAttempts: r.numberOfAttempts ?? r.number_of_attempts ?? 0,
    assignedTo: r.assignedTo ?? r.assigned_to ?? null,
    createdBy: r.createdBy ?? r.created_by ?? '',
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    closedAt: r.closedAt ?? r.closed_at ?? null,
    closedReason: r.closedReason ?? r.closed_reason ?? null,
    daysInCurrentStage: r.daysInCurrentStage ?? r.days_in_current_stage ?? 0,
    stageHistory: r.stageHistory ?? r.stage_history ?? [],
  }));

  const result = await prisma.cRMOpportunity.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMTouchpoints(): Promise<number> {
  console.log('\n[crm_touchpoints]');
  const rows = await fetchTable('crm_touchpoints');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    opportunityId: r.opportunityId ?? r.opportunity_id,
    type: r.type ?? '',
    direction: r.direction ?? '',
    subject: r.subject ?? null,
    content: r.content ?? null,
    clientResponse: r.clientResponse ?? r.client_response ?? null,
    outcome: r.outcome ?? null,
    sentiment: r.sentiment ?? null,
    durationSeconds: r.durationSeconds ?? r.duration_seconds ?? null,
    createdBy: r.createdBy ?? r.created_by ?? '',
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  }));

  const result = await prisma.cRMTouchpoint.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMTasks(): Promise<number> {
  console.log('\n[crm_tasks]');
  const rows = await fetchTable('crm_tasks');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    opportunityId: r.opportunityId ?? r.opportunity_id,
    type: r.type ?? '',
    title: r.title ?? '',
    description: r.description ?? null,
    dueDate: r.dueDate ?? r.due_date ?? '',
    status: r.status ?? 'Todo',
    priority: r.priority ?? 'Medium',
    assignedTo: r.assignedTo ?? r.assigned_to ?? '',
    completedBy: r.completedBy ?? r.completed_by ?? null,
    completedAt: r.completedAt ?? r.completed_at ?? null,
    completionNotes: r.completionNotes ?? r.completion_notes ?? null,
    createdBy: r.createdBy ?? r.created_by ?? '',
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.cRMTask.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMEmailThreads(): Promise<number> {
  console.log('\n[crm_email_threads]');
  const rows = await fetchTable('crm_email_threads');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    opportunityId: r.opportunityId ?? r.opportunity_id,
    contactId: r.contactId ?? r.contact_id,
    subject: r.subject ?? '',
    messages: r.messages ?? [],
    status: r.status ?? 'open',
    lastActivityAt: r.lastActivityAt ?? r.last_activity_at ?? new Date().toISOString(),
    sentCount: r.sentCount ?? r.sent_count ?? 0,
    openCount: r.openCount ?? r.open_count ?? 0,
    clickCount: r.clickCount ?? r.click_count ?? 0,
    replyCount: r.replyCount ?? r.reply_count ?? 0,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  }));

  const result = await prisma.cRMEmailThread.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

async function migrateCRMCallLogs(): Promise<number> {
  console.log('\n[crm_call_logs]');
  const rows = await fetchTable('crm_call_logs');
  console.log(`  fetched ${rows.length} rows`);
  if (!rows.length) return 0;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    opportunityId: r.opportunityId ?? r.opportunity_id,
    contactId: r.contactId ?? r.contact_id,
    phoneNumber: r.phoneNumber ?? r.phone_number ?? '',
    direction: r.direction ?? '',
    startedAt: r.startedAt ?? r.started_at ?? '',
    endedAt: r.endedAt ?? r.ended_at ?? null,
    durationSeconds: r.durationSeconds ?? r.duration_seconds ?? 0,
    outcome: r.outcome ?? '',
    notes: r.notes ?? null,
    recordingUrl: r.recordingUrl ?? r.recording_url ?? null,
    createdBy: r.createdBy ?? r.created_by ?? '',
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  }));

  const result = await prisma.cRMCallLog.createMany({ data, skipDuplicates: true });
  console.log(`  inserted ${result.count}/${rows.length}`);
  return result.count;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Dreambox: Supabase → Neon Migration');
  console.log('='.repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set. Ensure .env is present.');
    process.exit(1);
  }

  // Generate a temp password for all migrated users
  const tempPassword = crypto.randomBytes(8).toString('hex'); // e.g. "a3f2b9c1"

  const totals: Record<string, number> = {};

  // Core tables — order matters for FK-free tables first
  totals.users = await migrateUsers(tempPassword);
  totals.billboards = await migrateBillboards();
  totals.clients = await migrateClients();
  totals.contracts = await migrateContracts();
  totals.invoices = await migrateInvoices();
  totals.expenses = await migrateExpenses();
  totals.tasks = await migrateTasks();
  totals.maintenance_logs = await migrateMaintenanceLogs();
  totals.outsourced_billboards = await migrateOutsourcedBillboards();
  totals.printing_jobs = await migratePrintingJobs();
  totals.company_profile = await migrateCompanyProfile();

  // CRM tables (depend on crm_companies / crm_contacts)
  totals.crm_companies = await migrateCRMCompanies();
  totals.crm_contacts = await migrateCRMContacts();
  totals.crm_opportunities = await migrateCRMOpportunities();
  totals.crm_touchpoints = await migrateCRMTouchpoints();
  totals.crm_tasks = await migrateCRMTasks();
  totals.crm_email_threads = await migrateCRMEmailThreads();
  totals.crm_call_logs = await migrateCRMCallLogs();

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete. Summary:');
  console.log('='.repeat(60));
  for (const [table, count] of Object.entries(totals)) {
    console.log(`  ${table.padEnd(28)} ${count}`);
  }

  if (totals.users > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('IMPORTANT — Temporary password for all migrated users:');
    console.log(`  ${tempPassword}`);
    console.log('All users have mustResetPassword=true.');
    console.log('Share this password with users so they can log in and set a new one.');
    console.log('='.repeat(60));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('\nFATAL:', e);
  process.exit(1);
});
