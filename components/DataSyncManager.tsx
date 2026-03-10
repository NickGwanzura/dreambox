
import React, { useState, useCallback, useEffect } from 'react';
import { 
  RefreshCw, 
  Cloud, 
  Database, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  Activity,
  HardDrive,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  ArrowUpDown,
  Server,
  Play,
  Pause,
  Settings
} from 'lucide-react';
import { useToast } from './ToastProvider';
import { 
  checkSupabaseHealth, 
  getDatabaseStats, 
  exportAllData,
} from '../services/storage';
import { 
  useSupabaseSync, 
  forceSyncNow, 
  startAutoSync, 
  stopAutoSync,
  pullAllFromSupabase,
  pushAllToSupabase,
  getSyncStatus
} from '../services/supabaseSyncManager';
import { logger } from '../utils/logger';

interface SyncStatus {
  table: string;
  status: 'idle' | 'syncing' | 'success' | 'error';
  count: number;
  error?: string;
}

export const DataSyncManager: React.FC = () => {
  const { showToast } = useToast();
  const syncStatus = useSupabaseSync();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([
    { table: 'Users', status: 'idle', count: 0 },
    { table: 'Billboards', status: 'idle', count: 0 },
    { table: 'Clients', status: 'idle', count: 0 },
    { table: 'Contracts', status: 'idle', count: 0 },
    { table: 'Invoices', status: 'idle', count: 0 },
    { table: 'Tasks', status: 'idle', count: 0 },
  ]);
  const [dbStats, setDbStats] = useState<{ tables: Record<string, number>; totalRecords: number } | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ configured: boolean; connected: boolean; error?: string } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(syncStatus.isAutoSyncRunning);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
    loadStats();
  }, []);

  // Update auto-sync status
  useEffect(() => {
    setAutoSyncEnabled(syncStatus.isAutoSyncRunning);
  }, [syncStatus.isAutoSyncRunning]);

  const checkConnection = async () => {
    const health = await checkSupabaseHealth();
    setConnectionStatus(health);
  };

  const updateSyncStatus = (table: string, updates: Partial<SyncStatus>) => {
    setSyncStatuses(prev => prev.map(s => 
      s.table === table ? { ...s, ...updates } : s
    ));
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    showToast('Starting force sync...', 'info');

    const success = await forceSyncNow();
    
    if (success) {
      showToast('Force sync complete! Supabase is up to date.', 'success');
      await loadStats();
    } else {
      showToast('Sync failed. Check connection.', 'error');
    }

    setIsSyncing(false);
  };

  const handlePullFromCloud = async () => {
    setIsPulling(true);
    showToast('Pulling data from Supabase...', 'info');

    const result = await pullAllFromSupabase();
    
    if (result.success) {
      showToast(`Pulled ${result.results ? Object.values(result.results).reduce((a, b) => a + (b?.count || 0), 0) : 0} records from cloud`, 'success');
      window.location.reload(); // Reload to refresh all data
    } else {
      showToast('Pull failed. Check connection.', 'error');
    }

    setIsPulling(false);
  };

  const handlePushToCloud = async () => {
    setIsPushing(true);
    showToast('Pushing all local data to Supabase...', 'info');

    const result = await pushAllToSupabase();
    
    if (result.success) {
      const totalSynced = Object.values(result.results).reduce((a, b) => a + b.synced, 0);
      showToast(`Pushed ${totalSynced} records to cloud`, 'success');
    } else {
      showToast('Push failed. Check connection.', 'error');
    }

    setIsPushing(false);
  };

  const handleToggleAutoSync = () => {
    if (autoSyncEnabled) {
      stopAutoSync();
      showToast('Auto-sync stopped', 'info');
    } else {
      const started = startAutoSync();
      if (started) {
        showToast('Auto-sync started (30s interval)', 'success');
      } else {
        showToast('Failed to start auto-sync', 'error');
      }
    }
    setAutoSyncEnabled(!autoSyncEnabled);
  };

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
    setShowStats(true);
  }, []);

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

  const getStatusIcon = (status: SyncStatus['status']) => {
    switch (status) {
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-slate-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      <div className={`p-4 rounded-2xl border flex items-center gap-4 ${
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
          <h3 className={`font-bold ${
            connectionStatus?.connected ? 'text-emerald-800' : 'text-amber-800'
          }`}>
            {connectionStatus?.connected ? 'Supabase Connected' : 'Supabase Disconnected'}
          </h3>
          <p className={`text-sm ${
            connectionStatus?.connected ? 'text-emerald-600' : 'text-amber-600'
          }`}>
            {connectionStatus?.connected 
              ? '100% persistence active. Data syncs every 30 seconds.' 
              : connectionStatus?.error || 'Check your Supabase configuration'}
          </p>
        </div>
        {connectionStatus?.connected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-emerald-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">Live</span>
          </div>
        )}
      </div>

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-indigo-400" />
            <span className="text-slate-400 text-sm">Last Sync</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatTime(syncStatus.lastSyncTime)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Next: {getNextSyncTime()}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className={`w-5 h-5 ${autoSyncEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="text-slate-400 text-sm">Auto-Sync</span>
          </div>
          <div className={`text-2xl font-bold ${autoSyncEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
            {autoSyncEnabled ? 'ON' : 'OFF'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {autoSyncEnabled ? '30 second interval' : 'Manual sync only'}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Cloud className="w-5 h-5 text-blue-400" />
            <span className="text-slate-400 text-sm">Pending</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {syncStatus.pendingCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            items queued for sync
          </div>
        </div>
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={handleForceSync}
          disabled={isSyncing || !connectionStatus?.connected}
          className="flex items-center justify-center gap-2 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
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
          className="flex items-center justify-center gap-2 px-4 py-4 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
        >
          <Download className={`w-5 h-5 ${isPulling ? 'animate-bounce' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Pull from Cloud</div>
            <div className="text-xs opacity-75">Supabase → Local</div>
          </div>
        </button>

        <button
          onClick={handlePushToCloud}
          disabled={isPushing || !connectionStatus?.connected}
          className="flex items-center justify-center gap-2 px-4 py-4 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
        >
          <Upload className={`w-5 h-5 ${isPushing ? 'animate-bounce' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Push to Cloud</div>
            <div className="text-xs opacity-75">Local → Supabase</div>
          </div>
        </button>

        <button
          onClick={handleToggleAutoSync}
          disabled={!connectionStatus?.connected}
          className={`flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-medium transition-all ${
            autoSyncEnabled 
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
              : 'bg-slate-700 hover:bg-slate-600 text-white disabled:bg-slate-800'
          }`}
        >
          {autoSyncEnabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          <div className="text-left">
            <div className="text-sm font-bold">
              {autoSyncEnabled ? 'Stop Auto-Sync' : 'Start Auto-Sync'}
            </div>
            <div className="text-xs opacity-75">
              {autoSyncEnabled ? 'Currently running' : 'Enable 30s sync'}
            </div>
          </div>
        </button>
      </div>

      {/* Data Stats */}
      <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4" />
            Cloud Database Stats
          </h3>
          <button 
            onClick={loadStats}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
        
        {dbStats ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(dbStats.tables).map(([table, count]) => (
              <div key={table} className="bg-slate-900/50 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-white">
                  {count >= 0 ? count : '?'}
                </div>
                <div className="text-xs text-slate-400 capitalize mt-1">
                  {table.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
            <div className="bg-indigo-900/30 border border-indigo-500/20 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-indigo-400">
                {dbStats.totalRecords.toLocaleString()}
              </div>
              <div className="text-xs text-indigo-300 mt-1">Total Records</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-500 py-8">
            Click refresh to load database statistics
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <HardDrive className="w-4 h-4" />
          Local Backup
        </h3>
        
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <p className="text-slate-400 text-sm flex-1">
            Download a complete JSON backup of all your data. This is useful for offline storage or migration.
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-xl font-medium transition-all whitespace-nowrap"
          >
            <Download className="w-5 h-5" />
            {isExporting ? 'Exporting...' : 'Export JSON Backup'}
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-500/20 rounded-2xl p-6">
        <h4 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
          <Server className="w-5 h-5" />
          How Data Persistence Works
        </h4>
        <ul className="text-sm text-slate-400 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            <span><strong>Supabase is the source of truth</strong> - All data is stored permanently in your Supabase database</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            <span><strong>Auto-sync every 30 seconds</strong> - Local changes are automatically pushed to Supabase</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            <span><strong>Keep-alive pings</strong> - Prevents Supabase from sleeping (60 second intervals)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            <span><strong>100% persistence</strong> - Your data is never lost, even if you clear browser data</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default DataSyncManager;
