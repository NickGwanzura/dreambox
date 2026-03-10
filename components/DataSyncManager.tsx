
import React, { useState, useCallback, useEffect } from 'react';
import { 
  RefreshCw, 
  Cloud, 
  Database, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  Server,
  Play,
  Pause,
  HardDrive,
  ArrowUpDown
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
} from '../services/supabaseSyncManager';
import { logger } from '../utils/logger';

export const DataSyncManager: React.FC = () => {
  const { showToast } = useToast();
  const syncStatus = useSupabaseSync();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [dbStats, setDbStats] = useState<{ tables: Record<string, number>; totalRecords: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ configured: boolean; connected: boolean; error?: string } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(syncStatus.isAutoSyncRunning);

  useEffect(() => {
    checkConnection();
    loadStats();
  }, []);

  useEffect(() => {
    setAutoSyncEnabled(syncStatus.isAutoSyncRunning);
  }, [syncStatus.isAutoSyncRunning]);

  const checkConnection = async () => {
    const health = await checkSupabaseHealth();
    setConnectionStatus(health);
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
      showToast(`Pulled data from cloud. Reloading...`, 'success');
      window.location.reload();
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
            <span className="text-slate-500 text-sm font-medium">Last Sync</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatTime(syncStatus.lastSyncTime)}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Next: {getNextSyncTime()}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className={`w-5 h-5 ${autoSyncEnabled ? 'text-emerald-500' : 'text-slate-400'}`} />
            <span className="text-slate-500 text-sm font-medium">Auto-Sync</span>
          </div>
          <div className={`text-2xl font-bold ${autoSyncEnabled ? 'text-emerald-600' : 'text-slate-500'}`}>
            {autoSyncEnabled ? 'ON' : 'OFF'}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            {autoSyncEnabled ? '30 second interval' : 'Manual sync only'}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <span className="text-slate-500 text-sm font-medium">Pending</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {syncStatus.pendingCount}
          </div>
          <div className="text-sm text-slate-400 mt-1">
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
            <div className="text-sm font-bold">Pull from Cloud</div>
            <div className="text-xs text-slate-500">Supabase → Local</div>
          </div>
        </button>

        <button
          onClick={handlePushToCloud}
          disabled={isPushing || !connectionStatus?.connected}
          className="flex items-center justify-center gap-3 px-4 py-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-700 rounded-xl font-medium transition-all"
        >
          <Upload className={`w-5 h-5 text-indigo-500 ${isPushing ? 'animate-bounce' : ''}`} />
          <div className="text-left">
            <div className="text-sm font-bold">Push to Cloud</div>
            <div className="text-xs text-slate-500">Local → Supabase</div>
          </div>
        </button>

        <button
          onClick={handleToggleAutoSync}
          disabled={!connectionStatus?.connected}
          className={`flex items-center justify-center gap-3 px-4 py-4 rounded-xl font-medium transition-all ${
            autoSyncEnabled 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
              : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:bg-slate-100'
          }`}
        >
          {autoSyncEnabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          <div className="text-left">
            <div className="text-sm font-bold">
              {autoSyncEnabled ? 'Stop Auto-Sync' : 'Start Auto-Sync'}
            </div>
            <div className={`text-xs ${autoSyncEnabled ? 'opacity-75' : 'text-slate-500'}`}>
              {autoSyncEnabled ? 'Currently running' : 'Enable 30s sync'}
            </div>
          </div>
        </button>
      </div>

      {/* Database Stats */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-400" />
            <h3 className="text-lg font-bold text-slate-800">Cloud Database Statistics</h3>
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
                  {count >= 0 ? count : '?'}
                </div>
                <div className="text-xs text-slate-500 capitalize mt-1">
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
          <div className="text-center text-slate-400 py-8">
            Click refresh to load database statistics
          </div>
        )}
      </div>

      {/* Export & Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-5 h-5 text-slate-400" />
            <h3 className="text-lg font-bold text-slate-800">Local Backup</h3>
          </div>
          
          <p className="text-slate-500 text-sm mb-4">
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
              <span className="text-indigo-400 mt-1">•</span>
              <span><strong className="text-white">Supabase is the source of truth</strong> — All data is stored permanently in your Supabase database</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">•</span>
              <span><strong className="text-white">Auto-sync every 30 seconds</strong> — Local changes are automatically pushed to Supabase</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">•</span>
              <span><strong className="text-white">Keep-alive pings</strong> — Prevents Supabase from sleeping (60 second intervals)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-400 mt-1">•</span>
              <span><strong className="text-white">100% persistence</strong> — Your data is never lost, even if you clear browser data</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataSyncManager;
