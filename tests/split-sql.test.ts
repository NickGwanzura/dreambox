import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitSqlStatements } from '../lib/splitSql';

const migrationPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prisma',
  'migrations',
  '20260802110000_finance_database_guards',
  'migration.sql',
);

describe('splitSqlStatements', () => {
  it('splits plain statements on semicolons', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('ignores semicolons inside single-quoted strings', () => {
    expect(splitSqlStatements("SELECT 'a;b' AS x;")).toEqual(["SELECT 'a;b' AS x"]);
  });

  it('ignores semicolons and comments inside dollar-quoted function bodies', () => {
    const sql =
      "CREATE OR REPLACE FUNCTION f() RETURNS TRIGGER AS $fn$ BEGIN -- c; note\n  PERFORM 1; END; $fn$ LANGUAGE plpgsql;";
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('PERFORM 1; END;');
  });

  it('handles tagged dollar quotes and empty statements between them', () => {
    const sql = `DO $tag$ BEGIN EXECUTE 'SELECT 1'; END $tag$; SELECT 2;`;
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("EXECUTE 'SELECT 1'");
    expect(parts[1]).toBe('SELECT 2');
  });

  it('skips -- and /* */ comments outside strings', () => {
    const sql = `-- header comment\nSELECT 1; /* block; comment */ SELECT 2;`;
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('splits the finance-database-guards migration into its 7 top-level statements', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const parts = splitSqlStatements(sql);

    expect(parts).toHaveLength(7);
    // 1. Queue table, 2. unique index, 3. status index
    expect(parts[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "payment_reference_duplicate_queue"/);
    expect(parts[1]).toMatch(/^CREATE UNIQUE INDEX IF NOT EXISTS "payment_reference_duplicate_queue_key"/);
    expect(parts[2]).toMatch(/^CREATE INDEX IF NOT EXISTS "payment_reference_duplicate_queue_status_idx"/);

    // 4-7. The four DO blocks, each with its full body intact.
    const closed = parts.find(p => p.includes('dreambox_guard_closed_financial_period'));
    expect(closed).toBeDefined();
    expect(closed).toContain("RAISE EXCEPTION 'Accounting period is closed for % record dated %', p_record_type, p_date");
    expect(closed).toContain('CREATE TRIGGER invoices_closed_accounting_period_guard');

    const allocation = parts.find(p => p.includes('dreambox_guard_active_payment_allocation'));
    expect(allocation).toBeDefined();
    expect(allocation).toContain('CREATE TRIGGER payment_allocations_active_guard');

    const queueRefresh = parts.find(p => p.includes('ON CONFLICT ("normalizedPaymentMethod", "normalizedPaymentReference")'));
    expect(queueRefresh).toBeDefined();
    expect(queueRefresh).toContain('jsonb_agg("id" ORDER BY "createdAt", "id")');

    const helper = parts.find(p => p.includes('dreambox_apply_active_payment_reference_unique_index'));
    expect(helper).toBeDefined();
    // The nested SQL string with escaped quotes is preserved verbatim.
    expect(helper).toContain("NULLIF(BTRIM(\"paymentReference\"), '') IS NOT NULL");
  });
});
