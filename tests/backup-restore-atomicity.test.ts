import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const calls: string[] = [];
  const billboard = { deleteMany: vi.fn(), createMany: vi.fn() };
  const invoice = { deleteMany: vi.fn(), createMany: vi.fn() };
  const paymentAllocation = { deleteMany: vi.fn(), createMany: vi.fn() };
  const auditLog = { deleteMany: vi.fn(), createMany: vi.fn() };
  const transactionClient: any = {
    billboard,
    invoice,
    paymentAllocation,
    auditLog,
    $executeRawUnsafe: vi.fn(),
  };
  const prisma: any = {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(transactionClient)),
    $executeRawUnsafe: vi.fn(),
  };
  return { prisma, transactionClient, calls, billboard, invoice, paymentAllocation, auditLog };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/storage', () => ({ s3: undefined, uploadFile: vi.fn(), deleteFile: vi.fn() }));

import { restoreBackupFromData } from '../lib/backup';

describe('backup restore atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.calls.length = 0;
    state.billboard.deleteMany.mockResolvedValue({ count: 1 });
    state.billboard.createMany.mockResolvedValue({ count: 1 });
    state.invoice.deleteMany.mockImplementation(async () => { state.calls.push('delete invoice'); return { count: 1 }; });
    state.invoice.createMany.mockImplementation(async () => { state.calls.push('create invoice'); return { count: 1 }; });
    state.paymentAllocation.deleteMany.mockImplementation(async () => { state.calls.push('delete allocation'); return { count: 1 }; });
    state.paymentAllocation.createMany.mockImplementation(async () => { state.calls.push('create allocation'); return { count: 1 }; });
    state.auditLog.createMany.mockResolvedValue({ count: 1 });
    state.transactionClient.$executeRawUnsafe.mockResolvedValue(0);
    state.prisma.$executeRawUnsafe.mockResolvedValue(0);
  });

  it('uses one transaction and restores the audit trigger after a successful restore', async () => {
    const result = await restoreBackupFromData({
      billboards: [{ id: 'board-1', name: 'Board' }],
      auditLogs: [{ id: 'audit-1', action: 'RESTORE', details: 'Archived event' }],
    });

    expect(result).toEqual({ restored: 2, errors: [] });
    expect(state.prisma.$transaction).toHaveBeenCalledOnce();
    expect(state.transactionClient.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1, expect.stringContaining('DISABLE TRIGGER'),
    );
    expect(state.transactionClient.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2, expect.stringContaining('ENABLE TRIGGER'),
    );
  });

  it('returns a failed restore and runs trigger cleanup when an audit insert fails', async () => {
    state.auditLog.createMany.mockRejectedValue(new Error('insert failed'));

    const result = await restoreBackupFromData({
      auditLogs: [{ id: 'audit-1', action: 'RESTORE', details: 'Archived event' }],
    });

    expect(result.restored).toBe(0);
    expect(result.errors).toEqual(['restore: insert failed']);
    expect(state.prisma.$transaction).toHaveBeenCalledOnce();
    expect(state.prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('ENABLE TRIGGER'));
  });

  it('deletes payment allocations before invoices, then recreates invoices before allocations', async () => {
    const result = await restoreBackupFromData({
      invoices: [{ id: 'invoice-1', clientId: 'client-1' }],
      paymentAllocations: [{ id: 'allocation-1', receiptId: 'invoice-1', invoiceId: 'invoice-1' }],
    });

    expect(result).toEqual({ restored: 2, errors: [] });
    expect(state.calls).toEqual([
      'delete allocation',
      'delete invoice',
      'create invoice',
      'create allocation',
    ]);
  });

  it('reports only records actually inserted by createMany', async () => {
    state.billboard.createMany.mockResolvedValue({ count: 0 });
    state.auditLog.createMany.mockResolvedValue({ count: 1 });

    const result = await restoreBackupFromData({
      billboards: [{ id: 'board-1', name: 'Board' }],
      auditLogs: [{ id: 'audit-1', action: 'RESTORE', details: 'Archived event' }],
    });

    expect(result).toEqual({ restored: 1, errors: [] });
  });
});
