import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const bucket = process.env.R2_BUCKET_NAME || '';
const publicUrl = process.env.R2_PUBLIC_URL || '';

// R2_ENDPOINT may include the bucket name (e.g. .../dreambox). Strip it so the
// SDK doesn't double-prefix when forcePathStyle appends /{bucket} to the path.
const rawEndpoint = (process.env.R2_ENDPOINT || '').replace(/\/$/, '');
const endpoint = rawEndpoint.endsWith(`/${bucket}`)
  ? rawEndpoint.slice(0, -(bucket.length + 1))
  : rawEndpoint;

export const s3 = endpoint
  ? new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true, // Required for Cloudflare R2 compatibility
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    })
  : null;

export interface UploadResult {
  key: string;
  url: string;
}

function generateKey(folder: string, originalName: string): string {
  const ext = originalName.split('.').pop() || 'bin';
  const sanitized = originalName
    .split('.')
    .slice(0, -1)
    .join('.')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${folder}/${sanitized || 'file'}-${timestamp}-${random}.${ext}`;
}

export async function uploadFile(
  folder: 'billboards' | 'logos' | 'exports' | 'backups',
  file: { buffer: Buffer; originalName: string; mimetype: string }
): Promise<UploadResult> {
  if (!s3 || !bucket) {
    throw new Error('R2 storage is not configured. Set R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  }

  const key = generateKey(folder, file.originalName);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // No ACL: R2 public access is configured at the bucket level via R2_PUBLIC_URL,
      // not per-object. Sending ACL causes "bucket does not allow ACLs" errors on R2.
    })
  );

  // The R2 endpoint usually already contains the bucket path; avoid doubling it.
  const baseUrl = endpoint.endsWith(`/${bucket}`)
    ? endpoint.replace(/\/$/, '')
    : `${endpoint.replace(/\/$/, '')}/${bucket}`;
  const url = publicUrl ? `${publicUrl.replace(/\/$/, '')}/${key}` : `${baseUrl}/${key}`;
  return { key, url };
}

export async function deleteFile(key: string): Promise<void> {
  if (!s3 || !bucket) return;
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}


