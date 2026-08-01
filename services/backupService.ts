import { api, getToken } from './apiClient';

export interface BackupManifestEntry {
  id: string;
  key: string;
  url?: string;
  createdAt: string;
  createdBy: string;
  size: number;
  recordCount: number;
  tables: string[];
}

export interface BackupListResponse {
  backups: BackupManifestEntry[];
  databaseBackups: DatabaseBackupEntry[];
}

export interface DatabaseBackupEntry {
  id: string;
  key: string;
  fileName: string;
  createdAt: string;
  size: number;
  source: 'database';
}

export interface BackupCreateResponse {
  success: boolean;
  backup: BackupManifestEntry;
}

export interface BackupRestoreResponse {
  success: boolean;
  restored: number;
  errors: string[];
}

export async function listBackups(): Promise<BackupManifestEntry[]> {
  const res = await api.get<BackupListResponse>('/api/backup');
  return res.backups || [];
}

export async function listBackupInventory(): Promise<BackupListResponse> {
  const res = await api.get<BackupListResponse>('/api/backup');
  return { backups: res.backups || [], databaseBackups: res.databaseBackups || [] };
}

export async function downloadBackup(
  backup: BackupManifestEntry | DatabaseBackupEntry,
  source: 'application' | 'database',
): Promise<string> {
  const token = getToken();
  const params = new URLSearchParams({ action: 'download', source });
  if (source === 'database') params.set('key', (backup as DatabaseBackupEntry).key);
  else params.set('id', backup.id);

  const response = await fetch(`/api/backup?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(error.error || 'Download failed');
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition.match(/filename="([^"]+)"/i)?.[1];
  const fileName = encoded ? decodeURIComponent(encoded) : quoted || `dreambox-${source}-backup`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

export async function createBackup(): Promise<BackupManifestEntry> {
  const res = await api.post<BackupCreateResponse>('/api/backup', {});
  if (!res.success || !res.backup) throw new Error('Backup creation failed');
  return res.backup;
}

export async function deleteBackup(id: string): Promise<void> {
  await api.delete<{ success: boolean }>(`/api/backup`, { id });
}

export async function restoreBackup(id: string): Promise<BackupRestoreResponse> {
  return api.put<BackupRestoreResponse>(`/api/backup`, {}, { id });
}

export async function restoreBackupFromData(data: Record<string, any[]>): Promise<BackupRestoreResponse> {
  return api.post<BackupRestoreResponse>('/api/backup?action=restore', data);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatBackupDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
