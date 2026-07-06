import { describe, it, expect } from 'vitest';
import { normalizeOpportunityStatus, getCRMPipelineMetrics } from '../services/crmService';

/**
 * Regression tests for "Cannot read properties of undefined (reading 'count')"
 * in getCRMPipelineMetrics: out-of-vocabulary opportunity statuses (CSV
 * imports, legacy DB rows) crashed the analytics when used as byStatus keys.
 */

describe('normalizeOpportunityStatus', () => {
  it('passes canonical statuses through', () => {
    for (const s of ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']) {
      expect(normalizeOpportunityStatus(s)).toBe(s);
    }
  });

  it('normalizes case and whitespace', () => {
    expect(normalizeOpportunityStatus('New')).toBe('new');
    expect(normalizeOpportunityStatus('  CONTACTED ')).toBe('contacted');
    expect(normalizeOpportunityStatus('Closed Won')).toBe('closed_won');
    expect(normalizeOpportunityStatus('closed-lost')).toBe('closed_lost');
  });

  it('maps common synonyms', () => {
    expect(normalizeOpportunityStatus('won')).toBe('closed_won');
    expect(normalizeOpportunityStatus('lost')).toBe('closed_lost');
    expect(normalizeOpportunityStatus('pending')).toBe('new');
    expect(normalizeOpportunityStatus('new lead')).toBe('new');
    expect(normalizeOpportunityStatus('quoted')).toBe('proposal');
  });

  it('falls back to "new" for garbage, null, and undefined', () => {
    expect(normalizeOpportunityStatus('banana')).toBe('new');
    expect(normalizeOpportunityStatus('')).toBe('new');
    expect(normalizeOpportunityStatus(null)).toBe('new');
    expect(normalizeOpportunityStatus(undefined)).toBe('new');
    expect(normalizeOpportunityStatus(42)).toBe('new');
  });
});

describe('getCRMPipelineMetrics', () => {
  it('does not throw on empty state', () => {
    expect(() => getCRMPipelineMetrics()).not.toThrow();
    const metrics = getCRMPipelineMetrics();
    expect(metrics.byStatus.new.count).toBe(0);
    expect(metrics.totalOpportunities).toBe(0);
  });
});
