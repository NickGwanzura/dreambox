import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  const log = { boot: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $disconnect: vi.fn(),
  };
  return { execSync: vi.fn(), log, prisma };
});

const readyIntegrityMarkers = {
  bookingFunction: true,
  bookingTrigger: true,
  financeGuardFunction: true,
  financeQueue: true,
  auditPrepareFunction: true,
  invoicesPeriodTrigger: true,
  expensesPeriodTrigger: true,
  printingJobsPeriodTrigger: true,
  paymentAllocationsActiveTrigger: true,
  invoicesAllocationStateTrigger: true,
  auditPrepareTrigger: true,
  auditAppendOnlyTrigger: true,
};

vi.mock('dotenv/config', () => ({}));
vi.mock('child_process', () => ({ execSync: state.execSync }));
vi.mock('../lib/prisma.js', () => ({ prisma: state.prisma }));
vi.mock('../lib/notifyAdmin.js', () => ({ notifyAdminOpsAlert: vi.fn() }));
vi.mock('../lib/serverLogger.js', () => ({
  log: state.log,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
  errorHandler: (_err: unknown, _req: unknown, res: any, _next: unknown) => res.status(500).json({ error: 'Internal server error' }),
  logStartupInfo: vi.fn(),
}));

describe('server migration readiness', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.execSync.mockReset();
    state.execSync.mockReturnValue(undefined);
    state.prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    state.prisma.$queryRawUnsafe.mockImplementation(async (sql: unknown) =>
      String(sql).includes('bookingFunction') ? [readyIntegrityMarkers] : []
    );
    state.prisma.$executeRawUnsafe.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('keeps no-DATABASE_URL startup and health behavior degraded without running migrations', async () => {
    delete process.env.DATABASE_URL;
    const { getDatabaseReadiness, getHealthResponse, runMigrations } = await import('../server');

    await expect(runMigrations()).resolves.toEqual({ bootIssues: [], migrationsReady: false, schemaReady: false });
    expect(state.execSync).not.toHaveBeenCalled();
    expect(getDatabaseReadiness()).toMatchObject({ migrations: 'not_configured', schema: 'not_configured', ready: false });

    const health = await getHealthResponse();
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ status: 'degraded', db: 'not_configured' });
  });

  it('fails migration startup and reports a reachable but schema-blocked database as degraded', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    state.execSync.mockImplementation(() => {
      const error: any = new Error('migration deployment failed');
      error.stderr = Buffer.from('migration deployment failed');
      throw error;
    });
    const { getDatabaseReadiness, getHealthResponse, runMigrations, startServer } = await import('../server');

    await expect(runMigrations()).rejects.toThrow('Prisma migrations failed; refusing to start');
    await expect(startServer()).rejects.toThrow('Prisma migrations failed; refusing to start');
    expect(getDatabaseReadiness()).toMatchObject({ migrations: 'failed', schema: 'blocked', ready: false });

    const health = await getHealthResponse();
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({
      status: 'degraded',
      db: 'connected',
      migrations: 'failed',
      schema: 'blocked',
    });
  });

  it('reports configured database health only after canonical migrations are ready', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    const { getDatabaseReadiness, getHealthResponse, runMigrations } = await import('../server');

    await expect(runMigrations()).resolves.toMatchObject({ migrationsReady: true, schemaReady: true });
    expect(state.execSync).toHaveBeenCalledWith('npx prisma migrate deploy', expect.any(Object));
    expect(getDatabaseReadiness()).toMatchObject({ migrations: 'ready', schema: 'ready', ready: true });

    const health = await getHealthResponse();
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok', db: 'connected', migrations: 'ready', schema: 'ready' });
  });

  it('blocks startup and reports schema readiness as blocked when a required trigger is absent', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    state.prisma.$queryRawUnsafe.mockImplementation(async (sql: unknown) =>
      String(sql).includes('bookingFunction') ? [{ ...readyIntegrityMarkers, bookingTrigger: false }] : []
    );
    const { getDatabaseReadiness, getHealthResponse, runMigrations, startServer } = await import('../server');

    await expect(runMigrations()).resolves.toMatchObject({ migrationsReady: true, schemaReady: false });
    await expect(startServer()).rejects.toThrow('Required schema integrity checks failed');
    expect(getDatabaseReadiness()).toMatchObject({ migrations: 'ready', schema: 'blocked', ready: false });

    const health = await getHealthResponse();
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ status: 'degraded', db: 'connected', migrations: 'ready', schema: 'blocked' });
  });

  it('blocks startup when an accounting-period trigger is disabled', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    state.prisma.$queryRawUnsafe.mockImplementation(async (sql: unknown) =>
      String(sql).includes('bookingFunction') ? [{ ...readyIntegrityMarkers, invoicesPeriodTrigger: false }] : []
    );
    const { runMigrations, startServer } = await import('../server');

    await expect(runMigrations()).resolves.toMatchObject({ migrationsReady: true, schemaReady: false });
    await expect(startServer()).rejects.toThrow('Required schema integrity checks failed');
  });

  it('blocks startup when an audit trigger is bound to the wrong function', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    state.prisma.$queryRawUnsafe.mockImplementation(async (sql: unknown) =>
      String(sql).includes('bookingFunction') ? [{ ...readyIntegrityMarkers, auditPrepareTrigger: false }] : []
    );
    const { runMigrations, startServer } = await import('../server');

    await expect(runMigrations()).resolves.toMatchObject({ migrationsReady: true, schemaReady: false });
    await expect(startServer()).rejects.toThrow('Required schema integrity checks failed');
  });

  it('checks exact trigger relation/function OIDs and canonical semantics for every required trigger', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/dreambox';
    const { runMigrations } = await import('../server');

    await runMigrations();

    const readinessQuery = state.prisma.$queryRawUnsafe.mock.calls
      .map(([sql]: [unknown]) => String(sql))
      .find(sql => sql.includes('contracts_booking_integrity_guard'));
    expect(readinessQuery).toContain('pg_get_triggerdef(trigger.oid, true) AS definition');
    expect(readinessQuery).toContain("trigger.tgenabled IN ('O', 'A')");
    for (const [trigger, table, fn, definition] of [
      ['contracts_booking_integrity_guard', 'contracts', 'dreambox_prevent_overlapping_contract_booking', 'BEFORE INSERT OR UPDATE ON'],
      ['invoices_closed_accounting_period_guard', 'invoices', 'dreambox_guard_closed_financial_period', 'BEFORE INSERT OR UPDATE ON'],
      ['expenses_closed_accounting_period_guard', 'expenses', 'dreambox_guard_closed_financial_period', 'BEFORE INSERT OR UPDATE ON'],
      ['printing_jobs_closed_accounting_period_guard', 'printing_jobs', 'dreambox_guard_closed_financial_period', 'BEFORE INSERT OR UPDATE ON'],
      ['payment_allocations_active_guard', 'payment_allocations', 'dreambox_guard_active_payment_allocation', 'BEFORE INSERT OR UPDATE ON'],
      ['invoices_payment_allocation_state_guard', 'invoices', 'dreambox_guard_document_allocation_state', 'BEFORE UPDATE OF'],
      ['audit_logs_prepare_event', 'audit_logs', 'dreambox_prepare_audit_event', 'BEFORE INSERT ON'],
      ['audit_logs_append_only', 'audit_logs', 'dreambox_prevent_audit_mutation', 'BEFORE UPDATE OR DELETE ON'],
    ]) {
      expect(readinessQuery).toContain(`trigger.tgname = '${trigger}'`);
      expect(readinessQuery).toContain(`trigger.tgrelid = to_regclass('${table}')`);
      expect(readinessQuery).toContain(`trigger.tgfoid = to_regprocedure('${fn}()')`);
      expect(readinessQuery).toContain(definition);
    }
    expect(readinessQuery).toContain('FOR EACH ROW EXECUTE FUNCTION');
    expect(readinessQuery).toContain('"?type"?[[:space:]]*,[[:space:]]*"?isVoided"?');
    expect(readinessQuery).toContain('BEFORE DELETE OR UPDATE ON');
  });
});
