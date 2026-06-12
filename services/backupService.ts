import { api } from './apiClient';

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

export interface BackupListResponse {
  backups: BackupManifestEntry[];
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
