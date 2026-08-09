import type {
  Contract,
  CRMCompany,
  CRMContact,
  CRMOpportunity,
  CRMTask,
  CRMTouchpoint,
  Invoice,
  Task,
} from '../types';
import {
  getContracts,
  getInvoices,
  getTasks,
  subscribe as subscribeOperationsStore,
} from './mockData';
import {
  getCRMCompanies,
  getCRMContacts,
  getCRMOpportunities,
  getCRMTasks,
  getCRMTouchpoints,
  subscribe as subscribeCRMStore,
} from './crmService';
import {
  assessQuietLead,
  type QuietLeadAssessment,
  type QuietLeadScorer,
} from './crmAutomation';

/** Contracts ending within this many UTC calendar days are surfaced for action. */
export const CONTRACT_ATTENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PaymentReviewSummary {
  id: string;
  receiptId: string;
  status: string;
  assignedTo?: string | null;
  createdAt: string;
  receipt?: {
    id: string;
    clientId?: string | null;
    date?: string | null;
    total?: number | null;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    approvalStatus?: string | null;
  };
}

export interface TodayOperationsRecords {
  contracts: Contract[];
  invoices: Invoice[];
  tasks: Task[];
  crmCompanies: CRMCompany[];
  crmContacts: CRMContact[];
  crmOpportunities: CRMOpportunity[];
  crmTasks: CRMTask[];
  crmTouchpoints: CRMTouchpoint[];
  paymentReviews?: PaymentReviewSummary[];
}

export type DueState = 'overdue' | 'today';

export interface TodayInvoice extends Invoice {
  daysOverdue: number;
}

export interface ContractAttention {
  contract: Contract;
  reason: string;
  daysUntilEnd: number;
}

export interface TodayTask<T extends Task | CRMTask> {
  task: T;
  dueState: DueState;
  daysOverdue: number;
}

export interface TodayOperationsSnapshot {
  generatedAt: string;
  overdueInvoices: TodayInvoice[];
  contractsNeedingAttention: ContractAttention[];
  activeContracts: Contract[];
  overdueGeneralTasks: TodayTask<Task>[];
  dueGeneralTasks: TodayTask<Task>[];
  overdueCRMTasks: TodayTask<CRMTask>[];
  dueCRMTasks: TodayTask<CRMTask>[];
  paymentReviews: PaymentReviewSummary[];
  quietLeads: QuietLeadAssessment[];
  counts: {
    overdueInvoices: number;
    contractsNeedingAttention: number;
    activeContracts: number;
    overdueTasks: number;
    dueTodayTasks: number;
    paymentReviews: number;
    quietLeads: number;
  };
}

function validDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function utcDayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dateKey(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return validDate(value)?.toISOString()?.slice(0, 10);
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function dayDifference(value: unknown, now: Date): number | undefined {
  const date = validDate(value);
  if (!date || Number.isNaN(now.getTime())) return undefined;
  return Math.floor((utcDayStart(date) - utcDayStart(now)) / DAY_MS);
}

function dueState(dueDate: string, now: Date): DueState | undefined {
  const due = dateKey(dueDate);
  const today = dateKey(now);
  if (!due || !today) return undefined;
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return undefined;
}

function bySoonestDue<T extends Task | CRMTask>(left: TodayTask<T>, right: TodayTask<T>): number {
  return left.task.dueDate.localeCompare(right.task.dueDate) || left.task.id.localeCompare(right.task.id);
}

function collectTaskAttention<T extends Task | CRMTask>(
  tasks: T[],
  now: Date,
  isActive: (task: T) => boolean,
): { overdue: TodayTask<T>[]; dueToday: TodayTask<T>[] } {
  const overdue: TodayTask<T>[] = [];
  const dueToday: TodayTask<T>[] = [];

  for (const task of tasks) {
    if (!isActive(task)) continue;
    const state = dueState(task.dueDate, now);
    if (!state) continue;
    const difference = dayDifference(task.dueDate, now) || 0;
    const item: TodayTask<T> = {
      task,
      dueState: state,
      daysOverdue: state === 'overdue' ? Math.abs(difference) : 0,
    };
    if (state === 'overdue') overdue.push(item);
    else dueToday.push(item);
  }

  return { overdue: overdue.sort(bySoonestDue), dueToday: dueToday.sort(bySoonestDue) };
}

/**
 * Pure Today aggregation. It receives every record and `now` explicitly, so
 * callers can safely render, hydrate, and test it without changing data.
 */
export function buildTodayOperations(
  records: TodayOperationsRecords,
  now: Date,
  scorer?: QuietLeadScorer,
): TodayOperationsSnapshot {
  const today = dateKey(now) || '';

  const overdueInvoices = records.invoices
    .filter(invoice => {
      const isInvoice = normalize(invoice.type) === 'invoice';
      const isOpen = normalize(invoice.status) === 'pending' || normalize(invoice.status) === 'overdue';
      const due = dateKey(invoice.dueDate);
      return isInvoice && !invoice.isVoided && isOpen
        && (normalize(invoice.status) === 'overdue' || Boolean(due && due < today));
    })
    .map(invoice => ({
      ...invoice,
      daysOverdue: Math.max(0, -(dayDifference(invoice.dueDate, now) || 0)),
    }))
    .sort((left, right) => right.daysOverdue - left.daysOverdue || left.id.localeCompare(right.id));

  const contractsNeedingAttention: ContractAttention[] = [];
  const activeContracts: Contract[] = [];
  for (const contract of records.contracts) {
    const status = normalize(contract.status);
    const start = dayDifference(contract.startDate, now);
    const ends = dayDifference(contract.endDate, now);
    if (status === 'active' && start != null && ends != null && start <= 0 && ends >= 0) {
      activeContracts.push(contract);
    }
    if (ends == null) continue;

    if (status !== 'expired' && ends < 0) {
      contractsNeedingAttention.push({
        contract,
        daysUntilEnd: ends,
        reason: `Contract ended ${Math.abs(ends)} day${Math.abs(ends) === 1 ? '' : 's'} ago.`,
      });
    } else if (ends <= CONTRACT_ATTENTION_DAYS && ends >= 0) {
      contractsNeedingAttention.push({
        contract,
        daysUntilEnd: ends,
        reason: ends === 0
          ? 'Contract ends today.'
          : `Contract ends in ${ends} day${ends === 1 ? '' : 's'}.`,
      });
    } else if (status === 'pending' && start != null && start <= 0) {
      contractsNeedingAttention.push({
        contract,
        daysUntilEnd: ends,
        reason: start === 0 ? 'Pending contract starts today.' : 'Pending contract start date has passed.',
      });
    }
  }
  contractsNeedingAttention.sort((left, right) => left.daysUntilEnd - right.daysUntilEnd || left.contract.id.localeCompare(right.contract.id));
  activeContracts.sort((left, right) => left.endDate.localeCompare(right.endDate) || left.id.localeCompare(right.id));

  const generalTasks = collectTaskAttention(
    records.tasks,
    now,
    task => normalize(task.status) !== 'done',
  );
  const crmTasks = collectTaskAttention(
    records.crmTasks,
    now,
    task => !['completed', 'cancelled'].includes(normalize(task.status)),
  );

  const companies = new Map(records.crmCompanies.map(company => [company.id, company]));
  const contacts = new Map(records.crmContacts.map(contact => [contact.id, contact]));
  const touchpointsByOpportunity = new Map<string, CRMTouchpoint[]>();
  for (const touchpoint of records.crmTouchpoints) {
    const list = touchpointsByOpportunity.get(touchpoint.opportunityId) || [];
    list.push(touchpoint);
    touchpointsByOpportunity.set(touchpoint.opportunityId, list);
  }

  const quietLeads = records.crmOpportunities
    .map(opportunity => assessQuietLead({
      opportunity,
      company: companies.get(opportunity.companyId),
      primaryContact: contacts.get(opportunity.primaryContactId),
      touchpoints: touchpointsByOpportunity.get(opportunity.id) || [],
    }, now, scorer))
    .filter(assessment => assessment.eligible)
    .sort((left, right) => (
      right.score - left.score
      || Number(right.opportunity.estimatedValue || 0) - Number(left.opportunity.estimatedValue || 0)
      || right.daysQuiet - left.daysQuiet
      || left.opportunity.id.localeCompare(right.opportunity.id)
    ));

  const paymentReviews = [...(records.paymentReviews || [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));

  return {
    generatedAt: now.toISOString(),
    overdueInvoices,
    contractsNeedingAttention,
    activeContracts,
    overdueGeneralTasks: generalTasks.overdue,
    dueGeneralTasks: generalTasks.dueToday,
    overdueCRMTasks: crmTasks.overdue,
    dueCRMTasks: crmTasks.dueToday,
    paymentReviews,
    quietLeads,
    counts: {
      overdueInvoices: overdueInvoices.length,
      contractsNeedingAttention: contractsNeedingAttention.length,
      activeContracts: activeContracts.length,
      overdueTasks: generalTasks.overdue.length + crmTasks.overdue.length,
      dueTodayTasks: generalTasks.dueToday.length + crmTasks.dueToday.length,
      paymentReviews: paymentReviews.length,
      quietLeads: quietLeads.length,
    },
  };
}

/** Convenience wrapper for the UI; the aggregation above remains read-only. */
export function getTodayOperationsSnapshot(
  now: Date = new Date(),
  paymentReviews: PaymentReviewSummary[] = [],
): TodayOperationsSnapshot {
  return buildTodayOperations({
    contracts: getContracts(),
    invoices: getInvoices(),
    tasks: getTasks(),
    crmCompanies: getCRMCompanies(),
    crmContacts: getCRMContacts(),
    crmOpportunities: getCRMOpportunities(),
    crmTasks: getCRMTasks(),
    crmTouchpoints: getCRMTouchpoints(),
    paymentReviews,
  }, now);
}

/** Subscribe to both local stores without performing a sync or any mutation. */
export function subscribeToTodayOperations(listener: () => void): () => void {
  const unsubscribeOperations = subscribeOperationsStore(listener);
  const unsubscribeCRM = subscribeCRMStore(listener);
  return () => {
    unsubscribeOperations();
    unsubscribeCRM();
  };
}
