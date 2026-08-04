import { uploadFile, deleteFile } from './storage';

const DATA_URL_RE = /^data:(.+?);base64,(.+)$/;

const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export function isBase64DataUrl(value: string): boolean {
  return typeof value === 'string' && DATA_URL_RE.test(value);
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimetype: string; ext: string } {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) throw new Error('Invalid data URL');
  const mimetype = match[1];

  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB. Maximum allowed is 5 MB.`);
  }

  const ext = mimetype.split('/')[1].replace('svg+xml', 'svg') || 'bin';
  return { buffer, mimetype, ext };
}

export async function uploadBase64Image(
  folder: 'billboards' | 'logos' | 'gallery' | 'field-reports',
  dataUrl: string | undefined | null,
  existingUrl?: string | null
): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  if (!isBase64DataUrl(dataUrl)) {
    // Already a remote URL — return as-is
    return dataUrl;
  }

  const { buffer, mimetype, ext } = dataUrlToBuffer(dataUrl);
  const originalName = `image.${ext}`;
  const result = await uploadFile(folder, { buffer, originalName, mimetype });

  // Best-effort delete old image if it was hosted in our R2 bucket
  if (existingUrl && result.url !== existingUrl) {
    try {
      const key = existingUrl.split('/').slice(-2).join('/'); // folder/filename
      if (key && key.includes(folder)) await deleteFile(key);
    } catch {
      // Ignore cleanup errors
    }
  }

  return result.url;
}
