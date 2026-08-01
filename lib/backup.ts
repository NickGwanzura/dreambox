import { prisma } from './prisma';
import { uploadFile, deleteFile, s3 } from './storage';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const BUCKET = process.env.R2_BUCKET_NAME || '';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const MANIFEST_KEY = 'backups/manifest.json';
const DATABASE_BACKUP_PREFIX = (process.env.DATABASE_BACKUP_PREFIX || 'dreambox-postgres-db-9cy1yw/database-backups/dreambox-production')
  .replace(/^\/+|\/+$/g, '');

export interface BackupManifest {
  version: string;
  exportedAt: string;
  tableCounts: Record<string, number>;
}

export interface BackupResult {
  id: string;
  key: string;
  url: string;
  manifest: BackupManifest;
  size: number;
  recordCount: number;
}

export interface BackupManifestEntry {
  id: string;
  key: string;
  url: string;
  createdAt: string;
  createdBy: string;
  size: number;
  recordCount: number;
  tables: string[];
}

export interface DatabaseBackupEntry {
  id: string;
  key: string;
  fileName: string;
  createdAt: string;
  size: number;
  source: 'database';
}

export type BackupRecord = Record<string, any[]>;

const BACKUP_TABLES = [
  { name: 'users', model: 'user' as const, key: 'users' as const },
  { name: 'login_history', model: 'loginHistory' as const, key: 'loginHistory' as const },
  { name: 'password_reset_tokens', model: 'passwordResetToken' as const, key: 'passwordResetTokens' as const },
  { name: 'rate_limits', model: 'rateLimit' as const, key: 'rateLimits' as const },
  { name: 'billboards', model: 'billboard' as const, key: 'billboards' as const },
  { name: 'clients', model: 'client' as const, key: 'clients' as const },
  { name: 'contracts', model: 'contract' as const, key: 'contracts' as const },
  { name: 'contract_amendments', model: 'contractAmendment' as const, key: 'contractAmendments' as const },
  { name: 'invoices', model: 'invoice' as const, key: 'invoices' as const },
  { name: 'payment_allocations', model: 'paymentAllocation' as const, key: 'paymentAllocations' as const },
  { name: 'expenses', model: 'expense' as const, key: 'expenses' as const },
  { name: 'tasks', model: 'task' as const, key: 'tasks' as const },
  { name: 'maintenance_logs', model: 'maintenanceLog' as const, key: 'maintenanceLogs' as const },
  { name: 'outsourced_billboards', model: 'outsourcedBillboard' as const, key: 'outsourcedBillboards' as const },
  { name: 'printing_jobs', model: 'printingJob' as const, key: 'printingJobs' as const },
  { name: 'company_profile', model: 'companyProfile' as const, key: 'companyProfile' as const },
  { name: 'crm_companies', model: 'cRMCompany' as const, key: 'crmCompanies' as const },
  { name: 'crm_contacts', model: 'cRMContact' as const, key: 'crmContacts' as const },
  { name: 'crm_opportunities', model: 'cRMOpportunity' as const, key: 'crmOpportunities' as const },
  { name: 'crm_touchpoints', model: 'cRMTouchpoint' as const, key: 'crmTouchpoints' as const },
  { name: 'crm_tasks', model: 'cRMTask' as const, key: 'crmTasks' as const },
  { name: 'crm_email_threads', model: 'cRMEmailThread' as const, key: 'crmEmailThreads' as const },
  { name: 'crm_call_logs', model: 'cRMCallLog' as const, key: 'crmCallLogs' as const },
  { name: 'audit_logs', model: 'auditLog' as const, key: 'auditLogs' as const },
  { name: 'product_services', model: 'productService' as const, key: 'productServices' as const },
  { name: 'quotation_events', model: 'quotationEvent' as const, key: 'quotationEvents' as const },
];

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function getManifest(): Promise<BackupManifestEntry[]> {
  if (!s3 || !BUCKET) return [];
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: MANIFEST_KEY }));
    const body = await streamToString(obj.Body as Readable);
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    if (e.name === 'NoSuchKey' || e.name === 'NotFound') return [];
    console.warn('[backup] Failed to read manifest:', e.message);
    return [];
  }
}

async function saveManifest(entries: BackupManifestEntry[]): Promise<void> {
  if (!s3 || !BUCKET) throw new Error('R2 not configured');
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: MANIFEST_KEY,
      Body: Buffer.from(JSON.stringify(entries, null, 2)),
      ContentType: 'application/json',
      ACL: 'public-read',
    })
  );
}

export async function listBackups(): Promise<BackupManifestEntry[]> {
  const manifest = await getManifest();
  return manifest.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** List infrastructure-level PostgreSQL snapshots created by the deployment backup job. */
export async function listDatabaseBackups(): Promise<DatabaseBackupEntry[]> {
  if (!s3 || !BUCKET) return [];

  const prefix = `${DATABASE_BACKUP_PREFIX}/`;
  const entries: DatabaseBackupEntry[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const object of page.Contents ?? []) {
      if (!object.Key || object.Key.endsWith('/')) continue;
      entries.push({
        id: Buffer.from(object.Key).toString('base64url'),
        key: object.Key,
        fileName: object.Key.split('/').pop() || 'dreambox-database-backup.sql.gz',
        createdAt: object.LastModified?.toISOString() || new Date(0).toISOString(),
        size: object.Size || 0,
        source: 'database',
      });
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getApplicationBackupObject(id: string) {
  const entry = (await getManifest()).find(backup => backup.id === id);
  if (!entry) throw new Error('Backup not found');
  return getBackupObject(entry.key, entry.key.split('/').pop() || `dreambox-backup-${id}.json`);
}

export async function getDatabaseBackupObject(key: string) {
  const allowedPrefix = `${DATABASE_BACKUP_PREFIX}/`;
  if (!key.startsWith(allowedPrefix) || key.includes('..')) {
    throw new Error('Invalid database backup key');
  }
  return getBackupObject(key, key.split('/').pop() || 'dreambox-database-backup.sql.gz');
}

async function getBackupObject(key: string, fileName: string) {
  if (!s3 || !BUCKET) throw new Error('Backup storage is not configured');
  const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!object.Body) throw new Error('Backup file is empty');
  return {
    body: object.Body as Readable,
    fileName: fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
    contentType: object.ContentType || 'application/octet-stream',
    contentLength: object.ContentLength,
  };
}

export async function createBackup(createdBy = 'system'): Promise<BackupResult> {
  if (!s3 || !BUCKET) throw new Error('R2 storage is not configured');

  const data: BackupRecord = {};
  const tableCounts: Record<string, number> = {};

  await Promise.all(
    BACKUP_TABLES.map(async ({ name, model, key }) => {
      try {
        // @ts-ignore — dynamic Prisma access
        const rows = await prisma[model].findMany();
        data[key] = rows;
        tableCounts[name] = rows.length;
      } catch (e: any) {
        console.warn(`[backup] Failed to export ${name}:`, e.message);
        data[key] = [];
        tableCounts[name] = 0;
      }
    })
  );

  const manifest: BackupManifest = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    tableCounts,
  };

  const payload = { manifest, data };
  const buffer = Buffer.from(JSON.stringify(payload, null, 2));
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const id = `${date}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const originalName = `dreambox-backup-${id}.json`;

  const { key: fileKey, url } = await uploadFile('backups', {
    buffer,
    originalName,
    mimetype: 'application/json',
  });

  const recordCount = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);

  const entry: BackupManifestEntry = {
    id,
    key: fileKey,
    url,
    createdAt: new Date().toISOString(),
    createdBy,
    size: buffer.length,
    recordCount,
    tables: Object.keys(data).filter(k => data[k].length > 0),
  };

  const existing = await getManifest();
  existing.push(entry);
  if (existing.length > 50) {
    const removed = existing.shift();
    if (removed) {
      try { await deleteFile(removed.key); } catch (e: any) {
        console.warn('[backup] Failed to prune old backup file:', e.message);
      }
    }
  }
  await saveManifest(existing);

  return { id, key: fileKey, url, manifest, size: buffer.length, recordCount };
}

export async function deleteBackup(id: string): Promise<void> {
  const manifest = await getManifest();
  const entry = manifest.find(b => b.id === id);
  if (!entry) throw new Error('Backup not found');

  try { await deleteFile(entry.key); } catch (e: any) {
    console.warn('[backup] Failed to delete backup file:', e.message);
  }

  const updated = manifest.filter(b => b.id !== id);
  await saveManifest(updated);
}

async function fetchBackupFromR2(key: string): Promise<BackupRecord> {
  if (!s3 || !BUCKET) throw new Error('R2 not configured');
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const body = await streamToString(obj.Body as Readable);
  const parsed = JSON.parse(body);
  return parsed.data ?? parsed;
}

function validateBackupPayload(data: unknown): data is BackupRecord {
  if (typeof data !== 'object' || data === null) return false;
  return BACKUP_TABLES.some(({ key }) => Array.isArray((data as BackupRecord)[key]));
}

export async function restoreBackup(id: string): Promise<{ restored: number; errors: string[] }> {
  const manifest = await getManifest();
  const entry = manifest.find(b => b.id === id);
  if (!entry) throw new Error('Backup not found');

  const data = await fetchBackupFromR2(entry.key);
  if (!validateBackupPayload(data)) throw new Error('Invalid backup file format');
  return restoreFromData(data);
}

export async function restoreBackupFromData(data: BackupRecord): Promise<{ restored: number; errors: string[] }> {
  if (!validateBackupPayload(data)) throw new Error('Invalid backup payload');
  return restoreFromData(data);
}

async function restoreFromData(data: BackupRecord): Promise<{ restored: number; errors: string[] }> {
  const errors: string[] = [];
  let restored = 0;

  // Order matters for referential integrity: dependencies before dependants.
  const order = [
    'users',
    'loginHistory',
    'passwordResetTokens',
    'rateLimits',
    'billboards',
    'clients',
    'companyProfile',
    'contracts',
    'contractAmendments',
    'invoices',
    'paymentAllocations',
    'expenses',
    'tasks',
    'maintenanceLogs',
    'outsourcedBillboards',
    'printingJobs',
    'crmCompanies',
    'crmContacts',
    'crmOpportunities',
    'crmTouchpoints',
    'crmTasks',
    'crmEmailThreads',
    'crmCallLogs',
    'productServices',
    'quotationEvents',
    'auditLogs',
  ];

  for (const key of order) {
    const def = BACKUP_TABLES.find(t => t.key === key);
    if (!def) continue;
    const records = Array.isArray(data[key]) ? data[key] : [];
    if (records.length === 0) continue;

    try {
      const ids = records.map((r: any) => r.id).filter(Boolean);
      // @ts-ignore
      if (ids.length > 0) await prisma[def.model].deleteMany({ where: { id: { in: ids } } });
      // @ts-ignore
      await prisma[def.model].createMany({ data: records, skipDuplicates: true });
      restored += records.length;
    } catch (e: any) {
      console.error(`[backup] Restore failed for ${key}:`, e.message);
      errors.push(`${key}: ${e.message}`);
    }
  }

  return { restored, errors };
}
