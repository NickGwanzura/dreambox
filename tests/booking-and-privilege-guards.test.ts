import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => {
  const prisma: any = {
    companyProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    contractAmendment: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    client: { findUnique: vi.fn() },
    billboard: { findUnique: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    quotationEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  return {
    prisma,
    auth: { requireAuth: vi.fn(), requireManagerOrAdmin: vi.fn(), requireDeletePermission: vi.fn(), requireQuotationApprovePermission: vi.fn(), cors: vi.fn() },
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);
vi.mock('../lib/serverLogger.js', () => ({ log: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/uploadBase64', () => ({ uploadBase64Image: vi.fn(), isBase64DataUrl: vi.fn() }));

import companyProfileHandler from '../api/company-profile';
import contractAmendmentsHandler from '../api/contract-amendments';
import contractsHandler from '../api/contracts';

const manager = { userId: 'manager-1', email: 'manager@example.com', role: 'Manager' };
const activeSideContract = {
  clientId: 'client-1', billboardId: 'billboard-1', startDate: '2026-08-01', endDate: '2026-08-31',
  monthlyRate: 100, totalContractValue: 100, status: 'Active', side: 'A',
};

function request(overrides: Partial<HttpRequest>): HttpRequest {
  return { headers: {}, query: {}, ...overrides } as HttpRequest;
}

function response() {
  let statusCode = 0;
  let payload: any;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn((body: unknown) => { payload = body; return res; }),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    payload: { get: () => payload },
  });
  return res as HttpResponse & { statusCode: number; payload: any };
}

function amendmentBody() {
  return {
    contractId: 'contract-1', type: 'extension', oldStartDate: '2026-01-01', oldEndDate: '2026-06-30',
    newStartDate: '2026-01-01', newEndDate: '2026-12-31', oldMonthlyRate: 100, newMonthlyRate: 100,
    oldTotalValue: 600, newTotalValue: 1200, monthsChanged: 6, financialImpact: 600,
  };
}

describe('privileged settings and amendment writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireAuth.mockResolvedValue(manager);
    state.auth.requireManagerOrAdmin.mockResolvedValue(manager);
    state.auth.requireQuotationApprovePermission.mockResolvedValue(manager);
    state.prisma.$queryRaw.mockResolvedValue([]);
    state.prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
    state.prisma.billboard.findUnique.mockResolvedValue({ id: 'billboard-1' });
    state.prisma.contract.findFirst.mockResolvedValue(null);
  });

  it('does not allow an ordinary authenticated request to update company payment settings', async () => {
    state.auth.requireManagerOrAdmin.mockResolvedValue(null);
    const res = response();

    await companyProfileHandler(request({ method: 'PUT', body: { name: 'Dreambox', bankAccountNumber: 'secret' } }), res);

    expect(state.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(state.prisma.companyProfile.upsert).not.toHaveBeenCalled();
  });

  it('does not create a financial amendment when manager/admin authorization fails', async () => {
    state.auth.requireManagerOrAdmin.mockResolvedValue(null);
    const res = response();

    await contractAmendmentsHandler(request({ method: 'POST', body: amendmentBody() }), res);

    expect(state.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(state.prisma.contractAmendment.create).not.toHaveBeenCalled();
    expect(state.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not delete a financial amendment when manager/admin authorization fails', async () => {
    state.auth.requireManagerOrAdmin.mockResolvedValue(null);
    const res = response();

    await contractAmendmentsHandler(request({ method: 'DELETE', query: { id: 'amendment-1' } }), res);

    expect(state.auth.requireManagerOrAdmin).toHaveBeenCalledOnce();
    expect(state.prisma.contractAmendment.delete).not.toHaveBeenCalled();
    expect(state.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('records a server-side audit entry with an amendment creation', async () => {
    const created = { id: 'amendment-1', ...amendmentBody(), createdAt: new Date('2026-08-09T00:00:00.000Z') };
    state.prisma.contractAmendment.create.mockResolvedValue(created);
    const res = response();

    await contractAmendmentsHandler(request({ method: 'POST', body: amendmentBody() }), res);

    expect(res.statusCode).toBe(201);
    expect(state.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'Contract Amendment Created', recordId: 'amendment-1', afterData: expect.any(Object) }),
    });
  });
});

describe('contract booking serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.requireAuth.mockResolvedValue(manager);
    state.auth.requireManagerOrAdmin.mockResolvedValue(manager);
    state.prisma.$queryRaw.mockResolvedValue([]);
    state.prisma.contract.findFirst.mockResolvedValue(null);
    state.prisma.contract.create.mockResolvedValue({ id: 'contract-created', ...activeSideContract });
  });

  it('takes the advisory transaction lock before checking and creating an active booking', async () => {
    const res = response();

    await contractsHandler(request({ method: 'POST', body: activeSideContract }), res);

    expect(res.statusCode).toBe(201);
    expect(state.prisma.$transaction).toHaveBeenCalledOnce();
    expect(state.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(state.prisma.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        billboardId: 'billboard-1',
        OR: [{ side: 'A' }, { side: 'Both' }],
      }),
    }));
    expect(state.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      state.prisma.contract.findFirst.mock.invocationCallOrder[0],
    );
    expect(state.prisma.contract.create).toHaveBeenCalledOnce();
  });

  it('re-checks within the lock and returns the established 409 shape without writing', async () => {
    state.prisma.contract.findFirst.mockResolvedValue({ id: 'already-booked' });
    const res = response();

    await contractsHandler(request({ method: 'POST', body: activeSideContract }), res);

    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ error: 'Side A is already booked for these dates', conflictingContract: 'already-booked' });
    expect(state.prisma.contract.create).not.toHaveBeenCalled();
  });

  it('locks and excludes the edited contract from its own overlap check', async () => {
    state.prisma.contract.findUnique.mockResolvedValue({ id: 'contract-1', ...activeSideContract });
    state.prisma.contract.update.mockResolvedValue({ id: 'contract-1', ...activeSideContract });
    const res = response();

    await contractsHandler(request({ method: 'PUT', query: { id: 'contract-1' }, body: activeSideContract }), res);

    expect(res.statusCode).toBe(200);
    expect(state.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(state.prisma.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: 'contract-1' } }),
    }));
    expect(state.prisma.contract.update).toHaveBeenCalledOnce();
  });
});

describe('booking integrity migration date validation', () => {
  it('validates active incoming dates before the lock/conflict scan and rejects reversed ranges', () => {
    const migration = readFileSync(
      new URL('../prisma/migrations/20260809100000_booking_integrity_guards/migration.sql', import.meta.url),
      'utf8',
    );
    const invalidDateGuard = migration.indexOf("RAISE EXCEPTION 'Active contracts require startDate and endDate in YYYY-MM-DD format'");
    const reversedRangeGuard = migration.indexOf("RAISE EXCEPTION 'Active contract startDate must not be after endDate'");
    const advisoryLock = migration.indexOf('PERFORM pg_advisory_xact_lock');

    expect(invalidDateGuard).toBeGreaterThan(-1);
    expect(reversedRangeGuard).toBeGreaterThan(invalidDateGuard);
    expect(migration).toContain("NEW.\"startDate\" > NEW.\"endDate\"");
    expect(migration).toContain("USING ERRCODE = '22007'");
    expect(migration).toContain("USING ERRCODE = '23514'");
    expect(advisoryLock).toBeGreaterThan(reversedRangeGuard);
    expect(migration).toContain('AND existing."startDate" <= existing."endDate"');
  });

  it('uses a guarded canonical round trip to reject impossible dates and ignore legacy invalid rows', () => {
    const migration = readFileSync(
      new URL('../prisma/migrations/20260809100000_booking_integrity_guards/migration.sql', import.meta.url),
      'utf8',
    );
    const isCanonicalIsoDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
    };

    expect(isCanonicalIsoDate('2026-13-01')).toBe(false);
    expect(isCanonicalIsoDate('2026-02-31')).toBe(false);
    expect(isCanonicalIsoDate('2026-25-01')).toBe(false);
    expect(isCanonicalIsoDate('2026-02-28')).toBe(true);
    const helperStart = migration.indexOf('CREATE OR REPLACE FUNCTION dreambox_is_canonical_contract_date');
    const helperEnd = migration.indexOf('$fn$;', helperStart);
    const helper = migration.slice(helperStart, helperEnd);
    expect(helper).toContain("to_char(to_date(p_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = p_date");
    expect(helper).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(helper).toContain('RETURN FALSE;');
    expect(migration).toContain('NOT dreambox_is_canonical_contract_date(NEW."startDate")');
    expect(migration.match(/dreambox_is_canonical_contract_date\(existing\."startDate"\)/g)).toHaveLength(2);
    expect(migration.match(/dreambox_is_canonical_contract_date\(existing\."endDate"\)/g)).toHaveLength(2);
  });
});
