import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  configured: true,
  api: { post: vi.fn(), get: vi.fn() },
}));

vi.mock('../services/apiClient', () => ({
  api: state.api,
  isConfigured: () => state.configured,
}));

import { createDraft, getQueue, retryAll, submit } from '../services/fieldReports';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) {
      const error = new Error('quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
const REPORT_ID = '0dec10a6-6b22-4d4f-9ece-ae16dbe6b8fd';

function draft(extra: Record<string, unknown> = {}) {
  return createDraft({
    id: REPORT_ID,
    type: 'Issue',
    billboardId: 'board-1',
    note: 'Panel light is not working',
    photoDataUrl: 'data:image/jpeg;base64,aGVsbG8=',
    ...extra,
  });
}

beforeEach(() => {
  storage.clear();
  storage.failWrites = false;
  state.configured = true;
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
});

describe('field report offline queue', () => {
  it('retains local camera evidence while offline without attempting upload', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    const captured = draft();

    const result = await submit(captured);

    expect(result.status).toBe('queued');
    expect(state.api.post).not.toHaveBeenCalled();
    expect(getQueue()).toEqual([expect.objectContaining({
      id: REPORT_ID,
      draft: expect.objectContaining({ id: REPORT_ID, photoDataUrl: captured.photoDataUrl }),
    })]);
  });

  it('keeps a stable id through a failed report request and retry without re-uploading the photo', async () => {
    const serverFailure = Object.assign(new Error('Temporary server failure'), { status: 503 });
    const report = {
      id: REPORT_ID,
      type: 'Issue', billboardId: 'board-1', note: 'Panel light is not working',
      photoUrl: 'https://cdn.example.test/field-reports/proof.jpg', status: 'Submitted',
      reportedBy: 'staff-1', capturedAt: '2026-08-03T09:00:00.000Z', createdAt: '2026-08-03T09:01:00.000Z', updatedAt: '2026-08-03T09:01:00.000Z',
    };
    state.api.post
      .mockResolvedValueOnce({ url: 'https://cdn.example.test/field-reports/proof.jpg' })
      .mockRejectedValueOnce(serverFailure)
      .mockResolvedValueOnce(report);

    const first = await submit(draft());
    expect(first.status).toBe('queued');
    expect(getQueue()[0].draft.photoUrl).toBe('https://cdn.example.test/field-reports/proof.jpg');

    const retried = await retryAll();
    expect(retried.submitted).toEqual([report]);
    const reportCalls = state.api.post.mock.calls.filter(([path]) => path === '/api/field-reports');
    expect(reportCalls).toHaveLength(2);
    expect(reportCalls[0][1]).toEqual(expect.objectContaining({ id: REPORT_ID, photoUrl: report.photoUrl }));
    expect(reportCalls[1][1]).toEqual(expect.objectContaining({ id: REPORT_ID, photoUrl: report.photoUrl }));
    expect(state.api.post.mock.calls.filter(([path]) => path === '/api/upload-image')).toHaveLength(1);
    expect(getQueue()).toEqual([]);
  });

  it('marks validation/auth-style 4xx errors terminal and does not retry them forever', async () => {
    const validationError = Object.assign(new Error('Billboard no longer exists'), { status: 400 });
    state.api.post.mockRejectedValue(validationError);

    const result = await submit(draft({ photoDataUrl: undefined }));
    expect(result.status).toBe('failed');
    expect(getQueue()[0]).toEqual(expect.objectContaining({ terminal: true, status: 'failed', retryCount: 1 }));

    await retryAll();
    expect(state.api.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces a local-storage failure instead of claiming photo evidence is safely queued', async () => {
    storage.failWrites = true;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });

    const result = await submit(draft());

    expect(result.status).toBe('storage-failed');
    expect(result.message).toMatch(/could not safely save/i);
    expect(getQueue()[0].draft.photoDataUrl).toBeTruthy();
  });
});
