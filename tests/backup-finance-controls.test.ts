import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const models = new Map<string | symbol, { findMany: ReturnType<typeof vi.fn> }>();
  const model = (name: string | symbol) => {
    if (!models.has(name)) models.set(name, { findMany: vi.fn().mockResolvedValue([]) });
    return models.get(name)!;
  };
  return {
    models,
    model,
    prisma: new Proxy({}, { get: (_target, property) => model(property) }),
    s3: { send: vi.fn() },
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
  };
});

vi.mock('../lib/prisma', () => ({ prisma: state.prisma }));
vi.mock('../lib/storage', () => ({
  s3: state.s3,
  uploadFile: state.uploadFile,
  deleteFile: state.deleteFile,
}));

describe('application backup finance controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = 'test-backups';
    state.models.clear();
    state.model('accountingPeriod').findMany.mockResolvedValue([{ id: 'period-1' }]);
    state.model('paymentReview').findMany.mockResolvedValue([{ id: 'review-1' }]);
    state.model('auditLog').findMany.mockResolvedValue([{ id: 'audit-1' }]);
    state.uploadFile.mockResolvedValue({ key: 'backups/test.json', url: 'https://example.test/backups/test.json' });
    state.s3.send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    state.s3.send.mockResolvedValue({});
  });

  it('exports accounting periods, payment reviews, and audit records with financial data', async () => {
    const { createBackup } = await import('../lib/backup');

    const backup = await createBackup('manager@example.com');

    expect(backup.manifest.tableCounts).toMatchObject({
      accounting_periods: 1,
      payment_reviews: 1,
      audit_logs: 1,
    });
    expect(backup.recordCount).toBe(3);
    expect(state.model('accountingPeriod').findMany).toHaveBeenCalledOnce();
    expect(state.model('paymentReview').findMany).toHaveBeenCalledOnce();
    expect(state.model('auditLog').findMany).toHaveBeenCalledOnce();
  });

  it('aborts before upload when any intended table cannot be exported', async () => {
    state.model('client').findMany.mockRejectedValue(new Error('client table unavailable'));
    const { createBackup } = await import('../lib/backup');

    await expect(createBackup('manager@example.com')).rejects.toThrow(
      'Backup aborted; tables could not be exported: clients: client table unavailable',
    );
    expect(state.uploadFile).not.toHaveBeenCalled();
  });
});
