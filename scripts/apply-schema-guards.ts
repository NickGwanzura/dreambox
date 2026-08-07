/**
 * Apply all idempotent schema guards to a Postgres database, one-shot.
 *
 * This mirrors exactly what server.ts does at boot (auth columns, finance
 * columns/tables, audit columns, field_reports enums/table/indexes, InvoiceType
 * Proforma) and then replays the finance-database-guards migration
 * (20260802110000) so the DB-level triggers/queue are present too.
 *
 * Usage:
 *   npx tsx scripts/apply-schema-guards.ts "postgresql://user:pass@host:port/dbname"
 *
 * The URL is taken from argv only (never .env) so there is no chance of
 * running against the wrong database. Every statement is idempotent.
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitSqlStatements } from '../lib/splitSql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx tsx scripts/apply-schema-guards.ts "postgresql://user:pass@host:port/dbname"');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 2 });

  let ok = 0;
  let fail = 0;
  const run = async (label: string, sql: string) => {
    try {
      await pool.query(sql);
      console.log(`  \u2713 ${label}`);
      ok++;
    } catch (e: any) {
      console.error(`  \u2717 ${label}: ${String(e?.message ?? e).slice(0, 160)}`);
      fail++;
    }
  };

  console.log('Connecting and applying schema guards…\n');

  // ── 1. Columns + indexes (same set as the server.ts boot guards) ──────────
  const columnGuards: Array<[string, string]> = [
    ['users.sessionVersion',            `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0`],
    ['invoices.dueDate',                `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dueDate" TEXT`],
    ['contracts.sourceQuotationId',     `ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "sourceQuotationId" TEXT`],
    ['company_profile.campaignGallery', `ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "campaignGallery" TEXT`],
    ['expenses.clientId',               `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "clientId" TEXT`],
    ['expenses.contractId',             `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "contractId" TEXT`],
    ['expenses_clientId_idx',           `CREATE INDEX IF NOT EXISTS "expenses_clientId_idx" ON "expenses"("clientId")`],
    ['expenses_contractId_idx',         `CREATE INDEX IF NOT EXISTS "expenses_contractId_idx" ON "expenses"("contractId")`],
    ['crm_tasks.automationKey',         `ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "automationKey" TEXT`],
    ['crm_tasks_automationKey_key',     `CREATE UNIQUE INDEX IF NOT EXISTS "crm_tasks_automationKey_key" ON "crm_tasks"("automationKey")`],
    ['contracts_sourceQuotationId_idx', `CREATE INDEX IF NOT EXISTS "contracts_sourceQuotationId_idx" ON "contracts"("sourceQuotationId")`],
  ];
  for (const [label, sql] of columnGuards) await run(label, sql);

  // ── 2. Finance columns + ledger tables ─────────────────────────────────────
  const financeColumns: Array<[string, string]> = [
    ['receivedBy', 'TEXT'], ['receivedByUserId', 'TEXT'], ['receivingAccount', 'TEXT'],
    ['proofPaymentUrl', 'TEXT'], ['proofOriginalName', 'TEXT'], ['proofMimeType', 'TEXT'],
    ['proofUploadedAt', 'TIMESTAMP(3)'], ['recordedAt', 'TIMESTAMP(3)'], ['postedAt', 'TIMESTAMP(3)'],
    ["approvalStatus", "TEXT NOT NULL DEFAULT 'NotRequired'"], ['approvedBy', 'TEXT'],
    ['approvedAt', 'TIMESTAMP(3)'], ['approvalNote', 'TEXT'], ['isVoided', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['voidReason', 'TEXT'], ['voidedAt', 'TIMESTAMP(3)'], ['voidedBy', 'TEXT'], ['linkedInvoiceId', 'TEXT'],
  ];
  for (const [col, type] of financeColumns) {
    await run(`invoices.${col}`, `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
  }
  await run('invoices_approvalStatus_idx', `CREATE INDEX IF NOT EXISTS "invoices_approvalStatus_idx" ON "invoices"("approvalStatus")`);
  await run('payment_allocations table', `
    CREATE TABLE IF NOT EXISTS "payment_allocations" (
      "id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL, "invoiceId" TEXT NOT NULL,
      "amount" DECIMAL(18,2) NOT NULL, "allocatedBy" TEXT NOT NULL,
      "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "isReversed" BOOLEAN NOT NULL DEFAULT FALSE, "reversedAt" TIMESTAMP(3),
      "reversedBy" TEXT, "reason" TEXT
    )`);
  await run('accounting_periods table', `
    CREATE TABLE IF NOT EXISTS "accounting_periods" (
      "id" TEXT PRIMARY KEY, "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'Open', "closedAt" TIMESTAMP(3), "closedBy" TEXT,
      "reopenedAt" TIMESTAMP(3), "reopenedBy" TEXT, "reason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await run('payment_reviews table', `
    CREATE TABLE IF NOT EXISTS "payment_reviews" (
      "id" TEXT PRIMARY KEY, "receiptId" TEXT UNIQUE NOT NULL, "status" TEXT NOT NULL DEFAULT 'Open',
      "assignedTo" TEXT, "resolvedBy" TEXT, "resolvedAt" TIMESTAMP(3), "resolutionNote" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

  // ── 3. Audit columns ───────────────────────────────────────────────────────
  await run('audit_logs columns', `
    ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "beforeData" JSONB,
    ADD COLUMN IF NOT EXISTS "afterData" JSONB,
    ADD COLUMN IF NOT EXISTS "requestId" TEXT,
    ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
    ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
    ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SERVER',
    ADD COLUMN IF NOT EXISTS "previousHash" TEXT,
    ADD COLUMN IF NOT EXISTS "eventHash" TEXT`);

  // ── 4. Field reports (enums must exist before the table) ──────────────────
  await run('enum FieldReportType', `DO $$ BEGIN CREATE TYPE "FieldReportType" AS ENUM ('CheckIn', 'CampaignProof', 'Issue'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await run('enum FieldReportStatus', `DO $$ BEGIN CREATE TYPE "FieldReportStatus" AS ENUM ('Pending', 'Submitted', 'Resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await run('field_reports table', `
    CREATE TABLE IF NOT EXISTS "field_reports" (
      "id" TEXT NOT NULL, "type" "FieldReportType" NOT NULL, "billboardId" TEXT NOT NULL,
      "contractId" TEXT, "note" TEXT, "photoUrl" TEXT,
      "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, "accuracy" DOUBLE PRECISION,
      "status" "FieldReportStatus" NOT NULL DEFAULT 'Submitted',
      "reportedBy" TEXT NOT NULL, "reportedByEmail" TEXT,
      "capturedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
    )`);
  for (const idx of ['billboardId', 'contractId', 'status', 'capturedAt']) {
    await run(`field_reports_${idx}_idx`, `CREATE INDEX IF NOT EXISTS "field_reports_${idx}_idx" ON "field_reports"("${idx}")`);
  }

  // ── 5. InvoiceType Proforma value ──────────────────────────────────────────
  try {
    await pool.query(`ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'Proforma'`);
    console.log('  \u2713 InvoiceType.Proforma');
    ok++;
  } catch (e: any) {
    console.error(`  \u2717 InvoiceType.Proforma: ${String(e?.message ?? e).slice(0, 160)}`);
    fail++;
  }

  // ── 6. Replay the finance-database-guards migration (triggers + queue) ─────
  const guardPath = path.join(__dirname, '..', 'prisma', 'migrations', '20260802110000_finance_database_guards', 'migration.sql');
  const statements = splitSqlStatements(readFileSync(guardPath, 'utf8'));
  for (let i = 0; i < statements.length; i++) {
    await run(`finance-guard ${i + 1}/${statements.length}`, statements[i]);
  }

  // ── 7. Remaining indexes (performance only — no write-path dependency) ─────
  const indexGuards: Array<[string, string]> = [
    ['invoices_isVoided_idx',                              `CREATE INDEX IF NOT EXISTS "invoices_isVoided_idx" ON "invoices"("isVoided")`],
    ['invoices_paymentReference_idx',                      `CREATE INDEX IF NOT EXISTS "invoices_paymentReference_idx" ON "invoices"("paymentReference")`],
    ['payment_allocations_receiptId_invoiceId_key',        `CREATE UNIQUE INDEX IF NOT EXISTS "payment_allocations_receiptId_invoiceId_key" ON "payment_allocations"("receiptId", "invoiceId")`],
    ['payment_allocations_receiptId_idx',                  `CREATE INDEX IF NOT EXISTS "payment_allocations_receiptId_idx" ON "payment_allocations"("receiptId")`],
    ['payment_allocations_invoiceId_idx',                  `CREATE INDEX IF NOT EXISTS "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId")`],
    ['accounting_periods_startDate_endDate_key',           `CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_startDate_endDate_key" ON "accounting_periods"("startDate", "endDate")`],
    ['accounting_periods_status_startDate_endDate_idx',    `CREATE INDEX IF NOT EXISTS "accounting_periods_status_startDate_endDate_idx" ON "accounting_periods"("status", "startDate", "endDate")`],
    ['payment_reviews_status_createdAt_idx',               `CREATE INDEX IF NOT EXISTS "payment_reviews_status_createdAt_idx" ON "payment_reviews"("status", "createdAt")`],
    ['audit_logs_source_idx',                              `CREATE INDEX IF NOT EXISTS "audit_logs_source_idx" ON "audit_logs"("source")`],
  ];
  for (const [label, sql] of indexGuards) await run(label, sql);

  // ── 8. Audit hash-chain + append-only enforcement (idempotent subset of
  //        migration 20260801190000 — the CHECK/FK constraints are skipped
  //        because ADD CONSTRAINT is not re-runnable). ───────────────────────
  await run('pgcrypto extension', `CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await run('audit baseline hashes', `UPDATE "audit_logs" SET "eventHash" = encode(digest(concat_ws('|', "id", "action", "details", COALESCE("userEmail", ''), "createdAt"::text), 'sha256'), 'hex') WHERE "eventHash" IS NULL`);
  await run('fn dreambox_prepare_audit_event', `
    CREATE OR REPLACE FUNCTION dreambox_prepare_audit_event()
    RETURNS trigger AS $$
    DECLARE
      prior_hash TEXT;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('dreambox-audit-chain'));
      SELECT "eventHash" INTO prior_hash FROM "audit_logs" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1;
      NEW."previousHash" := prior_hash;
      NEW."eventHash" := encode(digest(concat_ws('|',
        COALESCE(prior_hash, ''), NEW."id", NEW."action", NEW."details",
        COALESCE(NEW."userId", ''), COALESCE(NEW."userEmail", ''),
        COALESCE(NEW."tableName", ''), COALESCE(NEW."recordId", ''),
        COALESCE(NEW."source", 'SERVER'), NEW."createdAt"::text,
        COALESCE(NEW."beforeData"::text, ''), COALESCE(NEW."afterData"::text, '')
      ), 'sha256'), 'hex');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  await run('fn dreambox_prevent_audit_mutation', `
    CREATE OR REPLACE FUNCTION dreambox_prevent_audit_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Audit events are append-only and cannot be changed or deleted';
    END;
    $$ LANGUAGE plpgsql`);
  await run('trigger audit_logs_prepare_event', `DROP TRIGGER IF EXISTS "audit_logs_prepare_event" ON "audit_logs"; CREATE TRIGGER "audit_logs_prepare_event" BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION dreambox_prepare_audit_event()`);
  await run('trigger audit_logs_append_only', `DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs"; CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION dreambox_prevent_audit_mutation()`);

  console.log(`\nDone: ${ok} ok, ${fail} failed.`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e?.message ?? e);
  process.exit(1);
});
