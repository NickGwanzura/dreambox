
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Map, Users, FileText, CreditCard, Receipt, Settings as SettingsIcon,
  Menu, X, Bell, LogOut, Printer, Globe, PieChart, Wallet, ChevronRight, CheckSquare, Wrench, Database, RefreshCw,
  Building2, Target
} from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { signOut } from '../services/supabaseAuth';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useToast } from './ToastProvider';
import { 
  getSystemAlertCount, 
  triggerAutoBackup, 
  runAutoBilling, 
  runMaintenanceCheck, 
  triggerFullSync,
  subscribe
} from '../services/mockData';
import { realtimeSync } from '../services/storage/realtimeSync';
import { logger } from '../utils/logger';
import { 
  ALERT_CHECK_INTERVAL_MS,
  BACKUP_INTERVAL_MS,
  BILLING_INTERVAL_MS,
  MAINTENANCE_INTERVAL_MS,
  APP_VERSION
} from '../services/constants';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [dbConnected, setDbConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  const user = getCurrentUser();
  const { showToast } = useToast();
  
  // Use refs for intervals to properly clean up
  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  // Sync function with debouncing
  const performSync = useCallback(async (showNotification = false) => {
    if (!dbConnected || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const ok = await triggerFullSync();
      setLastSyncTime(new Date());
      
      if (showNotification) {
        showToast(ok ? 'Cloud sync complete' : 'Cloud sync failed', ok ? 'success' : 'error');
      }
      
      if (ok) {
        logger.debug('Cloud sync completed successfully');
      } else {
        logger.warn('Cloud sync failed');
      }
    } catch (error) {
      logger.error('Sync error:', error);
      if (showNotification) {
        showToast('Sync error occurred', 'error');
      }
    } finally {
      // Keep "Syncing..." visible briefly for user feedback
      setTimeout(() => setIsSyncing(false), 500);
    }
  }, [dbConnected, isSyncing, showToast]);

  // Initialize and setup intervals
  useEffect(() => {
    // Initial checks
    setAlertCount(getSystemAlertCount());
    triggerAutoBackup();
    runAutoBilling();
    runMaintenanceCheck();
    setDbConnected(isSupabaseConfigured());

    // Setup intervals - store in ref for cleanup
    const alertInterval = setInterval(() => setAlertCount(getSystemAlertCount()), ALERT_CHECK_INTERVAL_MS);
    const backupInterval = setInterval(() => triggerAutoBackup(), BACKUP_INTERVAL_MS);
    const billingInterval = setInterval(() => runAutoBilling(), BILLING_INTERVAL_MS);
    const maintenanceInterval = setInterval(() => runMaintenanceCheck(), MAINTENANCE_INTERVAL_MS);
    
    intervalsRef.current = [
      alertInterval,
      backupInterval,
      billingInterval,
      maintenanceInterval,
    ];

    // Window focus handler for sync
    const handleFocus = () => {
      logger.debug('Window focused - triggering sync');
      performSync(false);
    };
    window.addEventListener('focus', handleFocus);

    // Subscribe to data changes for real-time updates
    const unsubscribe = subscribe(() => {
      setAlertCount(getSystemAlertCount());
    });

    return () => {
      // Clean up all intervals
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      window.removeEventListener('focus', handleFocus);
      unsubscribe();
    };
  }, [performSync]);

  // Setup Supabase Realtime subscriptions
  useEffect(() => {
    if (!dbConnected) return;

    logger.info('Setting up Supabase Realtime subscriptions');
    
    // Subscribe to all relevant tables
    const unsubscribers = [
      realtimeSync.subscribe('billboards', () => performSync(false)),
      realtimeSync.subscribe('clients', () => performSync(false)),
      realtimeSync.subscribe('contracts', () => performSync(false)),
      realtimeSync.subscribe('invoices', () => performSync(false)),
      realtimeSync.subscribe('tasks', () => performSync(false)),
    ];

    return () => {
      logger.debug('Cleaning up realtime subscriptions');
      unsubscribers.forEach(unsub => unsub());
      realtimeSync.unsubscribeAll();
    };
  }, [dbConnected, performSync]);

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: null },
    { id: 'analytics', label: 'Profit & Analytics', icon: PieChart, roles: ['Admin', 'Manager'] },
    { id: 'crm', label: 'CRM & Outreach', icon: Target, roles: null },
    { id: 'billboards', label: 'Billboards', icon: Map, roles: null },
    { id: 'contracts', label: 'Contracts', icon: FileText, roles: null },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'outsourced', label: 'Outsourced', icon: Globe, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'payments', label: 'Payments', icon: Wallet, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'clients', label: 'Clients', icon: Users, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'financials', label: 'Invoices & Quotes', icon: CreditCard, roles: null },
    { id: 'receipts', label: 'Receipts', icon: Receipt, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'expenses', label: 'Expenses', icon: Printer, roles: ['Admin', 'Manager', 'Staff'] },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['Admin', 'Manager'] },
  ];

  const userRole = user?.role || 'Staff';
  const menuItems = allMenuItems.filter(item => !item.roles || item.roles.includes(userRole));

  const handleLogout = async () => { 
    await signOut(); 
    onLogout(); 
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f172a] text-slate-200 supports-[height:100dvh]:h-[100dvh]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[100] w-64 sm:w-72 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] lg:translate-x-0 lg:relative flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-[#1e293b] shadow-2xl border-r border-slate-700/50 overflow-hidden`}
        aria-label="Main navigation"
      >
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-[#1e293b] to-slate-950 z-0"></div>
        <div className="absolute top-0 left-0 w-full h-96 bg-indigo-600/5 blur-[120px] rounded-full z-0 pointer-events-none"></div>

        {/* Sidebar Header */}
        <div className="relative z-10 flex items-center justify-between p-6 shrink-0 border-b border-slate-700/50">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => onNavigate('dashboard')}>
             <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300 border border-white/10">
               D
             </div>
             <div>
                <span className="font-bold text-xl tracking-tight text-white block leading-none">Dreambox</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Advertising</span>
             </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="lg:hidden text-slate-400 hover:text-white transition-colors p-1"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                className={`group flex items-center w-full px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative overflow-hidden ${
                  isActive 
                    ? 'text-white shadow-md shadow-indigo-900/20' 
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/90 to-violet-600/90 rounded-xl z-0"></div>
                )}
                <div className="relative z-10 flex items-center w-full">
                    <Icon size={20} className={`mr-3 shrink-0 transition-transform duration-300 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400 group-hover:scale-110'}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive && <ChevronRight size={16} className="text-white/70" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="relative z-10 p-6 bg-[#0f1219]/80 backdrop-blur-md border-t border-white/[0.06] shrink-0">
           <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center text-sm font-bold border border-indigo-500/30 text-indigo-300">
                  {user?.firstName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                 <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-indigo-400 transition-colors">{user?.firstName || 'User'}</p>
                 <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{user?.role || 'Guest'}</p>
              </div>
              <button 
                onClick={handleLogout} 
                className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-lg" 
                title="Logout"
                aria-label="Logout"
              >
                 <LogOut size={18} />
              </button>
           </div>
           
           <div className="flex items-center justify-between text-[10px] text-slate-600 py-1 px-1">
              <button 
                onClick={() => performSync(true)}
                disabled={isSyncing || !dbConnected}
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  dbConnected ? 'text-emerald-500/80 hover:text-emerald-400' : 'text-slate-500'
                } ${isSyncing ? 'cursor-wait' : 'cursor-pointer'}`}
                title={lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : 'Click to sync'}
              >
                  {dbConnected ? (
                      isSyncing ? (
                          <RefreshCw size={10} className="animate-spin text-emerald-400" />
                      ) : (
                          <Database size={10} />
                      )
                  ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                  )} 
                  {dbConnected ? (isSyncing ? 'Syncing...' : 'Connected') : 'Local'}
              </button>
              <span className="font-mono opacity-50">v{APP_VERSION}</span>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative bg-[#f8fafc]">
        {/* Background pattern */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

        {/* Header */}
        <header className="sticky top-0 z-40 h-auto min-h-[4rem] sm:min-h-[4.5rem] flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 shrink-0 transition-all duration-300 border-b border-slate-200/50 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3 sm:gap-4">
             <button 
               onClick={() => setSidebarOpen(true)} 
               className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
               aria-label="Open menu"
             >
               <Menu size={24} />
             </button>
             <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight capitalize truncate max-w-[150px] sm:max-w-none">
               {currentPage.replace('-', ' ')}
             </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-600 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span>Harare, ZW</span>
             </div>
             <button 
               onClick={() => onNavigate('dashboard')} 
               className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all duration-300" 
               title={`${alertCount} System Alerts`}
               aria-label={`${alertCount} notifications`}
             >
                <Bell size={22} />
                {alertCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-600 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm animate-pulse">
                        {alertCount > 9 ? '9+' : alertCount}
                    </span>
                )}
             </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 relative z-10 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
           <div className="max-w-7xl mx-auto pb-20">
             {children}
           </div>
        </div>
      </main>
    </div>
  );
};
