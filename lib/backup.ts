import { prisma } from './prisma';
import { uploadFile, deleteFile, s3 } from './storage';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import crypto from 'crypto';

const BUCKET = process.env.R2_BUCKET_NAME || '';
const MANIFEST_KEY = 'backups/manifest.json';
const DATABASE_BACKUP_PREFIX = (process.env.DATABASE_BACKUP_PREFIX || 'dreambox-postgres-db-9cy1yw/database-backups/dreambox-production')
  .replace(/^\/+|\/+$/g, '');

/** Serialize manifest mutations across app instances using a transaction-
 * scoped PostgreSQL advisory lock. The interactive transaction pins one
 * connection while the shared R2 read-modify-write completes, so pooled
 * clients cannot acquire and release the lock on different sessions. */
async function withManifestLock<T>(operation: () => Promise<T>): Promise<T> {
  const transaction = (prisma as any).$transaction;
  if (typeof transaction !== 'function') return operation();
  return transaction.call(prisma, async (tx: any) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('dreambox-backup-manifest'))");
    return operation();
  });
}

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
  checksumSha256?: string;
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
  // Human-readable exports intentionally exclude credentials, password-reset
  // tokens, login history and rate-limit internals. Full database snapshots
  // remain available separately for disaster recovery.
  { name: 'billboards', model: 'billboard' as const, key: 'billboards' as const },
  { name: 'clients', model: 'client' as const, key: 'clients' as const },
  { name: 'contracts', model: 'contract' as const, key: 'contracts' as const },
  { name: 'contract_amendments', model: 'contractAmendment' as const, key: 'contractAmendments' as const },
  { name: 'invoices', model: 'invoice' as const, key: 'invoices' as const },
  { name: 'payment_allocations', model: 'paymentAllocation' as const, key: 'paymentAllocations' as const },
  { name: 'expenses', model: 'expense' as const, key: 'expenses' as const },
  // Finance controls are part of the accounting record.  Keeping these with
  // application exports preserves period locks, payment-review queues and the
  // immutable audit trail alongside their source transactions.
  { name: 'accounting_periods', model: 'accountingPeriod' as const, key: 'accountingPeriods' as const },
  { name: 'payment_reviews', model: 'paymentReview' as const, key: 'paymentReviews' as const },
  { name: 'tasks', model: 'task' as const, key: 'tasks' as const },
  { name: 'maintenance_logs', model: 'maintenanceLog' as const, key: 'maintenanceLogs' as const },
  { name: 'printing_jobs', model: 'printingJob' as const, key: 'printingJobs' as const },
  { name: 'company_profile', model: 'companyProfile' as const, key: 'companyProfile' as const },
  { name: 'crm_companies', model: 'cRMCompany' as const, key: 'crmCompanies' as const },
  { name: 'crm_contacts', model: 'cRMContact' as const, key: 'crmContacts' as const },
  { name: 'crm_opportunities', model: 'cRMOpportunity' as const, key: 'crmOpportunities' as const },
  { name: 'crm_touchpoints', model: 'cRMTouchpoint' as const, key: 'crmTouchpoints' as const },
  { name: 'crm_tasks', model: 'cRMTask' as const, key: 'crmTasks' as const },
  { name: 'crm_email_threads', model: 'cRMEmailThread' as const, key: 'crmEmailThreads' as const },
  { name: 'crm_call_logs', model: 'cRMCallLog' as const, key: 'crmCallLogs' as const },
  { name: 'product_services', model: 'productService' as const, key: 'productServices' as const },
  { name: 'quotation_events', model: 'quotationEvent' as const, key: 'quotationEvents' as const },
  { name: 'audit_logs', model: 'auditLog' as const, key: 'auditLogs' as const },
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
  const exportErrors: string[] = [];

  await Promise.all(
    BACKUP_TABLES.map(async ({ name, model, key }) => {
      try {
        // @ts-ignore — dynamic Prisma access
        const rows = await prisma[model].findMany();
        data[key] = rows;
        tableCounts[name] = rows.length;
      } catch (e: any) {
        console.warn(`[backup] Failed to export ${name}:`, e.message);
        exportErrors.push(`${name}: ${e.message}`);
        data[key] = [];
        tableCounts[name] = 0;
      }
    })
  );

  // A backup with an empty table caused by an export error is not a usable
  // backup. Abort before upload rather than presenting a partial snapshot as
  // successful; callers retain the existing exception-based failure contract.
  if (exportErrors.length > 0) {
    throw new Error(`Backup aborted; tables could not be exported: ${exportErrors.join('; ')}`);
  }

  const manifest: BackupManifest = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    tableCounts,
  };

  const payload = { manifest, data };
  const buffer = Buffer.from(JSON.stringify(payload, null, 2));
  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
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
    checksumSha256,
  };

  await withManifestLock(async () => {
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
  });

  return { id, key: fileKey, url, manifest, size: buffer.length, recordCount };
}

export async function deleteBackup(id: string): Promise<void> {
  await withManifestLock(async () => {
    const manifest = await getManifest();
    const entry = manifest.find(b => b.id === id);
    if (!entry) throw new Error('Backup not found');

    try { await deleteFile(entry.key); } catch (e: any) {
      console.warn('[backup] Failed to delete backup file:', e.message);
    }

    const updated = manifest.filter(b => b.id !== id);
    await saveManifest(updated);
  });
}

function validateBackupPayload(data: unknown): data is BackupRecord {
  if (typeof data !== 'object' || data === null) return false;
  return BACKUP_TABLES.some(({ key }) => Array.isArray((data as BackupRecord)[key]));
}

export async function restoreBackup(id: string): Promise<{ restored: number; errors: string[] }> {
  const manifest = await getManifest();
  const entry = manifest.find(b => b.id === id);
  if (!entry) throw new Error('Backup not found');

  const object = await getBackupObject(entry.key, entry.key.split('/').pop() || `dreambox-backup-${id}.json`);
  const chunks: Buffer[] = [];
  for await (const chunk of object.body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  if (entry.checksumSha256) {
    const actual = crypto.createHash('sha256').update(raw).digest('hex');
    if (actual !== entry.checksumSha256) throw new Error('Backup integrity check failed: checksum mismatch');
  }
  const parsed = JSON.parse(raw.toString('utf-8'));
  const data = parsed.data ?? parsed;
  if (!validateBackupPayload(data)) throw new Error('Invalid backup file format');
  return restoreFromData(data);
}

export async function restoreBackupFromData(data: BackupRecord): Promise<{ restored: number; errors: string[] }> {
  if (!validateBackupPayload(data)) throw new Error('Invalid backup payload');
  return restoreFromData(data);
}

async function restoreFromData(data: BackupRecord): Promise<{ restored: number; errors: string[] }> {
  // Order matters for referential integrity: dependencies before dependants.
  const order = [
    'billboards',
    'clients',
    'companyProfile',
    'contracts',
    'contractAmendments',
    'invoices',
    'paymentAllocations',
    'expenses',
    'accountingPeriods',
    'paymentReviews',
    'tasks',
    'maintenanceLogs',
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
    // Restore the audit trail last: it records the earlier control records
    // without needing to participate in their restore ordering.
    'auditLogs',
  ];

  const restorePlan = order.flatMap(key => {
    const def = BACKUP_TABLES.find(table => table.key === key);
    const records = Array.isArray(data[key]) ? data[key] : [];
    return def && records.length > 0 ? [{ key, def, records }] : [];
  });
  let restored = 0;
  let auditTriggerDisabled = false;

  try {
    // A backup restore changes interdependent records, so every delete and
    // insert belongs to one database transaction. A failed table therefore
    // rolls back the entire supported restore instead of leaving a mixture of
    // old and restored rows.
    await prisma.$transaction(async tx => {
      const auditLogBatch = restorePlan.find(({ key }) => key === 'auditLogs');
      if (auditLogBatch) {
        // The audit hash-chain trigger recomputes eventHash/previousHash on
        // every insert. Preserve the archived chain during this transaction.
        await tx.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_prepare_event"`);
        auditTriggerDisabled = true;
      }

      // Delete in reverse dependency order before inserting in dependency order.
      // In particular, payment_allocations references invoices with ON DELETE
      // RESTRICT, so allocations must be cleared before their receipt/invoice
      // rows. Quotation events and other dependent records follow the same
      // pattern. Audit events remain append-only and are never deleted.
      for (const { key, def, records } of [...restorePlan].reverse()) {
        const ids = records.map((record: any) => record.id).filter(Boolean);
        // Audit events are append-only; existing events are retained and
        // createMany(skipDuplicates) imports only records not already present.
        // @ts-ignore -- dynamic Prisma model access
        if (ids.length > 0 && key !== 'auditLogs') await tx[def.model].deleteMany({ where: { id: { in: ids } } });
      }

      // Restore dependencies before dependants. createMany().count is the
      // authoritative record of actual inserts after skipDuplicates.
      for (const { def, records } of restorePlan) {
        // @ts-ignore -- dynamic Prisma model access
        const result = await tx[def.model].createMany({ data: records, skipDuplicates: true });
        restored += result.count;
      }

      if (auditTriggerDisabled) {
        await tx.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_prepare_event"`);
        auditTriggerDisabled = false;
      }
    });

    return { restored, errors: [] };
  } catch (e: any) {
    console.error('[backup] Restore transaction failed:', e.message);
    return { restored: 0, errors: [`restore: ${e.message}`] };
  } finally {
    // Do this even when an insert or the in-transaction re-enable fails. A
    // transaction rollback normally restores the trigger state, but the
    // explicit cleanup protects against failures after the trigger command.
    if (auditTriggerDisabled) {
      // Do not suppress this failure: reporting a completed restore while the
      // audit trigger might still be disabled would be unsafe.
      await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_prepare_event"`);
    }
  }
}
