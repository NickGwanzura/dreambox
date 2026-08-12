/**
 * Vendor-neutral Express application server.
 * Serves the Vite static build and routes /api/* to HTTP handlers.
 */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { Request, Response } from 'express';
import { log, requestLogger, errorHandler, logStartupInfo } from './lib/serverLogger.js';
import { splitSqlStatements } from './lib/splitSql.js';
import { notifyAdminOpsAlert } from './lib/notifyAdmin.js';
import { prisma } from './lib/prisma.js';

// ─── Patch global console so all handlers' console.* calls get structured ────
// The logger writes directly to process.stdout/stderr so there is no loop.
console.log   = (...a: any[]) => log.info(fmtArgs(a));
console.info  = (...a: any[]) => log.info(fmtArgs(a));
console.warn  = (...a: any[]) => log.warn(fmtArgs(a));
console.error = (...a: any[]) => log.error(fmtArgs(a));
console.debug = (...a: any[]) => log.debug(fmtArgs(a));

function fmtArgs(args: any[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
let httpServer: ReturnType<typeof app.listen> | null = null;

type MigrationReadiness = 'not_configured' | 'pending' | 'ready' | 'failed';
type SchemaReadiness = 'not_configured' | 'pending' | 'ready' | 'blocked';

interface MigrationRunResult {
  bootIssues: string[];
  migrationsReady: boolean;
  schemaReady: boolean;
}

// Prisma Migrate is the authoritative schema contract. The idempotent guards
// below are legacy compatibility measures and do not replace a successful
// migration deployment.
const startupReadiness: { migrations: MigrationReadiness; schema: SchemaReadiness } = {
  migrations: process.env.DATABASE_URL ? 'pending' : 'not_configured',
  schema: process.env.DATABASE_URL ? 'pending' : 'not_configured',
};

export function getDatabaseReadiness() {
  return {
    migrations: startupReadiness.migrations,
    schema: startupReadiness.schema,
    ready: startupReadiness.migrations === 'ready' && startupReadiness.schema === 'ready',
  };
}

export { app };

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security headers — CSP and COEP disabled to allow SPA import maps and CDN-loaded ES modules
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
// Only trust forwarded client addresses when the deployment explicitly sits
// behind a configured reverse proxy (Cloudflare/Dokploy).
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
// Backups are JSON documents and can exceed the normal API payload size. Keep
// the ceiling explicit and configurable rather than failing restores at 10 MB.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
app.use(requestLogger);

// ─── Maintenance mode ─────────────────────────────────────────────────────────
// Flip the backend into maintenance from the deployment environment:
//   MAINTENANCE_MODE=1            → logins and API writes are blocked (503)
//   MAINTENANCE_UNTIL=ISO string  → optional auto-expiry (also powers the
//                                   countdown on the frontend maintenance screen)
// The SPA, /health, public endpoints, and cron endpoints stay up so the public
// site keeps working and the app can render the maintenance screen.

function isMaintenanceActive(): boolean {
  const flag = (process.env.MAINTENANCE_MODE || '').toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') return true;
  const until = process.env.MAINTENANCE_UNTIL;
  if (until) {
    const t = Date.parse(until);
    if (!Number.isNaN(t) && Date.now() < t) return true;
  }
  return false;
}

function maintenanceUntilMs(): number | null {
  const until = process.env.MAINTENANCE_UNTIL;
  const t = until ? Date.parse(until) : NaN;
  return Number.isNaN(t) ? null : t;
}

app.use((req, res, next) => {
  if (!isMaintenanceActive()) return next();
  const path = req.path || '/';
  const isPublic = req.method === 'OPTIONS'
    || path === '/health'
    || path.startsWith('/api/public-')
    || path === '/api/geocode'
    || path === '/api/logo-proxy'
    || path === '/api/public-lead'
    || path.startsWith('/api/cron/');
  if (isPublic) return next();
  if (path.startsWith('/api/')) {
    res.set('X-Maintenance', '1');
    const until = maintenanceUntilMs();
    return res.status(503).json({
      error: 'The Dreambox platform is currently under maintenance. Please check back shortly.',
      maintenance: true,
      ...(until ? { maintenanceUntil: new Date(until).toISOString() } : {}),
    });
  }
  // Non-API (SPA + assets) keep serving so the frontend can show maintenance.
  return next();
});
log.boot(isMaintenanceActive()
  ? '  Maintenance        ⚠  ACTIVE — logins and API writes blocked'
  : '  Maintenance        —  inactive');

// ─── 5xx spike alerting (in-process) ────────────────────────────────────────
const fiveXxTimestamps: number[] = [];
const FIVEXX_WINDOW_MS = 5 * 60 * 1000;
const FIVEXX_THRESHOLD = 10;
const FIVEXX_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
let lastFiveXxAlertAt = 0;

function recordServerError(status: number): void {
  // 503s from the maintenance gate are expected, not real errors.
  if (status >= 500 && status !== 503) fiveXxTimestamps.push(Date.now());
}

function checkFiveXxSpike(): void {
  const now = Date.now();
  while (fiveXxTimestamps.length && fiveXxTimestamps[0] < now - FIVEXX_WINDOW_MS) fiveXxTimestamps.shift();
  if (fiveXxTimestamps.length >= FIVEXX_THRESHOLD && now - lastFiveXxAlertAt > FIVEXX_ALERT_COOLDOWN_MS) {
    lastFiveXxAlertAt = now;
    notifyAdminOpsAlert('5xx error spike detected', [
      { title: 'Last 5 minutes', lines: [`${fiveXxTimestamps.length} server errors recorded`, 'Check the deployment logs for the affected routes.'] },
    ]);
    log.warn(`[ops] 5xx spike alert sent (${fiveXxTimestamps.length} in window)`);
  }
}

// ─── Adapt API handler to Express ────────────────────────────────────────────

function adapt(handlerModule: { default: Function }, routeName: string) {
  return async (req: Request, res: Response) => {
    log.debug(`Dispatching ${req.method} ${req.originalUrl} → handler:${routeName}`);
    try {
      await handlerModule.default(req as any, res as any);
    } catch (e: any) {
      recordServerError(500);
      log.error(`Handler error [${routeName}]: ${e?.message}`, { stack: e?.stack, code: e?.code });
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ─── Apply pending migrations on startup via Prisma Migrate ──────────────────

/** True when a given table exists in the connected database (schema-agnostic). */
async function tableExists(table: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables
       WHERE table_schema = ANY (current_schemas(false)) AND table_name = $1`,
      table,
    );
    return Number(rows?.[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function verifyRequiredIntegrityReadiness(): Promise<{ ready: boolean; missing: string[] }> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      bookingFunction: boolean;
      bookingTrigger: boolean;
      financeGuardFunction: boolean;
      financeQueue: boolean;
      auditPrepareFunction: boolean;
      invoicesPeriodTrigger: boolean;
      expensesPeriodTrigger: boolean;
      printingJobsPeriodTrigger: boolean;
      paymentAllocationsActiveTrigger: boolean;
      invoicesAllocationStateTrigger: boolean;
      auditPrepareTrigger: boolean;
      auditAppendOnlyTrigger: boolean;
    }>>(`
      WITH trigger_definitions AS (
        SELECT
          trigger.oid,
          trigger.tgname,
          trigger.tgrelid,
          trigger.tgfoid,
          trigger.tgenabled,
          trigger.tgisinternal,
          pg_get_triggerdef(trigger.oid, true) AS definition
        FROM pg_trigger trigger
      )
      SELECT
        to_regprocedure('dreambox_prevent_overlapping_contract_booking()') IS NOT NULL AS "bookingFunction",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'contracts_booking_integrity_guard'
            AND trigger.tgrelid = to_regclass('contracts')
            AND trigger.tgfoid = to_regprocedure('dreambox_prevent_overlapping_contract_booking()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_prevent_overlapping_contract_booking[(][)]'
        ) AS "bookingTrigger",
        to_regprocedure('dreambox_guard_closed_financial_period()') IS NOT NULL AS "financeGuardFunction",
        to_regclass('payment_reference_duplicate_queue') IS NOT NULL AS "financeQueue",
        to_regprocedure('dreambox_prepare_audit_event()') IS NOT NULL AS "auditPrepareFunction",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'invoices_closed_accounting_period_guard'
            AND trigger.tgrelid = to_regclass('invoices')
            AND trigger.tgfoid = to_regprocedure('dreambox_guard_closed_financial_period()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_guard_closed_financial_period[(][)]'
        ) AS "invoicesPeriodTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'expenses_closed_accounting_period_guard'
            AND trigger.tgrelid = to_regclass('expenses')
            AND trigger.tgfoid = to_regprocedure('dreambox_guard_closed_financial_period()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_guard_closed_financial_period[(][)]'
        ) AS "expensesPeriodTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'printing_jobs_closed_accounting_period_guard'
            AND trigger.tgrelid = to_regclass('printing_jobs')
            AND trigger.tgfoid = to_regprocedure('dreambox_guard_closed_financial_period()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_guard_closed_financial_period[(][)]'
        ) AS "printingJobsPeriodTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'payment_allocations_active_guard'
            AND trigger.tgrelid = to_regclass('payment_allocations')
            AND trigger.tgfoid = to_regprocedure('dreambox_guard_active_payment_allocation()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_guard_active_payment_allocation[(][)]'
        ) AS "paymentAllocationsActiveTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'invoices_payment_allocation_state_guard'
            AND trigger.tgrelid = to_regclass('invoices')
            AND trigger.tgfoid = to_regprocedure('dreambox_guard_document_allocation_state()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE UPDATE OF "?type"?[[:space:]]*,[[:space:]]*"?isVoided"?[[:space:]]*,[[:space:]]*"?approvalStatus"?[[:space:]]*,[[:space:]]*"?total"? ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_guard_document_allocation_state[(][)]'
        ) AS "invoicesAllocationStateTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'audit_logs_prepare_event'
            AND trigger.tgrelid = to_regclass('audit_logs')
            AND trigger.tgfoid = to_regprocedure('dreambox_prepare_audit_event()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND trigger.definition ~* 'BEFORE INSERT ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_prepare_audit_event[(][)]'
        ) AS "auditPrepareTrigger",
        EXISTS (
          SELECT 1 FROM trigger_definitions trigger
          WHERE trigger.tgname = 'audit_logs_append_only'
            AND trigger.tgrelid = to_regclass('audit_logs')
            AND trigger.tgfoid = to_regprocedure('dreambox_prevent_audit_mutation()')
            AND NOT trigger.tgisinternal
            AND trigger.tgenabled IN ('O', 'A')
            AND (
              trigger.definition ~* 'BEFORE UPDATE OR DELETE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_prevent_audit_mutation[(][)]'
              OR trigger.definition ~* 'BEFORE DELETE OR UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION .*dreambox_prevent_audit_mutation[(][)]'
            )
        ) AS "auditAppendOnlyTrigger"
    `);
    const readiness = rows?.[0];
    const checks: Array<[keyof NonNullable<typeof readiness>, string]> = [
      ['bookingFunction', 'booking function'],
      ['bookingTrigger', 'booking trigger'],
      ['financeGuardFunction', 'finance guard function'],
      ['financeQueue', 'payment reference queue'],
      ['auditPrepareFunction', 'audit preparation function'],
      ['invoicesPeriodTrigger', 'invoice accounting-period trigger'],
      ['expensesPeriodTrigger', 'expense accounting-period trigger'],
      ['printingJobsPeriodTrigger', 'printing-job accounting-period trigger'],
      ['paymentAllocationsActiveTrigger', 'payment-allocation active trigger'],
      ['invoicesAllocationStateTrigger', 'invoice allocation-state trigger'],
      ['auditPrepareTrigger', 'audit preparation trigger'],
      ['auditAppendOnlyTrigger', 'audit append-only trigger'],
    ];
    const missing = checks
      .filter(([key]) => !readiness?.[key])
      .map(([, label]) => label);
    return { ready: missing.length === 0, missing };
  } catch (e: any) {
    log.error('Required schema integrity readiness check failed', { error: e?.message?.slice(0, 200) });
    return { ready: false, missing: ['integrity readiness verification'] };
  }
}

export async function runMigrations(): Promise<MigrationRunResult> {
  const bootIssues: string[] = [];
  if (!process.env.DATABASE_URL) {
    startupReadiness.migrations = 'not_configured';
    startupReadiness.schema = 'not_configured';
    log.boot('  Migrations         —  skipped (DATABASE_URL not set)');
    return { bootIssues, migrationsReady: false, schemaReady: false };
  }
  if (process.env.MIGRATIONS_ON_BOOT === 'false') {
    // Production deployments can apply migrations as a separate Dokploy step,
    // avoiding DDL locks and long startup times in every web replica. Refuse
    // to serve if the required integrity markers are not already present.
    startupReadiness.migrations = 'ready';
    const integrity = await verifyRequiredIntegrityReadiness();
    startupReadiness.schema = integrity.ready ? 'ready' : 'blocked';
    const issues = integrity.missing.map(missing => `Missing required schema marker: ${missing}`);
    log.boot(`  Migrations         —  skipped on boot (${integrity.ready ? 'schema ready' : 'schema blocked'})`);
    return { bootIssues: issues, migrationsReady: true, schemaReady: integrity.ready };
  }
  startupReadiness.migrations = 'pending';
  startupReadiness.schema = 'pending';
  try {
    log.boot('  Migrations         →  running prisma migrate deploy...');
    execSync('npx prisma migrate deploy', {
      stdio: 'pipe',
      env: { ...process.env },
    });
    log.boot('  Migrations         ✓  all pending migrations applied');
  } catch (e: any) {
    const msg = e?.stderr?.toString?.() || e?.stdout?.toString?.() || e?.message || String(e);
    startupReadiness.migrations = 'failed';
    startupReadiness.schema = 'blocked';
    log.error('Prisma migrations failed; refusing to start with an unknown schema state', {
      error: msg.slice(0, 200),
    });
    throw new Error(`Prisma migrations failed; refusing to start: ${msg.slice(0, 200)}`);
  }
  startupReadiness.migrations = 'ready';

  // Authentication depends on this column. Keep an idempotent safeguard here
  // because some older production databases have incomplete Prisma migration
  // history, causing `migrate deploy` to fail while the process continues.
  // Authentication depends on these columns. Older production databases have
  // incomplete Prisma migration history, causing `migrate deploy` to fail while
  // the process continues. Each guard runs independently so one failure (e.g. a
  // locked table) can't skip the rest — a skipped campaignGallery guard used to
  // make the website gallery save 500 with "column campaignGallery does not exist".
  const authSchemaGuards: Array<{ label: string; sql: string }> = [
    { label: 'users.sessionVersion',         sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0` },
    { label: 'users.twoFactorSecret',        sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT` },
    { label: 'users.twoFactorEnabled',       sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false` },
    { label: 'invoices.dueDate',             sql: `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dueDate" TEXT` },
    { label: 'contracts.sourceQuotationId',  sql: `ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "sourceQuotationId" TEXT` },
    // Older production DBs may have incomplete migration history, leaving the
    // campaign gallery column missing. Add it idempotently so saving the
    // website gallery doesn't 500 with "column campaignGallery does not exist".
    { label: 'company_profile.campaignGallery', sql: `ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "campaignGallery" TEXT` },
    { label: 'company_profile.locationTowns', sql: `ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "locationTowns" TEXT` },
    // Same failure mode for newer columns: expenses are attributed to
    // clients/contracts and CRM tasks are de-duped by automationKey. These are
    // missing on DBs where migrate deploy never completed, which makes the
    // expenses and CRM tasks GET endpoints 500 until the columns exist.
    { label: 'expenses.clientId',          sql: `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "clientId" TEXT` },
    { label: 'expenses.contractId',        sql: `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "contractId" TEXT` },
    { label: 'expenses_clientId_idx',      sql: `CREATE INDEX IF NOT EXISTS "expenses_clientId_idx" ON "expenses"("clientId")` },
    { label: 'expenses_contractId_idx',    sql: `CREATE INDEX IF NOT EXISTS "expenses_contractId_idx" ON "expenses"("contractId")` },
    { label: 'crm_tasks.automationKey',    sql: `ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "automationKey" TEXT` },
    // Prisma upserts by automationKey generate ON CONFLICT, which needs this
    // unique index. If it fails (duplicate values), a ⚠ line below is the diagnostic.
    { label: 'crm_tasks_automationKey_key', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "crm_tasks_automationKey_key" ON "crm_tasks"("automationKey")` },
    { label: 'contracts_sourceQuotationId_idx', sql: `CREATE INDEX IF NOT EXISTS "contracts_sourceQuotationId_idx" ON "contracts"("sourceQuotationId")` },
    { label: 'cron_job_runs table', sql: `CREATE TABLE IF NOT EXISTS "cron_job_runs" ("id" TEXT NOT NULL, "jobKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'Running', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "result" JSONB, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "cron_job_runs_pkey" PRIMARY KEY ("id"))` },
    { label: 'cron_job_runs_jobKey_key', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "cron_job_runs_jobKey_key" ON "cron_job_runs"("jobKey")` },
    { label: 'cron_job_runs_status_startedAt_idx', sql: `CREATE INDEX IF NOT EXISTS "cron_job_runs_status_startedAt_idx" ON "cron_job_runs"("status", "startedAt")` },
  ];
  let authGuardsReady = 0;
  for (const step of authSchemaGuards) {
    try {
      await prisma.$executeRawUnsafe(step.sql);
      authGuardsReady += 1;
    } catch (e: any) {
      bootIssues.push(`Auth schema ${step.label}: ${e?.message?.slice(0, 120)}`);
      log.boot(`  Auth schema        ⚠  ${step.label}: ${e?.message?.slice(0, 160)}`);
    }
  }
  log.boot(`  Auth schema        ✓  ${authGuardsReady}/${authSchemaGuards.length} guards ready`);

  // Older production databases may have incomplete migration history. Keep
  // finance reads/writes available by adding the forensic control columns and
  // journals idempotently; this never rewrites existing financial records.
  try {
    const financeColumns = [
      ['receivedBy', 'TEXT'], ['receivedByUserId', 'TEXT'], ['receivingAccount', 'TEXT'],
      ['proofPaymentUrl', 'TEXT'], ['proofOriginalName', 'TEXT'], ['proofMimeType', 'TEXT'],
      ['proofUploadedAt', 'TIMESTAMP(3)'], ['recordedAt', 'TIMESTAMP(3)'], ['postedAt', 'TIMESTAMP(3)'],
      ['approvalStatus', 'TEXT NOT NULL DEFAULT \'NotRequired\''], ['approvedBy', 'TEXT'],
      ['approvedAt', 'TIMESTAMP(3)'], ['approvalNote', 'TEXT'], ['isVoided', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['voidReason', 'TEXT'], ['voidedAt', 'TIMESTAMP(3)'], ['voidedBy', 'TEXT'], ['linkedInvoiceId', 'TEXT'],
    ];
    for (const [column, type] of financeColumns) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
    }
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "invoices_approvalStatus_idx" ON "invoices"("approvalStatus")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payment_allocations" (
        "id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL, "invoiceId" TEXT NOT NULL,
        "amount" DECIMAL(18,2) NOT NULL, "allocatedBy" TEXT NOT NULL,
        "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "isReversed" BOOLEAN NOT NULL DEFAULT FALSE, "reversedAt" TIMESTAMP(3),
        "reversedBy" TEXT, "reason" TEXT
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "accounting_periods" (
        "id" TEXT PRIMARY KEY, "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Open', "closedAt" TIMESTAMP(3), "closedBy" TEXT,
        "reopenedAt" TIMESTAMP(3), "reopenedBy" TEXT, "reason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payment_reviews" (
        "id" TEXT PRIMARY KEY, "receiptId" TEXT UNIQUE NOT NULL, "status" TEXT NOT NULL DEFAULT 'Open',
        "assignedTo" TEXT, "resolvedBy" TEXT, "resolvedAt" TIMESTAMP(3), "resolutionNote" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    log.boot('  Finance schema     ✓  forensic columns/journals ready');
  } catch (e: any) {
    bootIssues.push(`Finance schema: ${e?.message?.slice(0, 120) || 'unknown'}`);
    log.boot(`  Finance schema     ⚠  ${e?.message?.slice(0, 200) || 'finance schema check failed'}`);
  }

  // Keep audit_logs usable for reads and the transaction writes used across the
  // app. The initial table (migrations/add_audit_logs.sql) predates several
  // columns the Prisma AuditLog model now references — beforeData/afterData
  // snapshots, request triage fields, and the forensic source/hash chain. Old
  // databases missing these cause every audited insert (e.g. recording an
  // expense) to fail with a generic 500. This always runs before routes are
  // registered so no written record ever hits a missing column.
  try {
    if (await tableExists('audit_logs')) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "beforeData" JSONB,
        ADD COLUMN IF NOT EXISTS "afterData" JSONB,
        ADD COLUMN IF NOT EXISTS "requestId" TEXT,
        ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
        ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
        ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SERVER',
        ADD COLUMN IF NOT EXISTS "previousHash" TEXT,
        ADD COLUMN IF NOT EXISTS "eventHash" TEXT
      `);
      log.boot('  Audit schema       ✓  audit_logs columns ready');
    } else {
      log.boot('  Audit schema       —  audit_logs table not present, skipping');
    }
  } catch (e: any) {
    bootIssues.push(`Audit schema: ${e?.message?.slice(0, 120) || 'unknown'}`);
    log.boot(`  Audit schema       ⚠  ${e?.message?.slice(0, 200) || 'audit_logs schema check failed'}`);
  }

  // Databases where migration 20260802110000 never completed (incomplete Prisma
  // migration history) miss the DB-level finance guards: closed-period triggers
  // on invoices/expenses/printing_jobs, the payment
  // allocation triggers, and the duplicate-reference queue. The migration file
  // is fully idempotent (functions replaced, triggers dropped first, queue
  // upserted), so replaying it at boot is safe. Skip when both markers already
  // exist so healthy databases never rescan invoices for duplicates each boot.
  try {
    const [fnRow, queueRow] = await Promise.all([
      prisma.$queryRawUnsafe<{ fn: string | null }[]>(`SELECT to_regprocedure('dreambox_guard_closed_financial_period()') AS fn`),
      prisma.$queryRawUnsafe<{ tbl: string | null }[]>(`SELECT to_regclass('payment_reference_duplicate_queue') AS tbl`),
    ]);
    if (fnRow?.[0]?.fn && queueRow?.[0]?.tbl) {
      log.boot('  Finance guards     ✓  already applied — skipping');
    } else {
      const guardPath = path.join(__dirname, 'prisma', 'migrations', '20260802110000_finance_database_guards', 'migration.sql');
      const guardSql = readFileSync(guardPath, 'utf8');
      const statements = splitSqlStatements(guardSql);
      let ready = 0;
      for (let idx = 0; idx < statements.length; idx++) {
        try {
          await prisma.$executeRawUnsafe(statements[idx]);
          ready += 1;    } catch (e: any) {
      bootIssues.push(`Finance guards stmt ${idx + 1}: ${e?.message?.slice(0, 120)}`);
      log.boot(`  Finance guards     ⚠  stmt ${idx + 1}/${statements.length}: ${e?.message?.slice(0, 150)}`);
    }
  }
  log.boot(`  Finance guards     ${ready === statements.length ? '✓' : '⚠'}  ${ready}/${statements.length} statements applied`);
    }
  } catch (e: any) {
    bootIssues.push(`Finance guards: ${e?.message?.slice(0, 120) || 'unknown'}`);
    log.boot(`  Finance guards     ⚠  ${e?.message?.slice(0, 200) || 'finance guards check failed'}`);
  }

  // Databases where migration 20260801190000 never completed miss the audit
  // hash-chain and append-only enforcement. The migration's CREATE OR REPLACE
  // functions and DROP-then-CREATE triggers are idempotent, so replay them at
  // boot like the finance guards (its ADD CONSTRAINT statements are skipped
  // because they are not re-runnable). Healthy databases hit the marker check
  // and skip.
  const auditChainGuards: Array<{ label: string; sql: string }> = [
    { label: 'pgcrypto extension', sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto` },
    { label: 'audit baseline hashes', sql: `UPDATE "audit_logs" SET "eventHash" = encode(digest(concat_ws('|', "id", "action", "details", COALESCE("userEmail", ''), "createdAt"::text), 'sha256'), 'hex') WHERE "eventHash" IS NULL` },
    { label: 'fn dreambox_prepare_audit_event', sql: `CREATE OR REPLACE FUNCTION dreambox_prepare_audit_event() RETURNS trigger AS $$ DECLARE prior_hash TEXT; BEGIN PERFORM pg_advisory_xact_lock(hashtext('dreambox-audit-chain')); SELECT "eventHash" INTO prior_hash FROM "audit_logs" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1; NEW."previousHash" := prior_hash; NEW."eventHash" := encode(digest(concat_ws('|', COALESCE(prior_hash, ''), NEW."id", NEW."action", NEW."details", COALESCE(NEW."userId", ''), COALESCE(NEW."userEmail", ''), COALESCE(NEW."tableName", ''), COALESCE(NEW."recordId", ''), COALESCE(NEW."source", 'SERVER'), NEW."createdAt"::text, COALESCE(NEW."beforeData"::text, ''), COALESCE(NEW."afterData"::text, '')), 'sha256'), 'hex'); RETURN NEW; END; $$ LANGUAGE plpgsql` },
    { label: 'fn dreambox_prevent_audit_mutation', sql: `CREATE OR REPLACE FUNCTION dreambox_prevent_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Audit events are append-only and cannot be changed or deleted'; END; $$ LANGUAGE plpgsql` },
    { label: 'trigger audit_logs_prepare_event', sql: `DROP TRIGGER IF EXISTS "audit_logs_prepare_event" ON "audit_logs"; CREATE TRIGGER "audit_logs_prepare_event" BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION dreambox_prepare_audit_event()` },
    { label: 'trigger audit_logs_append_only', sql: `DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs"; CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION dreambox_prevent_audit_mutation()` },
    { label: 'audit_logs_source_idx', sql: `CREATE INDEX IF NOT EXISTS "audit_logs_source_idx" ON "audit_logs"("source")` },
  ];
  let auditChainReady = 0;
  for (const step of auditChainGuards) {
    try {
      await prisma.$executeRawUnsafe(step.sql);
      auditChainReady += 1;
    } catch (e: any) {
      bootIssues.push(`Audit chain ${step.label}: ${e?.message?.slice(0, 120)}`);
      log.boot(`  Audit chain        ⚠  ${step.label}: ${e?.message?.slice(0, 160)}`);
    }
  }
  log.boot(`  Audit chain        ✓  ${auditChainReady}/${auditChainGuards.length} guards ready`);

  // Field Operations reads/writes the field_reports table via the Prisma client.
  // It arrived in the same migration batch as crm_tasks.automationKey, so
  // databases with incomplete Prisma history miss the table AND its two enum
  // types, making /api/field-reports 500 (P2021). Each guard runs independently
  // (same philosophy as the auth guards) and each statement is its own
  // $executeRawUnsafe call because the extended protocol rejects multi-statement.
  const fieldSchemaGuards: Array<{ label: string; sql: string }> = [
    { label: 'enum FieldReportType', sql: `DO $$ BEGIN CREATE TYPE "FieldReportType" AS ENUM ('CheckIn', 'CampaignProof', 'Issue'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
    { label: 'enum FieldReportStatus', sql: `DO $$ BEGIN CREATE TYPE "FieldReportStatus" AS ENUM ('Pending', 'Submitted', 'Resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;` },
    { label: 'field_reports table', sql: `CREATE TABLE IF NOT EXISTS "field_reports" ("id" TEXT NOT NULL, "type" "FieldReportType" NOT NULL, "billboardId" TEXT NOT NULL, "contractId" TEXT, "note" TEXT, "photoUrl" TEXT, "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, "accuracy" DOUBLE PRECISION, "status" "FieldReportStatus" NOT NULL DEFAULT 'Submitted', "reportedBy" TEXT NOT NULL, "reportedByEmail" TEXT, "capturedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id"))` },
    { label: 'field_reports_billboardId_idx', sql: `CREATE INDEX IF NOT EXISTS "field_reports_billboardId_idx" ON "field_reports"("billboardId")` },
    { label: 'field_reports_contractId_idx', sql: `CREATE INDEX IF NOT EXISTS "field_reports_contractId_idx" ON "field_reports"("contractId")` },
    { label: 'field_reports_status_idx', sql: `CREATE INDEX IF NOT EXISTS "field_reports_status_idx" ON "field_reports"("status")` },
    { label: 'field_reports_capturedAt_idx', sql: `CREATE INDEX IF NOT EXISTS "field_reports_capturedAt_idx" ON "field_reports"("capturedAt")` },
  ];
  let fieldGuardsReady = 0;
  for (const step of fieldSchemaGuards) {
    try {
      await prisma.$executeRawUnsafe(step.sql);
      fieldGuardsReady += 1;
    } catch (e: any) {
      bootIssues.push(`Field schema ${step.label}: ${e?.message?.slice(0, 120)}`);
      log.boot(`  Field schema        ⚠  ${step.label}: ${e?.message?.slice(0, 160)}`);
    }
  }
  log.boot(`  Field schema        ✓  ${fieldGuardsReady}/${fieldSchemaGuards.length} guards ready`);

  // Bootstrap: ensure InvoiceType enum includes all values from Prisma schema.
  // The production DB enum may be missing newer values (e.g. 'Proforma').
  // The QuoteStatus enum is now handled by prisma/migrations/20260619043336_add_quotestatus_enum
  try {
    await prisma.$queryRawUnsafe(`ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'Proforma'`);
  } catch (_e) {
    // Ignore — the type may not exist yet or this is a replica
  }

  // Guard failures remain warnings until they leave a required integrity marker
  // absent. This catches migrations that intentionally skip a trigger on an
  // incomplete legacy table and prevents serving unsafe writes in that state.
  const integrityReadiness = await verifyRequiredIntegrityReadiness();
  if (!integrityReadiness.ready) {
    startupReadiness.schema = 'blocked';
    bootIssues.push(`Required schema integrity missing: ${integrityReadiness.missing.join(', ')}`);
    log.error('Required schema integrity is incomplete; routes will not be registered', {
      missing: integrityReadiness.missing,
    });
    return { bootIssues, migrationsReady: true, schemaReady: false };
  }

  startupReadiness.schema = 'ready';
  return { bootIssues, migrationsReady: true, schemaReady: true };
}

// Health check — tests process liveness, DB connectivity, and canonical schema readiness.
export async function getHealthResponse(): Promise<{ status: number; body: Record<string, unknown> }> {
  const ts = Date.now();
  const maintenance = isMaintenanceActive();
  const maintenanceUntil = maintenance ? maintenanceUntilMs() : null;
  const maintenanceUntilIso = maintenanceUntil ? new Date(maintenanceUntil).toISOString() : null;
  const healthBody = { ts, maintenance, ...(maintenanceUntilIso ? { maintenanceUntil: maintenanceUntilIso } : {}) };
  if (!process.env.DATABASE_URL) {
    return { status: 503, body: { status: 'degraded', db: 'not_configured', ...healthBody } };
  }
  const readiness = getDatabaseReadiness();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB health timeout')), 5000)),
    ]);
    if (!readiness.ready) {
      log.error(`[health] Database reachable but migration readiness is ${readiness.migrations}/${readiness.schema}`);
      return {
        status: 503,
        body: {
          status: 'degraded',
          db: 'connected',
          migrations: readiness.migrations,
          schema: readiness.schema,
          ...healthBody,
        },
      };
    }
    return {
      status: 200,
      body: { status: 'ok', db: 'connected', migrations: readiness.migrations, schema: readiness.schema, ...healthBody },
    };
  } catch (e: any) {
    log.error(`[health] DB check failed: ${e?.message}`);
    return {
      status: 503,
      body: {
        status: 'degraded',
        db: 'unreachable',
        migrations: readiness.migrations,
        schema: readiness.schema,
        error: e?.message?.slice(0, 100),
        ...healthBody,
      },
    };
  }
}

app.get('/health', async (_req, res) => {
  const health = await getHealthResponse();
  return res.status(health.status).json(health.body);
});

// ─── Dynamic API route registration ──────────────────────────────────────────

async function registerRoutes() {
  log.boot('Registering API routes...');

  // Auth
  const signin       = await import('./api/auth/signin.js');
  const signout      = await import('./api/auth/signout.js');
  const signup       = await import('./api/auth/signup.js');
  const me           = await import('./api/auth/me.js');
  const resetPw      = await import('./api/auth/reset-password.js');
  const updatePw     = await import('./api/auth/update-password.js');
  const resendVerify = await import('./api/auth/resend-verification.js');
  const tfaSetup     = await import('./api/auth/two-factor/setup.js');
  const tfaEnable    = await import('./api/auth/two-factor/enable.js');
  const tfaDisable   = await import('./api/auth/two-factor/disable.js');
  const tfaVerify    = await import('./api/auth/two-factor/verify.js');

  app.all('/api/auth/signin',                adapt(signin,       'auth/signin'));
  app.all('/api/auth/signout',               adapt(signout,      'auth/signout'));
  app.all('/api/auth/signup',                adapt(signup,       'auth/signup'));
  app.all('/api/auth/me',                    adapt(me,           'auth/me'));
  app.all('/api/auth/reset-password',        adapt(resetPw,      'auth/reset-password'));
  app.all('/api/auth/update-password',       adapt(updatePw,     'auth/update-password'));
  app.all('/api/auth/resend-verification',   adapt(resendVerify, 'auth/resend-verification'));
  app.all('/api/auth/two-factor/setup',      adapt(tfaSetup,     'auth/two-factor/setup'));
  app.all('/api/auth/two-factor/enable',     adapt(tfaEnable,    'auth/two-factor/enable'));
  app.all('/api/auth/two-factor/disable',    adapt(tfaDisable,   'auth/two-factor/disable'));
  app.all('/api/auth/two-factor/verify',     adapt(tfaVerify,    'auth/two-factor/verify'));
  log.boot('  Auth routes        ✓  (signin, signout, signup, me, reset-password, update-password, resend-verification, two-factor)');

  // Public resources
  const publicBillboards = await import('./api/public-billboards.js');
  const publicProfile    = await import('./api/public-profile.js');
  const publicLead       = await import('./api/public-lead.js');
  const geocode          = await import('./api/geocode.js');

  app.all('/api/public-billboards', adapt(publicBillboards, 'public-billboards'));
  app.all('/api/public-profile',    adapt(publicProfile,    'public-profile'));
  // Website lead form (CRM opportunity + admin email). Kept public so it works
  // through the maintenance gate — the maintenance middleware already allowlists it.
  app.all('/api/public-lead',       adapt(publicLead,       'public-lead'));
  app.all('/api/geocode',           adapt(geocode,          'geocode'));
  log.boot('  Public routes      ✓  (public-billboards, public-profile, public-lead, geocode)');

  // Core resources
  const auditLogs    = await import('./api/audit-logs.js');
  const billboards   = await import('./api/billboards.js');
  const clients      = await import('./api/clients.js');
  const contracts    = await import('./api/contracts.js');
  const invoices     = await import('./api/invoices.js');
  const paymentLinks = await import('./api/payment-links.js');
  const expenses     = await import('./api/expenses.js');
  const financeReport = await import('./api/finance-report.js');
  const financeReconciliation = await import('./api/finance-reconciliation.js');
  const tasks        = await import('./api/tasks.js');
  const maintenance  = await import('./api/maintenance.js');
  const printingJobs      = await import('./api/printing-jobs.js');
  const companyProf       = await import('./api/company-profile.js');
  const users             = await import('./api/users.js');
  const ai                = await import('./api/ai.js');
  const contractAmendments = await import('./api/contract-amendments.js');
  const backup             = await import('./api/backup.js');
  const uploadImage        = await import('./api/upload-image.js');
  const uploadPaymentProof = await import('./api/upload-payment-proof.js');
  const paymentProof       = await import('./api/payment-proof.js');
  const paymentControls    = await import('./api/payment-controls.js');
  const accountingPeriods  = await import('./api/accounting-periods.js');
  const logoProxy          = await import('./api/logo-proxy.js');
  const today              = await import('./api/today.js');
  const fieldReports       = await import('./api/field-reports.js');

  app.all('/api/billboards',            adapt(billboards,          'billboards'));
  app.all('/api/backup',                adapt(backup,              'backup'));
  app.all('/api/clients',               adapt(clients,             'clients'));
  app.all('/api/audit-logs',            adapt(auditLogs,           'audit-logs'));
  app.all('/api/contracts',             adapt(contracts,           'contracts'));
  app.all('/api/contract-amendments',   adapt(contractAmendments,  'contract-amendments'));
  app.all('/api/invoices',              adapt(invoices,            'invoices'));
  app.all('/api/payment-links',         adapt(paymentLinks,        'payment-links'));

  // Quotation events (activity timeline)
  const quotationEvents = await import('./api/quotation-events.js');
  app.all('/api/quotation-events',       adapt(quotationEvents,     'quotation-events'));
  app.all('/api/expenses',              adapt(expenses,            'expenses'));
  app.all('/api/finance-report',         adapt(financeReport,       'finance-report'));
  app.all('/api/finance-reconciliation', adapt(financeReconciliation, 'finance-reconciliation'));
  app.all('/api/tasks',                 adapt(tasks,               'tasks'));
  app.all('/api/maintenance',           adapt(maintenance,         'maintenance'));
  app.all('/api/printing-jobs',         adapt(printingJobs,        'printing-jobs'));
  app.all('/api/company-profile',       adapt(companyProf,         'company-profile'));
  app.all('/api/upload-image',          adapt(uploadImage,         'upload-image'));
  app.all('/api/upload-payment-proof',  adapt(uploadPaymentProof,  'upload-payment-proof'));
  app.all('/api/payment-proof',         adapt(paymentProof,        'payment-proof'));
  app.all('/api/payment-controls',      adapt(paymentControls,     'payment-controls'));
  app.all('/api/accounting-periods',    adapt(accountingPeriods,   'accounting-periods'));
  app.all('/api/logo-proxy',            adapt(logoProxy,           'logo-proxy'));
  app.all('/api/users',                 adapt(users,               'users'));
  app.all('/api/ai',                    adapt(ai,                  'ai'));
  app.all('/api/today',                 adapt(today,                'today'));
  app.all('/api/field-reports',         adapt(fieldReports,         'field-reports'));
  log.boot('  Core routes        ✓  (billboards, clients, contracts, contract-amendments, invoices, expenses, tasks, maintenance, printing-jobs, company-profile, users, ai, today, field-reports)');

  // CRM
  const crmCompanies     = await import('./api/crm/companies.js');
  const crmContacts      = await import('./api/crm/contacts.js');
  const crmOpportunities = await import('./api/crm/opportunities.js');
  const crmTouchpoints   = await import('./api/crm/touchpoints.js');
  const crmTasks         = await import('./api/crm/tasks.js');
  const crmEmailThreads  = await import('./api/crm/email-threads.js');
  const crmCallLogs      = await import('./api/crm/call-logs.js');
  const crmAutomation    = await import('./api/crm/automation.js');

  app.all('/api/crm/companies',      adapt(crmCompanies,     'crm/companies'));
  app.all('/api/crm/contacts',       adapt(crmContacts,      'crm/contacts'));
  app.all('/api/crm/opportunities',  adapt(crmOpportunities, 'crm/opportunities'));
  app.all('/api/crm/touchpoints',    adapt(crmTouchpoints,   'crm/touchpoints'));
  app.all('/api/crm/tasks',          adapt(crmTasks,         'crm/tasks'));
  app.all('/api/crm/email-threads',  adapt(crmEmailThreads,  'crm/email-threads'));
  app.all('/api/crm/call-logs',      adapt(crmCallLogs,      'crm/call-logs'));
  app.all('/api/crm/automation',     adapt(crmAutomation,    'crm/automation'));
  log.boot('  CRM routes         ✓  (companies, contacts, opportunities, touchpoints, tasks, email-threads, call-logs, automation)');

  // Documents
  const sendDocEmail = await import('./api/documents/send-email.js');
  app.all('/api/documents/send-email', adapt(sendDocEmail, 'documents/send-email'));
  log.boot('  Document routes    ✓  (send-email)');

  // Cron
  const expenseReport = await import('./api/cron/expense-report.js');
  const backupCron    = await import('./api/cron/backup.js');
  const backOnlineCron = await import('./api/cron/back-online.js');
  const expireQuotations = await import('./api/cron/expire-quotations.js');
  const healthCheckCron = await import('./api/cron/health-check.js');
  const contractExpiryCron = await import('./api/cron/contract-expiry.js');
  app.all('/api/cron/expense-report',      adapt(expenseReport,      'cron/expense-report'));
  app.all('/api/cron/backup',              adapt(backupCron,         'cron/backup'));
  app.all('/api/cron/back-online',         adapt(backOnlineCron,     'cron/back-online'));
  app.all('/api/cron/expire-quotations',   adapt(expireQuotations,   'cron/expire-quotations'));
  app.all('/api/cron/health-check',        adapt(healthCheckCron,    'cron/health-check'));
  app.all('/api/cron/contract-expiry',     adapt(contractExpiryCron, 'cron/contract-expiry'));
  log.boot('  Cron routes        ✓  (expense-report, backup, back-online, expire-quotations, health-check, contract-expiry)');

  // 404 handler for unknown /api/* routes
  app.use('/api/{*splat}', (req, res) => {
    log.warn(`404 No handler for ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `No API route: ${req.method} ${req.originalUrl}` });
  });

  log.boot('All routes registered.');
}

// ─── Static SPA fallback ─────────────────────────────────────────────────────

function serveStatic() {
  const distPath = path.join(__dirname, 'dist');
  // Hashed build assets: cache forever, and 404 when missing — falling through to
  // index.html serves text/html for module scripts, which breaks stale clients and
  // gets cached at the CDN edge under the asset URL.
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }), (_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });
  app.use(express.static(distPath, { index: false }));
  // SPA: all non-API routes return index.html, never cached so new deploys
  // (with new asset hashes) are picked up immediately.
  app.get('/{*splat}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
  log.boot(`  Static files       ✓  serving from ${distPath}`);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function registerShutdownHandlers() {
  const shutdown = async (signal: string) => {
    log.warn(`Received ${signal} — shutting down gracefully...`);
    if (httpServer) {
      await new Promise<void>(resolve => httpServer!.close(() => resolve()));
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection', { reason });
    process.exit(1);
  });
}

	// ─── Cron Scheduler (runs inside the server process) ─────────────────────────

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
// Back-online notification fires when the *env-driven* maintenance window ends.
// MAINTENANCE_UNTIL is authoritative when set; the constant is only a fallback.
const LEGACY_MAINTENANCE_END = new Date('2026-06-19T10:00:00Z'); // 12:00 CAT

function startCronScheduler() {
  const cleanupRateLimits = async () => {
    try {
      const result = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
      if (result.count > 0) log.info(`[cron] removed ${result.count} expired rate-limit keys`);
    } catch (e: any) {
      log.warn(`[cron] rate-limit cleanup failed: ${e?.message}`);
    }
  };
  setTimeout(cleanupRateLimits, 60_000);
  setInterval(cleanupRateLimits, 24 * 60 * 60 * 1000);
  log.boot('  Cron scheduler     ✓  expired rate-limit cleanup daily');

  // ─── Ops health check + 5xx spike monitor (every 5 minutes) ──────────────
  const fireHealthCheck = async () => {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/cron/health-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.healthy === false) log.warn('[cron] health check: degraded — admin notified');
    } catch (e: any) {
      log.error(`[cron] health check failed: ${e?.message}`);
    }
  };
  setTimeout(fireHealthCheck, 15_000);
  setInterval(fireHealthCheck, FIVEXX_WINDOW_MS);
  setInterval(checkFiveXxSpike, FIVEXX_WINDOW_MS);
  log.boot('  Cron scheduler     ✓  health-check + 5xx monitor every 5 min');

  // Fire expense report email to Brian every 3 days
  log.boot(`  Cron scheduler     ✓  expense-report every 3 days`);

  const fireExpenseReport = async () => {
    try {
      log.info('[cron] Triggering expense-report...');
      const res = await fetch(`http://localhost:${PORT}/api/cron/expense-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
      });
      const data = await res.json();
      log.info(`[cron] expense-report result: ${JSON.stringify(data)}`);
    } catch (e: any) {
      log.error(`[cron] expense-report failed: ${e?.message}`);
    }
  };

  // Run expense report once on startup after a short delay, then every 3 days
  setTimeout(fireExpenseReport, 30_000);
  setInterval(fireExpenseReport, THREE_DAYS_MS);

  // ─── Quotation expiry sweep (daily) ──────────────────────────────────────
  const DAY_MS = 24 * 60 * 60 * 1000;

  const fireQuotationExpiry = async () => {
    try {
      log.info('[cron] Triggering expire-quotations...');
      const res = await fetch(`http://localhost:${PORT}/api/cron/expire-quotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
      });
      const data = await res.json();
      log.info(`[cron] expire-quotations result: ${JSON.stringify(data)}`);
    } catch (e: any) {
      log.error(`[cron] expire-quotations failed: ${e?.message}`);
    }
  };

  // Run once shortly after boot, then every day
  setTimeout(fireQuotationExpiry, 45_000);
  setInterval(fireQuotationExpiry, DAY_MS);
  log.boot('  Cron scheduler     ✓  expire-quotations daily');

  // ─── Contract expiry reminders (daily) ──────────────────────────────────
  const fireContractExpiry = async () => {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/cron/contract-expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      });
      const data = await res.json();
      log.info(`[cron] contract-expiry: ${JSON.stringify(data)}`);
    } catch (e: any) {
      log.error(`[cron] contract-expiry failed: ${e?.message}`);
    }
  };
  setTimeout(fireContractExpiry, 90_000);
  setInterval(fireContractExpiry, DAY_MS);
  log.boot('  Cron scheduler     ✓  contract-expiry daily');

  // ─── Back-online notification at maintenance end time ──────────────────────
  const maintenanceUntil = process.env.MAINTENANCE_UNTIL;
  const parsedUntil = maintenanceUntil ? Date.parse(maintenanceUntil) : NaN;
  const target = Number.isNaN(parsedUntil) ? LEGACY_MAINTENANCE_END : new Date(parsedUntil);
  const now = Date.now();
  const targetMs = target.getTime();
  const rawDelayMs = targetMs - now;
  const delayMs = rawDelayMs + 5_000; // 5s grace after target

  if (rawDelayMs > 0 && delayMs < 86_400_000) {
    // Only schedule if the target is within the next 24 hours
    setTimeout(async () => {
      log.boot(`  Back-online        →  maintenance end reached, notifying users...`);
      try {
        const res = await fetch(`http://localhost:${PORT}/api/cron/back-online`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.CRON_SECRET || '',
          },
        });
        const data = await res.json();
        log.boot(`  Back-online        ✓  notified ${data.sent}/${data.total} users`);
      } catch (e: any) {
        log.boot(`  Back-online        ⚠  ${e?.message?.slice(0, 120) || 'failed'}`);
      }
    }, delayMs);
    log.boot(`  Back-online        ✓  scheduled for ${target.toISOString()} (in ${Math.round(delayMs / 1000 / 60)} min)`);
  } else {
    log.boot(`  Back-online        —  target already passed or too far away`);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const migrationResult = await runMigrations();
  if (!migrationResult.schemaReady) {
    throw new Error('Required schema integrity checks failed; refusing to register routes');
  }
  if (migrationResult.bootIssues.length > 0) {
    notifyAdminOpsAlert('Boot schema self-heal issues', [
      { title: `${migrationResult.bootIssues.length} guard(s) failed to apply`, lines: migrationResult.bootIssues.slice(0, 20) },
    ]);
    log.warn(`[boot] ${migrationResult.bootIssues.length} schema guard issue(s) — admin notified`);
  }
  await registerRoutes();
  serveStatic();
  // Global error handler must come after routes
  app.use(errorHandler);
  httpServer = app.listen(PORT, () => {
    logStartupInfo(PORT);
    if (process.env.CRON_SCHEDULER_ENABLED !== 'false') {
      startCronScheduler();
    } else {
      log.boot('  Cron scheduler     —  disabled by CRON_SCHEDULER_ENABLED=false');
    }
  });
}

if (process.env.NODE_ENV !== 'test') {
  registerShutdownHandlers();
  startServer().catch((e) => {
    log.error('Failed to start server', { message: e?.message, stack: e?.stack });
    process.exit(1);
  });
}
