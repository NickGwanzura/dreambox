
import React, { useState, useCallback } from 'react';
import { 
  RefreshCw, 
  Cloud, 
  Database, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  Activity,
  HardDrive
} from 'lucide-react';
import { useToast } from './ToastProvider';
import { 
  checkSupabaseHealth, 
  getDatabaseStats, 
  exportAllData,
  fetchUsersFromSupabase,
  fetchBillboardsFromSupabase,
  fetchClientsFromSupabase,
  fetchContractsFromSupabase,
  fetchInvoicesFromSupabase,
  fetchTasksFromSupabase,
} from '../services/storage';
import { triggerFullSync } from '../services/mockData';
import { logger } from '../utils/logger';

interface SyncStatus {
  table: string;
  status: 'idle' | 'syncing' | 'success' | 'error';
  count: number;
  error?: string;
}

export const DataSyncManager: React.FC = () => {
  const { showToast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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

  const updateSyncStatus = (table: string, updates: Partial<SyncStatus>) => {
    setSyncStatuses(prev => prev.map(s => 
      s.table === table ? { ...s, ...updates } : s
    ));
  };

  const syncAllFromSupabase = useCallback(async () => {
    setIsSyncing(true);
    
    // Check connection first
    const health = await checkSupabaseHealth();
    if (!health.connected) {
      showToast('Cannot connect to Supabase: ' + (health.error || 'Unknown error'), 'error');
      setIsSyncing(false);
      return;
    }

    showToast('Starting sync from Supabase...', 'info');

    // Sync each table
    const syncTasks = [
      { table: 'Users', fn: fetchUsersFromSupabase },
      { table: 'Billboards', fn: fetchBillboardsFromSupabase },
      { table: 'Clients', fn: fetchClientsFromSupabase },
      { table: 'Contracts', fn: fetchContractsFromSupabase },
      { table: 'Invoices', fn: fetchInvoicesFromSupabase },
      { table: 'Tasks', fn: fetchTasksFromSupabase },
    ];

    for (const task of syncTasks) {
      updateSyncStatus(task.table, { status: 'syncing' });
      
      try {
        const result = await task.fn({ limit: 10000 });
        
        if (result.error) {
          updateSyncStatus(task.table, { 
            status: 'error', 
            error: result.error,
            count: 0 
          });
          logger.error(`Sync error for ${task.table}:`, result.error);
        } else {
          updateSyncStatus(task.table, { 
            status: 'success', 
            count: result.count 
          });
          logger.info(`Synced ${result.count} ${task.table.toLowerCase()}`);
        }
      } catch (e: any) {
        updateSyncStatus(task.table, { 
          status: 'error', 
          error: e.message,
          count: 0 
        });
      }
    }

    // Also trigger the existing full sync to merge with local
    await triggerFullSync();
    
    showToast('Sync complete!', 'success');
    setIsSyncing(false);
  }, [showToast]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    showToast('Preparing data export...', 'info');

    const result = await exportAllData();
    
    if (result.error) {
      showToast('Export failed: ' + result.error, 'error');
    } else if (result.data) {
      // Download as JSON file
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-400" />
            Cloud Data Sync
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Synchronize your data with Supabase cloud storage
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={syncAllFromSupabase}
          disabled={isSyncing}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync from Cloud'}
        </button>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
        >
          <Download className="w-5 h-5" />
          {isExporting ? 'Exporting...' : 'Export Backup'}
        </button>

        <button
          onClick={loadStats}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-all"
        >
          <Activity className="w-5 h-5" />
          View Stats
        </button>
      </div>

      {/* Sync Status */}
      <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Sync Status
        </h3>
        
        <div className="space-y-3">
          {syncStatuses.map((status) => (
            <div 
              key={status.table}
              className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(status.status)}
                <span className="text-white font-medium">{status.table}</span>
              </div>
              
              <div className="flex items-center gap-3">
                {status.count > 0 && (
                  <span className="text-sm text-slate-400">
                    {status.count} records
                  </span>
                )}
                {status.error && (
                  <span className="text-xs text-red-400" title={status.error}>
                    Error
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Database Stats */}
      {showStats && dbStats && (
        <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Database Statistics
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(dbStats.tables).map(([table, count]) => (
              <div key={table} className="bg-slate-900/50 p-4 rounded-xl">
                <div className="text-2xl font-bold text-white">
                  {count >= 0 ? count : '?'}
                </div>
                <div className="text-xs text-slate-400 capitalize">
                  {table.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Records</span>
              <span className="text-xl font-bold text-emerald-400">
                {dbStats.totalRecords.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-sm text-slate-500 space-y-1">
        <p>• Sync pulls the latest data from Supabase cloud storage</p>
        <p>• Export creates a JSON backup file of all your data</p>
        <p>• Data is automatically synced when you make changes</p>
      </div>
    </div>
  );
};

export default DataSyncManager;
