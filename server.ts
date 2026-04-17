/**
 * Express server for Railway deployment.
 * Serves the Vite static build + routes /api/* to Vercel-style handlers.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { log, requestLogger, errorHandler, logStartupInfo } from './lib/serverLogger.js';

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

// Health check (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

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

  // Core resources
  const billboards   = await import('./api/billboards.js');
  const clients      = await import('./api/clients.js');
  const contracts    = await import('./api/contracts.js');
  const invoices     = await import('./api/invoices.js');
  const expenses     = await import('./api/expenses.js');
  const tasks        = await import('./api/tasks.js');
  const maintenance  = await import('./api/maintenance.js');
  const outsourced   = await import('./api/outsourced.js');
  const printingJobs = await import('./api/printing-jobs.js');
  const companyProf  = await import('./api/company-profile.js');
  const users        = await import('./api/users.js');
  const ai           = await import('./api/ai.js');

  app.all('/api/billboards',       adapt(billboards,   'billboards'));
  app.all('/api/clients',          adapt(clients,      'clients'));
  app.all('/api/contracts',        adapt(contracts,    'contracts'));
  app.all('/api/invoices',         adapt(invoices,     'invoices'));
  app.all('/api/expenses',         adapt(expenses,     'expenses'));
  app.all('/api/tasks',            adapt(tasks,        'tasks'));
  app.all('/api/maintenance',      adapt(maintenance,  'maintenance'));
  app.all('/api/outsourced',       adapt(outsourced,   'outsourced'));
  app.all('/api/printing-jobs',    adapt(printingJobs, 'printing-jobs'));
  app.all('/api/company-profile',  adapt(companyProf,  'company-profile'));
  app.all('/api/users',            adapt(users,        'users'));
  app.all('/api/ai',               adapt(ai,           'ai'));
  log.boot('  Core routes        ✓  (billboards, clients, contracts, invoices, expenses, tasks, maintenance, outsourced, printing-jobs, company-profile, users, ai)');

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
  app.all('/api/cron/expense-report', adapt(expenseReport, 'cron/expense-report'));
  log.boot('  Cron routes        ✓  (expense-report)');

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
  app.use(express.static(distPath));
  // SPA: all non-API routes return index.html
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  log.boot(`  Static files       ✓  serving from ${distPath}`);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function registerShutdownHandlers() {
  const shutdown = (signal: string) => {
    log.warn(`Received ${signal} — shutting down gracefully...`);
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

registerRoutes()
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
