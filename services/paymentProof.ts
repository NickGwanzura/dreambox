import { api, getToken } from './apiClient';

export interface UploadedPaymentProof {
  url: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
}

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 7 * 1024 * 1024;

export function validatePaymentProofFile(file: File): void {
  if (!ALLOWED.has(file.type)) throw new Error('Proof must be a PDF, JPEG, PNG, or WebP file.');
  if (file.size > MAX_BYTES) throw new Error('Proof file must be 7 MB or smaller.');
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the proof-of-payment file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadPaymentProof(file: File): Promise<UploadedPaymentProof> {
  validatePaymentProofFile(file);
  return api.post<UploadedPaymentProof>('/api/upload-payment-proof', {
    dataUrl: await readAsDataUrl(file),
    originalName: file.name,
  });
}

export async function openPaymentProof(receiptId: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`/api/payment-proof?receiptId=${encodeURIComponent(receiptId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Could not open proof of payment' }));
    throw new Error(error.error || 'Could not open proof of payment');
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) URL.revokeObjectURL(objectUrl);
  else window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function isBankPaymentMethod(method: unknown): boolean {
  return /bank|transfer|rtgs|swift|wire/i.test(String(method || ''));
}
