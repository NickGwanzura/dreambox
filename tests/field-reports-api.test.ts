import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => ({
  payload: { userId: 'staff-1', email: 'staff@example.com', role: 'Staff', status: 'Active', sessionVersion: 0 },
  prisma: {
    billboard: { findUnique: vi.fn() },
    contract: { findUnique: vi.fn() },
    fieldReport: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  auth: { requireAuth: vi.fn(), cors: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/auth', () => state.auth);
vi.mock('../lib/serverLogger.js', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import handler from '../api/field-reports';

const REPORT_ID = '38a8cc3e-4e88-4c62-bb1e-d4c7bc3d1900';
const now = new Date('2026-08-03T09:00:00.000Z');

function request(overrides: Partial<HttpRequest> = {}) {
  return { method: 'POST', headers: {}, query: {}, body: {}, ...overrides } as unknown as HttpRequest;
}

function response() {
  let statusCode = 0;
  let payload: any;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn((body: any) => { payload = body; return res; }),
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    payload: { get: () => payload },
  });
  return res as HttpResponse & { statusCode: number; payload: any };
}

function checkIn(extra: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    type: 'CheckIn',
    billboardId: 'board-1',
    latitude: -17.8292,
    longitude: 31.0522,
    accuracy: 8,
    capturedAt: now.toISOString(),
    ...extra,
  };
}

function storedReport(extra: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    type: 'CheckIn',
    billboardId: 'board-1',
    contractId: null,
    note: null,
    photoUrl: null,
    latitude: -17.8292,
    longitude: 31.0522,
    accuracy: 8,
    status: 'Submitted',
    reportedBy: 'staff-1',
    reportedByEmail: 'staff@example.com',
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.payload = { userId: 'staff-1', email: 'staff@example.com', role: 'Staff', status: 'Active', sessionVersion: 0 };
  state.auth.requireAuth.mockImplementation(async () => state.payload);
  state.prisma.billboard.findUnique.mockResolvedValue({ id: 'board-1' });
  state.prisma.contract.findUnique.mockResolvedValue(null);
  state.prisma.fieldReport.findUnique.mockResolvedValue(null);
  state.prisma.fieldReport.upsert.mockImplementation(async ({ create }: any) => storedReport(create));
  state.prisma.fieldReport.update.mockImplementation(async ({ where, data }: any) => storedReport({ id: where.id, ...data }));
  state.prisma.fieldReport.findMany.mockResolvedValue([storedReport()]);
});

describe('field report API validation and identity', () => {
  it('rejects missing check-in coordinates and campaign proof without a contract', async () => {
    let res = response();
    await handler(request({ body: checkIn({ latitude: undefined, longitude: undefined }) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.details.join(' ')).toMatch(/check-in requires/i);

    res = response();
    await handler(request({ body: checkIn({ type: 'CampaignProof', latitude: undefined, longitude: undefined }) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.details.join(' ')).toMatch(/requires an active contract/i);
  });

  it('requires an issue note or durable photo and never accepts reporter identity from the client', async () => {
    let res = response();
    await handler(request({ body: checkIn({ type: 'Issue', latitude: undefined, longitude: undefined }) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.details.join(' ')).toMatch(/note or photo/i);

    res = response();
    await handler(request({ body: checkIn({ reportedBy: 'admin-pretend' }) }), res);
    expect(res.statusCode).toBe(400);
    expect(state.prisma.fieldReport.upsert).not.toHaveBeenCalled();
  });

  it('validates contract-to-billboard matching before creating a campaign proof', async () => {
    state.prisma.contract.findUnique.mockResolvedValue({ id: 'contract-1', billboardId: 'different-board' });
    const res = response();
    await handler(request({ body: checkIn({ type: 'CampaignProof', contractId: 'contract-1', latitude: undefined, longitude: undefined, accuracy: undefined }) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toMatch(/does not belong/i);
    expect(state.prisma.fieldReport.upsert).not.toHaveBeenCalled();
  });

  it('derives reporter identity on create and keeps the client UUID as the idempotency key', async () => {
    const res = response();
    await handler(request({ body: checkIn({ photoUrl: 'https://cdn.example.test/field-reports/report.jpg' }) }), res);
    expect(res.statusCode).toBe(201);
    expect(state.prisma.fieldReport.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: REPORT_ID },
      create: expect.objectContaining({
        id: REPORT_ID,
        reportedBy: 'staff-1',
        reportedByEmail: 'staff@example.com',
        status: 'Submitted',
      }),
    }));
  });

  it('deduplicates a stable report id without another write', async () => {
    state.prisma.fieldReport.findUnique.mockResolvedValue(storedReport());
    const res = response();
    await handler(request({ body: checkIn() }), res);
    expect(res.statusCode).toBe(200);
    expect(state.prisma.fieldReport.upsert).not.toHaveBeenCalled();
    expect(res.payload.id).toBe(REPORT_ID);
  });

  it('only allows managers and admins to mark a report resolved', async () => {
    const res = response();
    await handler(request({ method: 'PUT', query: { id: REPORT_ID }, body: { status: 'Resolved' } }), res);
    expect(res.statusCode).toBe(403);

    state.payload = { ...state.payload, role: 'Manager' };
    state.prisma.fieldReport.findUnique.mockResolvedValue(storedReport());
    const allowed = response();
    await handler(request({ method: 'PUT', query: { id: REPORT_ID }, body: { status: 'Resolved' } }), allowed);
    expect(allowed.statusCode).toBe(200);
    expect(state.prisma.fieldReport.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Resolved' } }));
  });
});

describe('field report reads', () => {
  it('applies supported filters and returns newest-first bounded query results', async () => {
    const res = response();
    await handler(request({ method: 'GET', query: { billboardId: 'board-1', status: 'Submitted' } }), res);
    expect(res.statusCode).toBe(200);
    expect(state.prisma.fieldReport.findMany).toHaveBeenCalledWith({
      where: { billboardId: 'board-1', status: 'Submitted' },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    expect(res.payload[0].capturedAt).toBe(now.toISOString());
  });
});
