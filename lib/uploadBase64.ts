import { uploadFile, deleteFile } from './storage';

const DATA_URL_RE = /^data:(.+?);base64,(.+)$/;

export function isBase64DataUrl(value: string): boolean {
  return typeof value === 'string' && DATA_URL_RE.test(value);
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimetype: string; ext: string } {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) throw new Error('Invalid data URL');
  const mimetype = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimetype.split('/')[1] || 'bin';
  return { buffer, mimetype, ext };
}

export async function uploadBase64Image(
  folder: 'billboards' | 'logos',
  dataUrl: string | undefined | null,
  existingUrl?: string | null
): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  if (!isBase64DataUrl(dataUrl)) {
    // Already a remote URL
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
