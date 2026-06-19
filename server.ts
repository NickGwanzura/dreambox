/**
 * Express server for Railway deployment.
 * Serves the Vite static build + routes /api/* to Vercel-style handlers.
 */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { Request, Response } from 'express';
import { log, requestLogger, errorHandler, logStartupInfo } from './lib/serverLogger.js';
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

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security headers — CSP and COEP disabled to allow SPA import maps and CDN-loaded ES modules
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ─── Adapt Vercel handler to Express ─────────────────────────────────────────

function adapt(handlerModule: { default: Function }, routeName: string) {
  return async (req: Request, res: Response) => {
    log.debug(`Dispatching ${req.method} ${req.originalUrl} → handler:${routeName}`);
    try {
      await handlerModule.default(req as any, res as any);
    } catch (e: any) {
      log.error(`Handler error [${routeName}]: ${e?.message}`, { stack: e?.stack, code: e?.code });
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ─── Apply pending migrations on startup via Prisma Migrate ──────────────────

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    log.boot('  Migrations         —  skipped (DATABASE_URL not set)');
    return;
  }
  try {
    log.boot('  Migrations         →  running prisma migrate deploy...');
    execSync('npx prisma migrate deploy', {
      stdio: 'pipe',
      env: { ...process.env },
    });
    log.boot('  Migrations         ✓  all pending migrations applied');
  } catch (e: any) {
    // Non-fatal: log and continue; the DB may already be up-to-date
    const msg = e?.stderr?.toString?.() || e?.stdout?.toString?.() || e?.message || String(e);
    log.boot(`  Migrations         ⚠  ${msg.slice(0, 200)}`);
  }

  // Bootstrap: create native QuoteStatus enum if it doesn't exist
  // Prisma schema declares it as an enum type, but the production DB
  // used a TEXT+CHECK approach. Without this, prisma.invoice.create()
  // fails with "type 'public.QuoteStatus' does not exist".
  // This block is idempotent — safe to run on every boot.
  try {
    log.boot('  Bootstrap           →  ensuring QuoteStatus enum...');

    // 1. Create the PG enum type (safe: IF NOT EXISTS via DO block)
    await prisma.$queryRawUnsafe(
      "DO $block$ BEGIN CREATE TYPE \"QuoteStatus\" AS ENUM ('Draft','Sent','Accepted','Rejected','Expired','Converted'); EXCEPTION WHEN duplicate_object THEN NULL; END $block$;"
    );

    // 2. Check if the column still uses TEXT — if so, convert it
    const [{ exists }] = await prisma.$queryRawUnsafe<[{ exists: boolean }]>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'invoices' AND column_name = 'quoteStatus'
         AND udt_name = 'text'
       ) AS "exists"`
    );

    if (exists) {
      // Drop old default BEFORE converting the column type — otherwise PG
      // will reject the ALTER TYPE because the TEXT default can't auto-cast
      await prisma.$queryRawUnsafe(`ALTER TABLE "invoices" ALTER COLUMN "quoteStatus" DROP DEFAULT`);
      await prisma.$queryRawUnsafe(`ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_quoteStatus_check"`);
      await prisma.$queryRawUnsafe(
        `ALTER TABLE "invoices" ALTER COLUMN "quoteStatus" TYPE "QuoteStatus" USING ("quoteStatus"::text)::"QuoteStatus"`
      );
      await prisma.$queryRawUnsafe(`ALTER TABLE "invoices" ALTER COLUMN "quoteStatus" SET DEFAULT 'Draft'::"QuoteStatus"`);
      log.boot('  Bootstrap           ✓  QuoteStatus column converted');
    } else {
      log.boot('  Bootstrap           ✓  QuoteStatus enum already ready');
    }
  } catch (e: any) {
    log.boot(`  Bootstrap           ⚠  ${e?.message?.slice(0, 200) || String(e)}`);
  }
}

// Health check — tests both process liveness and DB connectivity
app.get('/health', async (_req, res) => {
  const ts = Date.now();
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ status: 'degraded', db: 'not_configured', ts });
  }
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB health timeout')), 5000)),
    ]);
    return res.json({ status: 'ok', db: 'connected', ts });
  } catch (e: any) {
    log.error(`[health] DB check failed: ${e?.message}`);
    return res.status(503).json({ status: 'degraded', db: 'unreachable', error: e?.message?.slice(0, 100), ts });
  }
});

// ─── Dynamic API route registration ──────────────────────────────────────────

async function registerRoutes() {
  log.boot('Registering API routes...');

  // Auth
  const signin       = await import('./api/auth/signin.js');
  const signup       = await import('./api/auth/signup.js');
  const me           = await import('./api/auth/me.js');
  const resetPw      = await import('./api/auth/reset-password.js');
  const updatePw     = await import('./api/auth/update-password.js');
  const resendVerify = await import('./api/auth/resend-verification.js');

  app.all('/api/auth/signin',                adapt(signin,       'auth/signin'));
  app.all('/api/auth/signup',                adapt(signup,       'auth/signup'));
  app.all('/api/auth/me',                    adapt(me,           'auth/me'));
  app.all('/api/auth/reset-password',        adapt(resetPw,      'auth/reset-password'));
  app.all('/api/auth/update-password',       adapt(updatePw,     'auth/update-password'));
  app.all('/api/auth/resend-verification',   adapt(resendVerify, 'auth/resend-verification'));
  log.boot('  Auth routes        ✓  (signin, signup, me, reset-password, update-password, resend-verification)');

  // Public resources
  const publicBillboards = await import('./api/public-billboards.js');
  const geocode          = await import('./api/geocode.js');

  app.all('/api/public-billboards', adapt(publicBillboards, 'public-billboards'));
  app.all('/api/geocode',           adapt(geocode,          'geocode'));
  log.boot('  Public routes      ✓  (public-billboards, geocode)');

  // Core resources
  const auditLogs    = await import('./api/audit-logs.js');
  const billboards   = await import('./api/billboards.js');
  const clients      = await import('./api/clients.js');
  const contracts    = await import('./api/contracts.js');
  const invoices     = await import('./api/invoices.js');
  const expenses     = await import('./api/expenses.js');
  const tasks        = await import('./api/tasks.js');
  const maintenance  = await import('./api/maintenance.js');
  const outsourced   = await import('./api/outsourced.js');
  const printingJobs      = await import('./api/printing-jobs.js');
  const companyProf       = await import('./api/company-profile.js');
  const users             = await import('./api/users.js');
  const ai                = await import('./api/ai.js');
  const contractAmendments = await import('./api/contract-amendments.js');
  const backup             = await import('./api/backup.js');
  const uploadImage        = await import('./api/upload-image.js');

  app.all('/api/billboards',            adapt(billboards,          'billboards'));
  app.all('/api/backup',                adapt(backup,              'backup'));
  app.all('/api/clients',               adapt(clients,             'clients'));
  app.all('/api/audit-logs',            adapt(auditLogs,           'audit-logs'));
  app.all('/api/contracts',             adapt(contracts,           'contracts'));
  app.all('/api/contract-amendments',   adapt(contractAmendments,  'contract-amendments'));
  app.all('/api/invoices',              adapt(invoices,            'invoices'));

  // Quotation events (activity timeline)
  const quotationEvents = await import('./api/quotation-events.js');
  app.all('/api/quotation-events',       adapt(quotationEvents,     'quotation-events'));
  app.all('/api/expenses',              adapt(expenses,            'expenses'));
  app.all('/api/tasks',                 adapt(tasks,               'tasks'));
  app.all('/api/maintenance',           adapt(maintenance,         'maintenance'));
  app.all('/api/outsourced',            adapt(outsourced,          'outsourced'));
  app.all('/api/printing-jobs',         adapt(printingJobs,        'printing-jobs'));
  app.all('/api/company-profile',       adapt(companyProf,         'company-profile'));
  app.all('/api/upload-image',          adapt(uploadImage,         'upload-image'));
  app.all('/api/users',                 adapt(users,               'users'));
  app.all('/api/ai',                    adapt(ai,                  'ai'));
  log.boot('  Core routes        ✓  (billboards, clients, contracts, contract-amendments, invoices, expenses, tasks, maintenance, outsourced, printing-jobs, company-profile, users, ai)');

  // CRM
  const crmCompanies     = await import('./api/crm/companies.js');
  const crmContacts      = await import('./api/crm/contacts.js');
  const crmOpportunities = await import('./api/crm/opportunities.js');
  const crmTouchpoints   = await import('./api/crm/touchpoints.js');
  const crmTasks         = await import('./api/crm/tasks.js');
  const crmEmailThreads  = await import('./api/crm/email-threads.js');
  const crmCallLogs      = await import('./api/crm/call-logs.js');

  app.all('/api/crm/companies',      adapt(crmCompanies,     'crm/companies'));
  app.all('/api/crm/contacts',       adapt(crmContacts,      'crm/contacts'));
  app.all('/api/crm/opportunities',  adapt(crmOpportunities, 'crm/opportunities'));
  app.all('/api/crm/touchpoints',    adapt(crmTouchpoints,   'crm/touchpoints'));
  app.all('/api/crm/tasks',          adapt(crmTasks,         'crm/tasks'));
  app.all('/api/crm/email-threads',  adapt(crmEmailThreads,  'crm/email-threads'));
  app.all('/api/crm/call-logs',      adapt(crmCallLogs,      'crm/call-logs'));
  log.boot('  CRM routes         ✓  (companies, contacts, opportunities, touchpoints, tasks, email-threads, call-logs)');

  // Documents
  const sendDocEmail = await import('./api/documents/send-email.js');
  app.all('/api/documents/send-email', adapt(sendDocEmail, 'documents/send-email'));
  log.boot('  Document routes    ✓  (send-email)');

  // Cron
  const expenseReport = await import('./api/cron/expense-report.js');
  const backupCron    = await import('./api/cron/backup.js');
  app.all('/api/cron/expense-report', adapt(expenseReport, 'cron/expense-report'));
  app.all('/api/cron/backup',         adapt(backupCron,    'cron/backup'));
  log.boot('  Cron routes        ✓  (expense-report, backup)');

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

function startCronScheduler() {
  // Fire expense report email to Brian every 3 days
  log.boot(`  Cron scheduler     ✓  expense-report every 3 days`);

  const fireExpenseReport = async () => {
    try {
      log.info('[cron] Triggering expense-report...');
      const res = await fetch(`http://localhost:${PORT}/api/cron/expense-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      log.info(`[cron] expense-report result: ${JSON.stringify(data)}`);
    } catch (e: any) {
      log.error(`[cron] expense-report failed: ${e?.message}`);
    }
  };

  // Run once on startup after a short delay, then every 3 days
  setTimeout(fireExpenseReport, 30_000);
  setInterval(fireExpenseReport, THREE_DAYS_MS);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

registerShutdownHandlers();

runMigrations()
  .then(() => registerRoutes())
  .then(() => {
    serveStatic();
    // Global error handler must come after routes
    app.use(errorHandler);
    app.listen(PORT, () => {
      logStartupInfo(PORT);
      startCronScheduler();
    });
  })
  .catch((e) => {
    log.error('Failed to start server', { message: e?.message, stack: e?.stack });
    process.exit(1);
  });
