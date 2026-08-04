import type {
  CRMCompany,
  CRMContact,
  CRMOpportunity,
  CRMTouchpoint,
} from '../types';
import {
  calculateLeadScore,
  type LeadRecommendation,
} from './leadScoring';

/**
 * Quiet-lead automation is deliberately versioned. Bumping this string starts
 * a new idempotency namespace if the business rule materially changes.
 */
export const QUIET_LEAD_AUTOMATION_RULE_VERSION = 'quiet-lead-v1';

/** A lead must be quiet for more than this many completed UTC calendar days. */
export const QUIET_LEAD_DAYS = 7;

/** Existing lead scoring qualifies a lead at this score, regardless of value. */
export const HIGH_VALUE_LEAD_SCORE_THRESHOLD = 70;

/** A sufficiently valuable deal qualifies even when its score is still maturing. */
export const HIGH_VALUE_ESTIMATED_VALUE_THRESHOLD = 50_000;

export const QUIET_LEAD_AUTOMATION_ACTION = 'create_quiet_lead_follow_up' as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuietLeadScoreResult {
  score: number;
  recommendations: LeadRecommendation[];
}

/**
 * Injectable for deterministic tests. Production uses the established lead
 * scoring engine; the rest of the eligibility rule remains pure and receives
 * `now` explicitly.
 */
export type QuietLeadScorer = (
  opportunity: CRMOpportunity,
  company: CRMCompany | undefined,
  primaryContact: CRMContact | undefined,
  touchpoints: CRMTouchpoint[],
) => QuietLeadScoreResult;

export interface QuietLeadAssessmentInput {
  opportunity: CRMOpportunity;
  company?: CRMCompany;
  primaryContact?: CRMContact;
  touchpoints: CRMTouchpoint[];
}

export interface QuietLeadAssessment extends QuietLeadAssessmentInput {
  eligible: boolean;
  score: number;
  daysQuiet: number;
  lastActivityAt?: string;
  reason: string;
  nextBestActions: string[];
  automationKey?: string;
}

function asValidDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function toIso(value: unknown): string | undefined {
  const date = asValidDate(value);
  return date?.toISOString();
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isOpenOpportunity(opportunity: Pick<CRMOpportunity, 'status'>): boolean {
  const status = normalizeStatus(opportunity.status);
  return status !== 'closed_won' && status !== 'closed_lost';
}

/**
 * Activity means a recorded contact or touchpoint. If neither exists, the
 * opportunity creation time is the conservative starting point for quietness.
 */
export function getLastOpportunityActivityAt(
  opportunity: Pick<CRMOpportunity, 'createdAt' | 'lastContactDate'>,
  touchpoints: Array<Pick<CRMTouchpoint, 'createdAt'>>,
): string | undefined {
  const candidates = [
    opportunity.lastContactDate,
    opportunity.createdAt,
    ...touchpoints.map(touchpoint => touchpoint.createdAt),
  ]
    .map(value => asValidDate(value))
    .filter((value): value is Date => Boolean(value));

  if (candidates.length === 0) return undefined;
  return new Date(Math.max(...candidates.map(value => value.getTime()))).toISOString();
}

/** Uses UTC calendar days so due/quiet boundaries do not drift with client timezone. */
export function getDaysQuiet(lastActivityAt: string | undefined, now: Date): number {
  const lastActivity = lastActivityAt ? asValidDate(lastActivityAt) : undefined;
  if (!lastActivity || Number.isNaN(now.getTime())) return 0;
  return Math.max(0, Math.floor((startOfUtcDay(now) - startOfUtcDay(lastActivity)) / DAY_MS));
}

/**
 * A window is anchored to the latest customer activity. This avoids calendar
 * week boundaries creating two tasks a day apart, and a fresh touchpoint
 * naturally begins a new sequence of quiet windows.
 */
export function getQuietLeadTimeBucket(lastActivityAt: string, now: Date): string | undefined {
  const lastActivity = asValidDate(lastActivityAt);
  if (!lastActivity || Number.isNaN(now.getTime())) return undefined;

  const daysQuiet = getDaysQuiet(lastActivity.toISOString(), now);
  if (daysQuiet <= QUIET_LEAD_DAYS) return undefined;

  const firstEligibleDay = QUIET_LEAD_DAYS + 1;
  const windowIndex = Math.floor((daysQuiet - firstEligibleDay) / QUIET_LEAD_DAYS);
  return `${dateKey(lastActivity)}:window-${windowIndex}`;
}

export function buildQuietLeadAutomationKey(
  opportunityId: string,
  lastActivityAt: string,
  now: Date,
): string | undefined {
  const bucket = getQuietLeadTimeBucket(lastActivityAt, now);
  if (!bucket) return undefined;
  return `${QUIET_LEAD_AUTOMATION_RULE_VERSION}:${opportunityId}:${bucket}`;
}

function defaultQuietLeadScorer(
  opportunity: CRMOpportunity,
  company: CRMCompany | undefined,
  primaryContact: CRMContact | undefined,
  touchpoints: CRMTouchpoint[],
): QuietLeadScoreResult {
  const sortedTouchpoints = [...touchpoints].sort((a, b) => {
    const right = asValidDate(b.createdAt)?.getTime() || 0;
    const left = asValidDate(a.createdAt)?.getTime() || 0;
    return right - left;
  });
  const result = calculateLeadScore(opportunity, company, primaryContact, sortedTouchpoints);
  return { score: result.totalScore, recommendations: result.recommendations };
}

function nextBestActions(
  recommendations: LeadRecommendation[],
  company: CRMCompany | undefined,
  primaryContact: CRMContact | undefined,
): string[] {
  const recommended = recommendations
    .map(recommendation => {
      const action = recommendation.action.trim();
      const description = recommendation.description.trim();
      return action ? (description ? `${action}: ${description}` : action) : '';
    })
    .filter(Boolean)
    .filter((action, index, all) => all.findIndex(candidate => candidate.toLowerCase() === action.toLowerCase()) === index)
    .slice(0, 2);

  const person = primaryContact?.fullName?.trim() || company?.name?.trim() || 'the lead';
  const fallback = `Follow up with ${person} by phone or email and confirm the next decision step.`;
  return [...recommended, fallback].slice(0, 3);
}

function qualificationReason(score: number, estimatedValue: number | undefined): string {
  const scoreQualified = score >= HIGH_VALUE_LEAD_SCORE_THRESHOLD;
  const valueQualified = (estimatedValue || 0) >= HIGH_VALUE_ESTIMATED_VALUE_THRESHOLD;
  if (scoreQualified && valueQualified) {
    return `Lead score ${score}/100 and estimated value $${Number(estimatedValue).toLocaleString()} meet the high-value rule`;
  }
  if (scoreQualified) return `Lead score ${score}/100 meets the high-value rule`;
  return `Estimated value $${Number(estimatedValue || 0).toLocaleString()} meets the high-value rule`;
}

/**
 * Reusable eligibility assessment for both the client command center and the
 * server command. It never creates records; task creation stays behind an
 * explicit endpoint action.
 */
export function assessQuietLead(
  input: QuietLeadAssessmentInput,
  now: Date,
  scorer: QuietLeadScorer = defaultQuietLeadScorer,
): QuietLeadAssessment {
  const { opportunity, company, primaryContact, touchpoints } = input;
  const scoreResult = scorer(opportunity, company, primaryContact, touchpoints);
  const score = Math.max(0, Math.min(100, Math.round(Number(scoreResult.score) || 0)));
  const lastActivityAt = getLastOpportunityActivityAt(opportunity, touchpoints);
  const daysQuiet = getDaysQuiet(lastActivityAt, now);
  const open = isOpenOpportunity(opportunity);
  const highValue = score >= HIGH_VALUE_LEAD_SCORE_THRESHOLD
    || (Number(opportunity.estimatedValue) || 0) >= HIGH_VALUE_ESTIMATED_VALUE_THRESHOLD;
  const quiet = Boolean(lastActivityAt) && daysQuiet > QUIET_LEAD_DAYS;
  const eligible = open && highValue && quiet;

  let reason: string;
  if (!open) {
    reason = 'Closed opportunities are excluded from quiet-lead follow-up.';
  } else if (!highValue) {
    reason = `Lead score ${score}/100 and estimated value $${Number(opportunity.estimatedValue || 0).toLocaleString()} are below the high-value thresholds.`;
  } else if (!lastActivityAt) {
    reason = 'No valid activity date is available to determine a quiet-lead window.';
  } else if (!quiet) {
    reason = `Last activity is ${daysQuiet} days ago; quiet leads require more than ${QUIET_LEAD_DAYS} completed days.`;
  } else {
    reason = `${daysQuiet} days quiet. ${qualificationReason(score, opportunity.estimatedValue)}.`;
  }

  const automationKey = eligible && lastActivityAt
    ? buildQuietLeadAutomationKey(opportunity.id, lastActivityAt, now)
    : undefined;

  return {
    ...input,
    eligible,
    score,
    daysQuiet,
    lastActivityAt: toIso(lastActivityAt),
    reason,
    nextBestActions: nextBestActions(scoreResult.recommendations || [], company, primaryContact),
    automationKey,
  };
}

export function quietLeadTaskTitle(companyName?: string): string {
  return `Follow up with ${companyName?.trim() || 'high-value quiet lead'}`;
}

export function quietLeadTaskDescription(assessment: QuietLeadAssessment): string {
  const actions = assessment.nextBestActions.map((action, index) => `${index + 1}. ${action}`).join('\n');
  return [
    `Automated quiet-lead follow-up (${QUIET_LEAD_AUTOMATION_RULE_VERSION}).`,
    assessment.reason,
    assessment.lastActivityAt ? `Last activity: ${assessment.lastActivityAt}.` : '',
    actions ? `Next best actions:\n${actions}` : '',
  ].filter(Boolean).join('\n\n');
}
