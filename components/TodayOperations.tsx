import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  RefreshCw,
  Target,
  Wallet,
} from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { api } from '../services/apiClient';
import {
  getTodayOperationsSnapshot,
  subscribeToTodayOperations,
  type PaymentReviewSummary,
  type TodayTask,
} from '../services/todayOperations';
import {
  QUIET_LEAD_AUTOMATION_ACTION,
  type QuietLeadAssessment,
} from '../services/crmAutomation';
import type { CRMTask, Task } from '../types';

export interface TodayOperationsProps {
  onNavigate?: (page: string) => void;
}

type PaymentReviewState =
  | { kind: 'loading'; reviews: PaymentReviewSummary[]; message?: string }
  | { kind: 'available'; reviews: PaymentReviewSummary[]; message?: string }
  | { kind: 'restricted'; reviews: PaymentReviewSummary[]; message: string }
  | { kind: 'unavailable'; reviews: PaymentReviewSummary[]; message: string };

type AutomationState = {
  kind: 'loading' | 'created' | 'existing' | 'error';
  message: string;
};

const formatMoney = (value: number | null | undefined): string =>
  `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const formatDate = (value: string | undefined | null): string => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const statusLabel = (value: string): string => value.replace(/[_-]/g, ' ');

const touchButtonClass = 'min-h-11 touch-manipulation rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-5 text-slate-600">
    {children}
  </p>
);

const SectionCard: React.FC<{
  title: string;
  description: string;
  count?: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: 'danger' | 'warning' | 'primary' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}> = ({ title, description, count, icon: Icon, tone = 'neutral', actionLabel, onAction, children }) => {
  const toneClasses = {
    danger: 'bg-red-50 text-red-700 ring-red-100',
    warning: 'bg-amber-50 text-amber-700 ring-amber-100',
    primary: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  }[tone];

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby={`today-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses}`} aria-hidden="true">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id={`today-${title.toLowerCase().replace(/\s+/g, '-')}`} className="text-base font-bold text-slate-900">{title}</h2>
            {typeof count === 'number' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">{count}</span>
            )}
          </div>
          <p className="mt-0.5 text-sm leading-5 text-slate-600">{description}</p>
        </div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className={`${touchButtonClass} shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-200`}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
};

const TaskRows: React.FC<{ items: Array<TodayTask<Task | CRMTask>>; source: 'General' | 'CRM' }> = ({ items, source }) => {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label={`${source} tasks`}>
      {items.map(({ task, dueState, daysOverdue }) => (
        <li key={`${source}-${task.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {source} · Due {formatDate(task.dueDate)}
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${dueState === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
              {dueState === 'overdue' ? `${daysOverdue}d overdue` : 'Due today'}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
};

export const TodayOperations: React.FC<TodayOperationsProps> = ({ onNavigate }) => {
  const [refreshNow, setRefreshNow] = useState(() => new Date());
  const currentUser = useMemo(() => getCurrentUser(), []);
  const canReviewPayments = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';
  const [paymentReviewState, setPaymentReviewState] = useState<PaymentReviewState>(() => (
    canReviewPayments
      ? { kind: 'loading', reviews: [] }
      : { kind: 'restricted', reviews: [], message: 'Payment reviews are available to Managers and Admins.' }
  ));
  const [automationByOpportunity, setAutomationByOpportunity] = useState<Record<string, AutomationState>>({});

  const loadPaymentReviews = useCallback(async () => {
    if (!canReviewPayments) {
      setPaymentReviewState({ kind: 'restricted', reviews: [], message: 'Payment reviews are available to Managers and Admins.' });
      return;
    }
    setPaymentReviewState(previous => ({ kind: 'loading', reviews: previous.reviews }));
    try {
      const reviews = await api.get<PaymentReviewSummary[]>('/api/today');
      setPaymentReviewState({ kind: 'available', reviews: Array.isArray(reviews) ? reviews : [] });
    } catch (error: any) {
      const status = Number(error?.status);
      if (status === 403) {
        setPaymentReviewState({ kind: 'restricted', reviews: [], message: 'You do not have permission to view payment reviews.' });
      } else {
        setPaymentReviewState({
          kind: 'unavailable',
          reviews: [],
          message: error?.message || 'Payment-review data is temporarily unavailable.',
        });
      }
    }
  }, [canReviewPayments]);

  useEffect(() => {
    const unsubscribe = subscribeToTodayOperations(() => setRefreshNow(new Date()));
    return unsubscribe;
  }, []);

  useEffect(() => {
    void loadPaymentReviews();
  }, [loadPaymentReviews]);

  const snapshot = useMemo(
    () => getTodayOperationsSnapshot(refreshNow, paymentReviewState.reviews),
    [paymentReviewState.reviews, refreshNow],
  );

  const refreshToday = () => {
    setRefreshNow(new Date());
    void loadPaymentReviews();
  };

  const createQuietLeadFollowUp = async (lead: QuietLeadAssessment) => {
    const opportunityId = lead.opportunity.id;
    setAutomationByOpportunity(previous => ({
      ...previous,
      [opportunityId]: { kind: 'loading', message: 'Creating follow-up…' },
    }));
    try {
      const result = await api.post<{ status: 'created' | 'existing'; created: boolean; task: unknown }>('/api/crm/automation', {
        action: QUIET_LEAD_AUTOMATION_ACTION,
        opportunityId,
      });
      const created = result.status === 'created' || result.created;
      setAutomationByOpportunity(previous => ({
        ...previous,
        [opportunityId]: {
          kind: created ? 'created' : 'existing',
          message: created ? 'Follow-up task created.' : 'A follow-up task already exists for this quiet-lead window.',
        },
      }));
    } catch (error: any) {
      setAutomationByOpportunity(previous => ({
        ...previous,
        [opportunityId]: {
          kind: 'error',
          message: error?.message || 'Could not create the follow-up task. Try again.',
        },
      }));
    }
  };

  const taskItems = [
    ...snapshot.overdueGeneralTasks.map(item => ({ ...item, source: 'General' as const })),
    ...snapshot.overdueCRMTasks.map(item => ({ ...item, source: 'CRM' as const })),
    ...snapshot.dueGeneralTasks.map(item => ({ ...item, source: 'General' as const })),
    ...snapshot.dueCRMTasks.map(item => ({ ...item, source: 'CRM' as const })),
  ];

  return (
    <main className="w-full max-w-7xl overflow-x-hidden pb-8" aria-labelledby="today-title">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-700">Operations command center</p>
          <h1 id="today-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Today</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Prioritized revenue, contracts, work, payment controls, and quiet high-value opportunities.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshToday}
          className={`${touchButtonClass} inline-flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700`}
          aria-label="Refresh Today command center"
        >
          <RefreshCw size={17} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <p className="mb-5 text-xs text-slate-500" aria-live="polite">
        Read-only refresh · Updated {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.generatedAt))}
      </p>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Today summary">
        {[
          { label: 'Overdue invoices', value: snapshot.counts.overdueInvoices, icon: CreditCard, tone: 'text-red-700 bg-red-50' },
          { label: 'Contracts due', value: snapshot.counts.contractsNeedingAttention, icon: FileText, tone: 'text-amber-800 bg-amber-50' },
          { label: 'Active campaigns', value: snapshot.counts.activeContracts, icon: Target, tone: 'text-indigo-700 bg-indigo-50' },
          { label: 'Overdue tasks', value: snapshot.counts.overdueTasks, icon: AlertTriangle, tone: 'text-red-700 bg-red-50' },
          { label: 'Payment reviews', value: canReviewPayments ? snapshot.counts.paymentReviews : '—', icon: Wallet, tone: 'text-slate-700 bg-slate-100' },
          { label: 'Quiet leads', value: snapshot.counts.quietLeads, icon: Clock, tone: 'text-violet-700 bg-violet-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`} aria-hidden="true"><Icon size={18} /></div>
            <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs leading-4 text-slate-600">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="Overdue invoices"
          description="Collections requiring follow-up."
          count={snapshot.overdueInvoices.length}
          icon={CreditCard}
          tone="danger"
          actionLabel="Open invoices"
          onAction={onNavigate ? () => onNavigate('financials') : undefined}
        >
          {snapshot.overdueInvoices.length === 0 ? <EmptyState>No overdue invoices right now.</EmptyState> : (
            <ul className="space-y-2">
              {snapshot.overdueInvoices.slice(0, 5).map(invoice => (
                <li key={invoice.id} className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-slate-900">Invoice #{invoice.id.slice(0, 8)}</p>
                      <p className="mt-0.5 text-xs text-slate-600">Due {formatDate(invoice.dueDate)} · {invoice.daysOverdue}d overdue</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-red-700">{formatMoney(invoice.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Contracts needing attention"
          description="Expiring, ended, or pending-start agreements."
          count={snapshot.contractsNeedingAttention.length}
          icon={FileText}
          tone="warning"
          actionLabel="Open contracts"
          onAction={onNavigate ? () => onNavigate('contracts') : undefined}
        >
          {snapshot.contractsNeedingAttention.length === 0 ? <EmptyState>No contracts need attention in the next 30 days.</EmptyState> : (
            <ul className="space-y-2">
              {snapshot.contractsNeedingAttention.slice(0, 5).map(({ contract, reason }) => (
                <li key={contract.id} className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-3">
                  <p className="break-words text-sm font-semibold text-slate-900">{contract.details || `Contract ${contract.id.slice(0, 8)}`}</p>
                  <p className="mt-0.5 text-xs text-slate-600">Ends {formatDate(contract.endDate)} · {reason}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Active contracts & campaigns"
          description="Live revenue-generating placements."
          count={snapshot.activeContracts.length}
          icon={Target}
          tone="primary"
          actionLabel="View all"
          onAction={onNavigate ? () => onNavigate('contracts') : undefined}
        >
          {snapshot.activeContracts.length === 0 ? <EmptyState>No active contracts today.</EmptyState> : (
            <ul className="space-y-2">
              {snapshot.activeContracts.slice(0, 5).map(contract => (
                <li key={contract.id} className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">{contract.details || `Contract ${contract.id.slice(0, 8)}`}</p>
                      <p className="mt-0.5 text-xs text-slate-600">Active through {formatDate(contract.endDate)}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-indigo-700">{formatMoney(contract.monthlyRate)}/mo</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Due & overdue work"
          description="General and CRM tasks requiring action today."
          count={taskItems.length}
          icon={AlertTriangle}
          tone={snapshot.counts.overdueTasks > 0 ? 'danger' : 'warning'}
          actionLabel="Open tasks"
          onAction={onNavigate ? () => onNavigate('tasks') : undefined}
        >
          {taskItems.length === 0 ? <EmptyState>No general or CRM tasks are due today.</EmptyState> : (
            <div className="space-y-3">
              <TaskRows items={snapshot.overdueGeneralTasks} source="General" />
              <TaskRows items={snapshot.overdueCRMTasks} source="CRM" />
              <TaskRows items={snapshot.dueGeneralTasks} source="General" />
              <TaskRows items={snapshot.dueCRMTasks} source="CRM" />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Open payment reviews"
          description="Manager/Admin-only payment-control queue."
          count={canReviewPayments ? snapshot.paymentReviews.length : undefined}
          icon={Wallet}
          tone="neutral"
          actionLabel={canReviewPayments ? 'Open payments' : undefined}
          onAction={canReviewPayments && onNavigate ? () => onNavigate('payments') : undefined}
        >
          {paymentReviewState.kind === 'loading' ? (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600" role="status">Loading open payment reviews…</p>
          ) : paymentReviewState.kind === 'restricted' || paymentReviewState.kind === 'unavailable' ? (
            <EmptyState>{paymentReviewState.message}</EmptyState>
          ) : snapshot.paymentReviews.length === 0 ? <EmptyState>No open payment reviews.</EmptyState> : (
            <ul className="space-y-2">
              {snapshot.paymentReviews.slice(0, 5).map(review => (
                <li key={review.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-slate-900">Receipt #{review.receiptId.slice(0, 8)}</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {review.receipt?.paymentMethod || 'Payment method pending'} · {review.receipt?.approvalStatus || review.status}
                      </p>
                    </div>
                    {review.receipt?.total != null && <span className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(review.receipt.total)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm sm:p-5" aria-labelledby="quiet-leads-title">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700" aria-hidden="true"><Clock size={20} /></div>
            <div className="min-w-0">
              <h2 id="quiet-leads-title" className="text-base font-bold text-slate-900">High-value quiet leads</h2>
              <p className="mt-0.5 text-sm leading-5 text-slate-600">Open opportunities quiet for more than 7 days and qualified by score or deal value.</p>
            </div>
          </div>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('crm')} className={`${touchButtonClass} inline-flex shrink-0 items-center justify-center gap-1 bg-white text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100`}>
              Open CRM <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {snapshot.quietLeads.length === 0 ? <EmptyState>No high-value quiet leads match the current rule.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.quietLeads.slice(0, 8).map(lead => {
              const automation = automationByOpportunity[lead.opportunity.id];
              const disabled = automation?.kind === 'loading' || automation?.kind === 'created' || automation?.kind === 'existing';
              return (
                <article key={lead.opportunity.id} className="min-w-0 rounded-2xl border border-violet-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-bold text-slate-900">{lead.company?.name || 'Unnamed company'}</h3>
                      <p className="mt-0.5 text-xs text-slate-600">{lead.primaryContact?.fullName || 'No primary contact recorded'} · {statusLabel(lead.opportunity.stage)}</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-sm font-bold tabular-nums text-violet-800" aria-label={`Lead score ${lead.score} out of 100`}>
                      {lead.score}/100
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-5 text-slate-700">{lead.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">Last activity {formatDate(lead.lastActivityAt)} · {lead.daysQuiet} days quiet · {formatMoney(lead.opportunity.estimatedValue)} estimated</p>
                  <ol className="mt-3 space-y-1.5 text-sm leading-5 text-slate-700">
                    {lead.nextBestActions.map((action, index) => (
                      <li key={`${lead.opportunity.id}-${index}`} className="flex gap-2">
                        <span className="mt-0.5 font-bold text-violet-700" aria-hidden="true">{index + 1}.</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void createQuietLeadFollowUp(lead)}
                      disabled={disabled}
                      className={`${touchButtonClass} inline-flex items-center justify-center gap-2 bg-violet-700 text-white hover:bg-violet-800`}
                    >
                      {automation?.kind === 'loading' ? 'Creating follow-up…' : automation?.kind === 'created' ? 'Follow-up created' : automation?.kind === 'existing' ? 'Follow-up already exists' : 'Create follow-up task'}
                    </button>
                    {onNavigate && (
                      <button type="button" onClick={() => onNavigate('crm')} className={`${touchButtonClass} inline-flex items-center justify-center gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                        View lead <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {automation && (
                    <p className={`mt-2 text-sm ${automation.kind === 'error' ? 'text-red-700' : 'text-emerald-700'}`} role={automation.kind === 'error' ? 'alert' : 'status'}>
                      {automation.kind !== 'error' && <CheckCircle2 size={15} className="mr-1 inline-block align-text-bottom" aria-hidden="true" />}
                      {automation.message}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

export default TodayOperations;
