import type { FieldReport, FieldReportDraft, FieldReportQueueItem } from '../types';
import { api, isConfigured } from './apiClient';

const QUEUE_STORAGE_KEY = 'db_field_report_queue_v1';
const MAX_ERROR_MESSAGE_LENGTH = 400;

type NewFieldReportDraft = Omit<FieldReportDraft, 'id' | 'capturedAt'> & Partial<Pick<FieldReportDraft, 'id' | 'capturedAt'>>;

export type FieldReportSubmissionStatus = 'submitted' | 'queued' | 'failed' | 'storage-failed';

export interface FieldReportSubmissionResult {
  status: FieldReportSubmissionStatus;
  report?: FieldReport;
  queueItem?: FieldReportQueueItem;
  message?: string;
}

export interface RetryAllResult {
  submitted: FieldReport[];
  queued: FieldReportQueueItem[];
  failed: FieldReportQueueItem[];
  storageError?: string;
}

const subscribers = new Set<(queue: FieldReportQueueItem[]) => void>();
const inFlight = new Map<string, Promise<FieldReportSubmissionResult>>();
let volatileQueue: FieldReportQueueItem[] = [];
let storageError: string | null = null;

function cloneQueue(queue: FieldReportQueueItem[]): FieldReportQueueItem[] {
  return JSON.parse(JSON.stringify(queue)) as FieldReportQueueItem[];
}

function getStorage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate && typeof candidate.getItem === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unable to submit field report');
  return message.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_MESSAGE_LENGTH) || 'Unable to submit field report';
}

function setStorageError(error: unknown): string {
  storageError = `This device could not safely save the offline report: ${safeErrorMessage(error)}`;
  return storageError;
}

function readQueue(): FieldReportQueueItem[] {
  // If the most recent write failed, volatileQueue deliberately remains the source
  // of truth for this tab. This keeps the still-open screen honest about evidence
  // that has not made it to durable browser storage.
  if (storageError) return cloneQueue(volatileQueue);

  const storage = getStorage();
  if (!storage) return cloneQueue(volatileQueue);
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) {
      volatileQueue = [];
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Stored queue has an invalid format');
    volatileQueue = parsed as FieldReportQueueItem[];
    return cloneQueue(volatileQueue);
  } catch (error) {
    setStorageError(error);
    return cloneQueue(volatileQueue);
  }
}

function writeQueue(queue: FieldReportQueueItem[]): void {
  const nextQueue = cloneQueue(queue);
  volatileQueue = nextQueue;
  const storage = getStorage();
  if (!storage) {
    throw new Error('Local storage is unavailable in this browser');
  }
  storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
  storageError = null;
}

function notify(): void {
  const snapshot = getQueue();
  subscribers.forEach(listener => {
    try {
      listener(snapshot);
    } catch {
      // A view listener must never prevent the offline evidence queue from updating.
    }
  });
}

/** Returns a snapshot of reports still retained on this device. */
export function getQueue(): FieldReportQueueItem[] {
  return readQueue();
}

/** Visible storage failures are exposed separately so the UI can warn before page unload. */
export function getQueueStorageError(): string | null {
  return storageError;
}

/** Subscribe to queue changes. The listener receives an immediate snapshot. */
export function subscribe(listener: (queue: FieldReportQueueItem[]) => void): () => void {
  subscribers.add(listener);
  listener(getQueue());
  return () => subscribers.delete(listener);
}

function persistQueue(queue: FieldReportQueueItem[]): string | null {
  try {
    writeQueue(queue);
    notify();
    return null;
  } catch (error) {
    const message = setStorageError(error);
    // volatileQueue was populated before writing, so the current open UI still
    // holds the evidence and can display an explicit warning instead of pretending
    // it is safely queued for a later reload.
    notify();
    return message;
  }
}

function replaceQueueItem(item: FieldReportQueueItem): string | null {
  const queue = getQueue();
  const index = queue.findIndex(candidate => candidate.id === item.id);
  const next = index === -1
    ? [...queue, item]
    : queue.map(candidate => candidate.id === item.id ? item : candidate);
  return persistQueue(next);
}

function removeQueueItem(id: string): string | null {
  return persistQueue(getQueue().filter(item => item.id !== id));
}

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUuid) return randomUuid();
  // Valid RFC-4122 v4 fallback for older WebViews without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker => {
    const random = Math.floor(Math.random() * 16);
    const nibble = marker === 'x' ? random : (random & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function durablePhotoUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return value;
  } catch {
    // The caller receives a clear error below; never persist an object/blob URL.
  }
  throw new Error('Photo evidence must be a durable HTTP(S) URL or a data URL captured from a file.');
}

/** Capture a stable report id and ISO time before any network work begins. */
export function createDraft(input: NewFieldReportDraft): FieldReportDraft {
  return {
    ...input,
    id: input.id || createUuid(),
    capturedAt: input.capturedAt || new Date().toISOString(),
    contractId: input.contractId || undefined,
    note: input.note?.trim() || undefined,
    photoUrl: durablePhotoUrl(input.photoUrl),
    photoDataUrl: input.photoDataUrl || undefined,
  };
}

function isOnline(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

function canAttemptNow(): boolean {
  return isOnline() && isConfigured();
}

function isTerminalClientError(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) return true;
  // apiClient intentionally converts a token-bearing 401 into a session-expired
  // Error without preserving a status property. Treat it as terminal too.
  return /session expired|sign in again|unauthori[sz]ed|invalid or expired token/i.test(safeErrorMessage(error));
}

function asRequestBody(draft: FieldReportDraft) {
  const { photoDataUrl: _localOnlyEvidence, ...body } = draft;
  return body;
}

function queueItemFor(draft: FieldReportDraft, existing?: FieldReportQueueItem): FieldReportQueueItem {
  return {
    id: draft.id,
    draft,
    status: 'queued',
    retryCount: existing?.retryCount ?? 0,
    queuedAt: existing?.queuedAt ?? new Date().toISOString(),
  };
}

async function submitQueuedItem(item: FieldReportQueueItem): Promise<FieldReportSubmissionResult> {
  const current = inFlight.get(item.id);
  if (current) return current;

  const attempt = (async (): Promise<FieldReportSubmissionResult> => {
    if (item.terminal) {
      return { status: 'failed', queueItem: item, message: item.lastError || 'This report needs correction before retrying.' };
    }
    if (!canAttemptNow()) {
      return { status: 'queued', queueItem: item, message: isOnline() ? 'Sign in to submit this queued report.' : 'Saved on this device until you are back online.' };
    }

    let activeItem: FieldReportQueueItem = {
      ...item,
      status: 'queued',
      lastAttemptAt: new Date().toISOString(),
      lastError: undefined,
      terminal: false,
    };
    const attemptSaveError = replaceQueueItem(activeItem);
    if (attemptSaveError) return { status: 'storage-failed', queueItem: activeItem, message: attemptSaveError };

    try {
      if (activeItem.draft.photoDataUrl && !activeItem.draft.photoUrl) {
        const uploaded = await api.post<{ url: string }>('/api/upload-image', {
          dataUrl: activeItem.draft.photoDataUrl,
          folder: 'field-reports',
        });
        if (!uploaded?.url) throw new Error('Image upload did not return a durable URL');

        // Persist the durable URL before posting the report. If the report request
        // drops, retry will use this URL and will not upload the camera evidence again.
        activeItem = {
          ...activeItem,
          draft: { ...activeItem.draft, photoUrl: uploaded.url },
        };
        const imageSaveError = replaceQueueItem(activeItem);
        if (imageSaveError) return { status: 'storage-failed', queueItem: activeItem, message: imageSaveError };
      }

      const report = await api.post<FieldReport>('/api/field-reports', asRequestBody(activeItem.draft));
      const removeError = removeQueueItem(activeItem.id);
      if (removeError) {
        // The server response is safe, and its stable id makes a stale local item
        // harmless, but tell the user it may remain visible until storage recovers.
        return { status: 'submitted', report, queueItem: activeItem, message: `Field report submitted. ${removeError}` };
      }
      return { status: 'submitted', report };
    } catch (error) {
      const message = safeErrorMessage(error);
      const terminal = isTerminalClientError(error);
      const failedItem: FieldReportQueueItem = {
        ...activeItem,
        status: terminal ? 'failed' : 'queued',
        retryCount: activeItem.retryCount + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: message,
        terminal,
      };
      const failureSaveError = replaceQueueItem(failedItem);
      if (failureSaveError) return { status: 'storage-failed', queueItem: failedItem, message: failureSaveError };
      return { status: terminal ? 'failed' : 'queued', queueItem: failedItem, message };
    }
  })();

  inFlight.set(item.id, attempt);
  try {
    return await attempt;
  } finally {
    inFlight.delete(item.id);
  }
}

/**
 * Capture the report to local storage first, then upload the image and report when
 * network/auth are available. A retry keeps the same UUID through every attempt.
 */
export async function submit(input: FieldReportDraft | NewFieldReportDraft): Promise<FieldReportSubmissionResult> {
  const draft = createDraft(input as NewFieldReportDraft);
  const existing = getQueue().find(item => item.id === draft.id);
  const item = queueItemFor(draft, existing);
  const queueSaveError = replaceQueueItem(item);
  if (queueSaveError) return { status: 'storage-failed', queueItem: item, message: queueSaveError };

  return submitQueuedItem(item);
}

/** Retry every non-terminal item once, preserving terminal 4xx/auth failures for correction. */
export async function retryAll(): Promise<RetryAllResult> {
  const initial = getQueue();
  const result: RetryAllResult = { submitted: [], queued: [], failed: [] };
  if (!canAttemptNow()) {
    result.queued = initial.filter(item => !item.terminal);
    result.failed = initial.filter(item => item.terminal);
    result.storageError = getQueueStorageError() || undefined;
    return result;
  }

  for (const item of initial) {
    if (item.terminal) {
      result.failed.push(item);
      continue;
    }
    const submitted = await submitQueuedItem(item);
    if (submitted.status === 'submitted' && submitted.report) result.submitted.push(submitted.report);
    else if (submitted.status === 'failed' && submitted.queueItem) result.failed.push(submitted.queueItem);
    else if (submitted.queueItem) result.queued.push(submitted.queueItem);
    if (submitted.status === 'storage-failed') result.storageError = submitted.message;
  }

  result.storageError ||= getQueueStorageError() || undefined;
  return result;
}
