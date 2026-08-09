import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../lib/http';

const state = vi.hoisted(() => ({
  restoreBackup: vi.fn(),
  restoreBackupFromData: vi.fn(),
  auditLog: { create: vi.fn() },
  requireAdmin: vi.fn(),
  cors: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/backup', () => ({
  listBackups: vi.fn(),
  listDatabaseBackups: vi.fn(),
  createBackup: vi.fn(),
  deleteBackup: vi.fn(),
  restoreBackup: state.restoreBackup,
  restoreBackupFromData: state.restoreBackupFromData,
  getApplicationBackupObject: vi.fn(),
  getDatabaseBackupObject: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ requireAdmin: state.requireAdmin, cors: state.cors }));
vi.mock('../lib/prisma', () => ({ prisma: { auditLog: state.auditLog } }));
vi.mock('../lib/serverLogger', () => ({ log: state.log }));

import backupHandler from '../api/backup';

function response() {
  let statusCode = 0;
  let body: any;
  const res: any = {
    status: vi.fn((status: number) => { statusCode = status; return res; }),
    json: vi.fn((payload: any) => { body = payload; return res; }),
    setHeader: vi.fn(),
  };
  Object.defineProperties(res, {
    statusCode: { get: () => statusCode },
    body: { get: () => body },
  });
  return res as HttpResponse & { statusCode: number; body: any };
}

function request(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'POST', headers: {}, query: {}, body: {}, ...overrides } as HttpRequest;
}

describe('backup restore failure reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requireAdmin.mockResolvedValue({ userId: 'admin-1', email: 'admin@example.test' });
    state.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('records a distinct failure audit and returns failure for uploaded restore errors', async () => {
    state.restoreBackupFromData.mockResolvedValue({ restored: 0, errors: ['restore: insert failed'] });
    const res = response();

    await backupHandler(request({ query: { action: 'restore' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, restored: 0, errors: ['restore: insert failed'] });
    expect(state.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BACKUP_RESTORE_FAILED_FROM_UPLOAD' }),
    }));
    expect(state.log.info).not.toHaveBeenCalledWith(expect.stringContaining('Restored'), expect.anything());
  });

  it('records a distinct failure audit for stored backup restore errors', async () => {
    state.restoreBackup.mockResolvedValue({ restored: 0, errors: ['restore: trigger cleanup failed'] });
    const res = response();

    await backupHandler(request({ method: 'PUT', query: { id: 'backup-1' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(state.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BACKUP_RESTORE_FAILED', recordId: 'backup-1' }),
    }));
  });

  it('audits and reports an uploaded restore promise rejection as a restore failure', async () => {
    state.restoreBackupFromData.mockRejectedValue(new Error('uploaded restore execution failed'));
    const res = response();

    await backupHandler(request({ query: { action: 'restore' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, restored: 0, errors: ['uploaded restore execution failed'] });
    expect(state.auditLog.create).toHaveBeenCalledTimes(1);
    expect(state.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'BACKUP_RESTORE_FAILED_FROM_UPLOAD',
        details: expect.stringContaining('uploaded restore execution failed'),
      }),
    }));
    expect(state.log.warn).toHaveBeenCalledOnce();
  });

  it('audits and reports a stored restore promise rejection as a restore failure', async () => {
    state.restoreBackup.mockRejectedValue(new Error('stored restore execution failed'));
    const res = response();

    await backupHandler(request({ method: 'PUT', query: { id: 'backup-1' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, restored: 0, errors: ['stored restore execution failed'] });
    expect(state.auditLog.create).toHaveBeenCalledTimes(1);
    expect(state.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'BACKUP_RESTORE_FAILED',
        recordId: 'backup-1',
        details: expect.stringContaining('stored restore execution failed'),
      }),
    }));
    expect(state.log.warn).toHaveBeenCalledOnce();
  });
});
