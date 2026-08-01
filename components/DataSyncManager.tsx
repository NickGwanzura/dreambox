
import React, { useState, useCallback, useEffect } from 'react';
import {
  RefreshCw,
  Cloud,
  Database,
  Download,
  Upload,
  Clock,
  ShieldCheck,
  Server,
  HardDrive,
  Wifi,
  WifiOff,
  CheckCircle2,
  Archive,
  Trash2,
  RotateCcw,
  FileArchive,
  LockKeyhole,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import {
  checkDatabaseHealth,
  getDatabaseStats,
  exportAllData,
} from '../services/storage';
import {
  useSync,
  forceSyncNow,
  pullAllFromDatabase,
  pushAllToDatabase,
} from '../services/databaseSyncManager';
import {
  listBackupInventory,
  createBackup,
  deleteBackup,
  restoreBackup,
  downloadBackup,
  formatBytes,
  formatBackupDate,
  type BackupManifestEntry,
  type DatabaseBackupEntry,
} from '../services/backupService';
import { logger } from '../utils/logger';

export const DataSyncManager: React.FC = () => {
  const { showToast } = useToast();
  const syncStatus = useSync();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoringFromCloud, setIsRestoringFromCloud] = useState(false);
  const [backups, setBackups] = useState<BackupManifestEntry[]>([]);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackupEntry[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [dbStats, setDbStats] = useState<{ tables: Record<string, number>; totalRecords: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ configured: boolean; connected: boolean; error?: string } | null>(null);

  useEffect(() => {
    checkConnection();
    loadStats();
    loadBackups();
  }, []);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const inventory = await listBackupInventory();
      setBackups(inventory.backups);
      setDatabaseBackups(inventory.databaseBackups);
    } catch (e: any) {
      logger.error('[DataSyncManager] Failed to load backups', e.message);
      showToast('Backup inventory could not be loaded: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setBackupsLoading(false);
    }
  }, [showToast]);

  const checkConnection = async () => {
    const health = await checkDatabaseHealth();
    setConnectionStatus(health);
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    showToast('Starting force sync...', 'info');

    const success = await forceSyncNow();

    if (success) {
      showToast('Force sync complete! Database is up to date.', 'success');
      await loadStats();
    } else {
      showToast('Sync failed or already in progress. Check connection.', 'error');
    }

    setIsSyncing(false);
  };

  const handlePullFromCloud = async () => {
    setIsPulling(true);
    showToast('Pulling data from the application database...', 'info');

    const result = await pullAllFromDatabase();

    if (result.success) {
      showToast('Pulled data from the application database. Reloading...', 'success');
      window.location.reload();
    } else {
      const failedTables = Object.entries(result.results)
        .filter(([, v]) => v.error)
        .map(([k]) => k);
      const msg = failedTables.length > 0
        ? `Pull partially failed (${failedTables.join(', ')}). Check connection.`
        : 'Pull failed. Check connection.';
      showToast(msg, 'error');
    }

    setIsPulling(false);
  };

  const handlePushToCloud = async () => {
    setIsPushing(true);
    showToast('Pushing local data to the application database...', 'info');

    const result = await pushAllToDatabase();

    if (result.success) {
      const totalSynced = Object.values(result.results).reduce((a, b) => a + b.synced, 0);
      showToast(`Pushed ${totalSynced} records to the application database`, 'success');
    } else {
      const totalFailed = Object.values(result.results).reduce((a, b) => a + b.failed, 0);
      showToast(`Push completed with ${totalFailed} failure(s). Check logs.`, 'error');
    }

    setIsPushing(false);
  };

  // Auto-sync is now enforced — always active when connected.
  // No toggle needed.

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    showToast('Preparing data export...', 'info');

    const result = await exportAllData();

    if (result.error) {
      showToast('Export failed: ' + result.error, 'error');
    } else if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dreambox-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Backup downloaded successfully!', 'success');
    }

    setIsExporting(false);
  }, [showToast]);

  const loadStats = useCallback(async () => {
    const stats = await getDatabaseStats();
    setDbStats(stats);
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    showToast('Creating cloud backup...', 'info');
    try {
      const backup = await createBackup();
      setBackups(prev => [backup, ...prev]);
      showToast(`Backup created: ${backup.recordCount.toLocaleString()} records`, 'success');
    } catch (e: any) {
      showToast('Backup failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownloadBackup = async (
    backup: BackupManifestEntry | DatabaseBackupEntry,
    source: 'application' | 'database',
  ) => {
    setDownloadingId(backup.id);
    try {
      const fileName = await downloadBackup(backup, source);
      showToast(`${fileName} downloaded`, 'success');
    } catch (e: any) {
      showToast('Download failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRestoreBackup = async (backup: BackupManifestEntry) => {
    if (!confirm(`Restore backup from ${formatBackupDate(backup.createdAt)}? This will overwrite matching records.`)) return;
    setIsRestoringFromCloud(true);
    showToast('Restoring backup...', 'info');
    try {
      const result = await restoreBackup(backup.id);
      if (result.success && result.errors.length === 0) {
        showToast(`Restored ${result.restored.toLocaleString()} records. Reloading...`, 'success');
        window.location.reload();
      } else if (result.success && result.errors.length > 0) {
        showToast(`Restored with ${result.errors.length} warning(s). Reloading...`, 'warning');
        window.location.reload();
      } else {
        showToast('Restore failed: ' + (result.errors[0] || 'Unknown error'), 'error');
      }
    } catch (e: any) {
      showToast('Restore failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setIsRestoringFromCloud(false);
    }
  };

  const handleDeleteBackup = async (backup: BackupManifestEntry) => {
    if (!confirm(`Delete backup from ${formatBackupDate(backup.createdAt)}?`)) return;
    try {
      await deleteBackup(backup.id);
      setBackups(prev => prev.filter(b => b.id !== backup.id));
      showToast('Backup deleted', 'success');
    } catch (e: any) {
      showToast('Delete failed: ' + (e.message || 'Unknown error'), 'error');
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getNextSyncTime = () => {
    if (!syncStatus.lastSyncTime || !syncStatus.isAutoSyncRunning) return '--:--:--';
    const nextSync = syncStatus.lastSyncTime + 30000;
    return formatTime(nextSync);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      <div className={`p-6 rounded-2xl border flex items-center gap-4 ${
        connectionStatus?.connected
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className={`p-3 rounded-xl ${
          connectionStatus?.connected
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-amber-100 text-amber-600'
        }`}>
          {connectionStatus?.connected ? <Wifi size={24} /> : <WifiOff size={24} />}
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-bold ${
            connectionStatus?.connected ? 'text-emerald-800' : 'text-amber-800'
          }`}>
            {connectionStatus?.connected ? 'Application Database Connected' : 'Application Database Disconnected'}
          </h3>
          <p className={`text-sm ${
            connectionStatus?.connected ? 'text-emerald-600' : 'text-amber-600'
          }`}>
            {connectionStatus?.connected
              ? '100% persistence active. Data syncs every 30 seconds.'
              : connectionStatus?.error || 'Check your application database configuration'}
          </p>
        </div>
        {connectionStatus?.connected && (
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-emerald-200">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-emerald-700">Live</span>
          </div>
        )}
      </div>

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-indigo-500" />
            <span className="text-slate-900 text-sm font-medium">Last Sync</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatTime(syncStatus.lastSyncTime)}
          </div>
          <div className="text-sm text-slate-900 mt-1">
            Next: {getNextSyncTime()}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className={`w-5 h-5 ${syncStatus.isAutoSyncRunning ? 'text-emerald-500' : 'text-slate-900'}`} />
            <span className="text-slate-900 text-sm font-medium">Auto-Sync</span>
          </div>
          <div className={`text-2xl font-bold ${syncStatus.isAutoSyncRunning ? 'text-emerald-600' : 'text-slate-900'}`}>
            {syncStatus.isAutoSyncRunning ? 'ON' : 'OFF'}
          </div>
          <div className="text-sm text-slate-900 mt-1">
            {syncStatus.isAutoSyncRunning ? '30 second interval' : 'Manual sync only'}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <span className="text-slate-900 text-sm font-medium">Pending</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {syncStatus.pendingCount}
          </div>
          <div className="text-sm text-slate-900 mt-1">
            items queued for sync
          </div>
        </div>
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={handleForceSync}
          disabled={isSyncing || !connectionStatus?.connected}
          className="flex items-center justify-center gap-3 px-4 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Force Sync</div>
            <div className="text-xs opacity-75">Push & Pull</div>
          </div>
        </button>

        <button
          onClick={handlePullFromCloud}
          disabled={isPulling || !connectionStatus?.connected}
          className="flex items-center justify-center gap-3 px-4 py-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-700 rounded-xl font-medium transition-all"
        >
          <Download className={`w-5 h-5 text-indigo-500 ${isPulling ? 'animate-bounce' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Pull from Database</div>
            <div className="text-xs text-slate-900">Database &rarr; Local</div>
          </div>
        </button>

        <button
          onClick={handlePushToCloud}
          disabled={isPushing || !connectionStatus?.connected}
          className="flex items-center justify-center gap-3 px-4 py-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-700 rounded-xl font-medium transition-all"
        >
          <Upload className={`w-5 h-5 text-indigo-500 ${isPushing ? 'animate-bounce' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Push to Database</div>
            <div className="text-xs text-slate-900">Local &rarr; Database</div>
          </div>
        </button>

        <div
          className={`flex items-center justify-center gap-3 px-4 py-4 rounded-xl font-medium ${
            connectionStatus?.connected
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-slate-50 border border-slate-200 text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <div className="text-left">
            <div className="text-sm font-bold">
              Auto-Sync Active
            </div>
            <div className="text-xs opacity-75">
              Always on when connected
            </div>
          </div>
        </div>
      </div>

      {/* Database Stats */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-900" />
            <h3 className="text-lg font-bold text-slate-800">Database Statistics</h3>
          </div>
          <button
            onClick={loadStats}
            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {dbStats ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(dbStats.tables).map(([table, count]) => (
              <div key={table} className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                <div className="text-2xl font-bold text-slate-800">
                  {typeof count === 'number' && count >= 0 ? count : '?'}
                </div>
                <div className="text-xs text-slate-900 capitalize mt-1">
                  {table.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
            <div className="bg-indigo-50 p-4 rounded-xl text-center border border-indigo-100">
              <div className="text-2xl font-bold text-indigo-600">
                {dbStats.totalRecords.toLocaleString()}
              </div>
              <div className="text-xs text-indigo-500 mt-1">Total Records</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-900 py-8">
            Click refresh to load database statistics
          </div>
        )}
      </div>

      {/* Export & Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-5 h-5 text-slate-900" />
            <h3 className="text-lg font-bold text-slate-800">Local Backup</h3>
          </div>

          <p className="text-slate-900 text-sm mb-4">
            Download a complete JSON backup of all your data. This is useful for offline storage or migration.
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 rounded-xl font-medium transition-all"
          >
            <Download className="w-5 h-5" />
            {isExporting ? 'Exporting...' : 'Export JSON Backup'}
          </button>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold">How Data Persistence Works</h3>
          </div>
          <ul className="text-sm text-slate-300 space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">&bull;</span>
              <span><strong className="text-white">The application database is the source of truth</strong> &mdash; Financial records are stored server-side in PostgreSQL.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">&bull;</span>
              <span><strong className="text-white">Auto-refresh</strong> &mdash; The interface periodically refreshes server-authoritative records.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">&bull;</span>
              <span><strong className="text-white">Prisma ORM</strong> &mdash; Type-safe database access via deployment platform API functions</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">&bull;</span>
              <span><strong className="text-white">100% persistence</strong> &mdash; Your data is never lost, even if you clear browser data</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Backup Center */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="backup-center-title">
        <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-500/15 p-2.5 text-blue-300">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="backup-center-title" className="text-lg font-bold">Backup Center</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                  Download human-readable application exports or full PostgreSQL recovery snapshots. Every download is recorded in the audit log.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadBackups}
                disabled={backupsLoading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${backupsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={isBackingUp}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Archive className={`h-4 w-4 ${isBackingUp ? 'animate-pulse' : ''}`} aria-hidden="true" />
                {isBackingUp ? 'Creating…' : 'Create application backup'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Application exports</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{backups.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Database snapshots</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{databaseBackups.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Access</p>
              <p className="mt-1 text-sm font-bold text-emerald-100">Administrator only</p>
            </div>
          </div>
        </div>

        <div className="space-y-8 p-5 sm:p-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <div>
                <h4 className="font-bold text-slate-900">Database recovery snapshots</h4>
                <p className="text-xs text-slate-600">Compressed PostgreSQL backups for disaster recovery and independent custody.</p>
              </div>
            </div>
            <BackupTableEmptyOrLoading
              loading={backupsLoading}
              empty={databaseBackups.length === 0}
              emptyMessage="No database snapshot is visible yet. The scheduled backup job will place snapshots here."
            >
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[680px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Snapshot</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {databaseBackups.map(backup => (
                      <tr key={backup.id} className="transition-colors hover:bg-slate-50">
                        <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs font-semibold text-slate-800" title={backup.fileName}>{backup.fileName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatBackupDate(backup.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{formatBytes(backup.size)}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Available</span></td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDownloadBackup(backup, 'database')}
                            disabled={downloadingId === backup.id}
                            aria-label={`Download database snapshot ${backup.fileName}`}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                          >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            {downloadingId === backup.id ? 'Downloading…' : 'Download'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BackupTableEmptyOrLoading>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <div>
                <h4 className="font-bold text-slate-900">Application data exports</h4>
                <p className="text-xs text-slate-600">Readable JSON exports with record counts and the staff member who created them.</p>
              </div>
            </div>
            <BackupTableEmptyOrLoading
              loading={backupsLoading}
              empty={backups.length === 0}
              emptyMessage="No application exports yet. Create one to capture the current business records."
            >
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Records</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Created by</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map(backup => (
                      <tr key={backup.id} className="transition-colors hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-800">{formatBackupDate(backup.createdAt)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{backup.recordCount.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{formatBytes(backup.size)}</td>
                        <td className="px-4 py-3 text-slate-700">{backup.createdBy}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleDownloadBackup(backup, 'application')}
                              disabled={downloadingId === backup.id}
                              aria-label={`Download application backup from ${formatBackupDate(backup.createdAt)}`}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                              Download
                            </button>
                            <button
                              onClick={() => handleRestoreBackup(backup)}
                              disabled={isRestoringFromCloud}
                              aria-label={`Restore application backup from ${formatBackupDate(backup.createdAt)}`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40"
                              title="Restore"
                            >
                              <RotateCcw className={`h-4 w-4 ${isRestoringFromCloud ? 'animate-spin' : ''}`} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(backup)}
                              aria-label={`Delete application backup from ${formatBackupDate(backup.createdAt)}`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BackupTableEmptyOrLoading>
          </div>
        </div>
      </section>
    </div>
  );
};

const BackupTableEmptyOrLoading: React.FC<{
  loading: boolean;
  empty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}> = ({ loading, empty, emptyMessage, children }) => {
  if (loading) {
    return (
      <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600" role="status">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading backups…
      </div>
    );
  }
  if (empty) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">{emptyMessage}</div>;
  }
  return <>{children}</>;
};

export default DataSyncManager;
