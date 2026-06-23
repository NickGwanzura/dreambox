
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard, Map, Users, FileText, CreditCard, Receipt, Settings as SettingsIcon,
  Menu, X, Bell, LogOut, Printer, PieChart, Wallet, ChevronRight, CheckSquare, Wrench,
  Database, RefreshCw, Target, FileSignature, BarChart2, Plus, Zap
} from 'lucide-react';
import { getCurrentUser, signOut } from '../services/authService';
import { isConfigured as isNeonConfigured, checkConnection as checkNeonConnection } from '../services/apiClient';
import { useToast } from './ToastProvider';
import {
  getSystemAlertCount,
  getExpiringContracts,
  getOverdueInvoices,
  markOverdueInvoices,
  triggerAutoBackup,
  runAutoBilling,
  runMaintenanceCheck,
  subscribe
} from '../services/mockData';
import { logger } from '../utils/logger';
import { canAccessSettings } from '../utils/settingsAccess';
import { startAutoSync, useSync, forceSyncNow } from '../services/neonSyncManager';
import {
  ALERT_CHECK_INTERVAL_MS,
  BACKUP_INTERVAL_MS,
  BILLING_INTERVAL_MS,
  MAINTENANCE_INTERVAL_MS,
  APP_VERSION
} from '../services/constants';
import { QuickCreate } from './QuickCreate';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

type DocType = 'Quotation' | 'Invoice' | 'Receipt';

interface SectionItem {
  id: string;
  label: string;
  icon: any;
  roles: string[] | null;
}

interface Section {
  label: string | null;
  items: SectionItem[];
}

const ALL_SECTIONS: Section[] = [
  {
    label: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: null },
    ],
  },
  {
    label: 'Sales',
    items: [
      { id: 'crm',        label: 'CRM & Outreach', icon: Target,       roles: null },
      { id: 'quotations', label: 'Quotations',      icon: FileText,     roles: null },
      { id: 'clients',    label: 'Clients',         icon: Users,        roles: ['Admin', 'Manager', 'Staff'] },
      { id: 'contracts',  label: 'Contracts',       icon: FileSignature, roles: null },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'financials', label: 'Invoices',  icon: CreditCard, roles: null },
      { id: 'payments',   label: 'Payments',  icon: Wallet,     roles: ['Admin', 'Manager', 'Staff'] },
      { id: 'receipts',   label: 'Receipts',  icon: Receipt,    roles: ['Admin', 'Manager', 'Staff'] },
      { id: 'expenses',   label: 'Expenses',  icon: Printer,    roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'billboards',  label: 'Billboards',  icon: Map,         roles: null },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench,      roles: ['Admin', 'Manager', 'Staff'] },
      { id: 'tasks',       label: 'Tasks',        icon: CheckSquare, roles: ['Admin', 'Manager', 'Staff'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics',    label: 'Profit & Analytics',    icon: PieChart,  roles: ['Admin', 'Manager'] },
      { id: 'intelligence', label: 'Business Intelligence', icon: BarChart2, roles: ['Admin', 'Manager'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'contract-template', label: 'Contract Template', icon: FileSignature, roles: ['Admin'] },
      { id: 'settings',          label: 'Settings',          icon: SettingsIcon,  roles: ['Admin'] },
    ],
  },
];

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alertOpen, setAlertOpen] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<DocType>('Quotation');
  const alertPanelRef = useRef<HTMLDivElement>(null);
  const syncStatus = useSync();

  const [user, setUser] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(
    () => {
      try { const cached = localStorage.getItem('billboard_user'); return cached ? JSON.parse(cached) : null; } catch { return null; }
    }
  );

  const { showToast } = useToast();
  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  useEffect(() => {
    getCurrentUser().then(u => { if (u) setUser(u); });
  }, []);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const updated = (e as CustomEvent).detail;
      if (updated) setUser(prev => prev ? { ...prev, ...updated } : updated);
    };
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
  }, []);

  // Listen for quick-create events dispatched from Dashboard or anywhere
  useEffect(() => {
    const handler = (e: Event) => {
      const { type } = (e as CustomEvent).detail as { type: DocType };
      setQuickCreateType(type || 'Quotation');
      setQuickCreateOpen(true);
    };
    window.addEventListener('quick-create', handler);
    return () => window.removeEventListener('quick-create', handler);
  }, []);

  // Body scroll lock when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [sidebarOpen]);

  // Focus trap when sidebar is open
  useEffect(() => {
    if (!sidebarOpen || !sidebarRef.current) return;
    const sidebar = sidebarRef.current;
    const focusableEls = sidebar.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];
    firstEl?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSidebarOpen(false); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) { e.preventDefault(); lastEl?.focus(); }
      } else {
        if (document.activeElement === lastEl) { e.preventDefault(); firstEl?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!alertOpen) return;
    const handler = (e: MouseEvent) => {
      if (alertPanelRef.current && !alertPanelRef.current.contains(e.target as Node)) {
        setAlertOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [alertOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const diff = touchStartX.current - touchCurrentX.current;
      if (diff > 80) setSidebarOpen(false);
    }
    touchStartX.current = null;
    touchCurrentX.current = null;
  }, []);

  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    let isMounted = true;
    setAlertCount(getSystemAlertCount());
    triggerAutoBackup();
    runAutoBilling();
    runMaintenanceCheck();

    const initializeDatabaseState = async () => {
      if (!isNeonConfigured()) {
        if (isMounted) setDbConnected(false);
        return;
      }
      const connected = await checkNeonConnection();
      if (!isMounted) return;
      setDbConnected(connected);
      if (!connected) logger.warn('Neon is configured but not reachable; running in offline mode');
    };

    initializeDatabaseState();

    const alertInterval     = setInterval(() => setAlertCount(getSystemAlertCount()), ALERT_CHECK_INTERVAL_MS);
    const backupInterval    = setInterval(() => triggerAutoBackup(), BACKUP_INTERVAL_MS);
    const billingInterval   = setInterval(() => { runAutoBilling(); markOverdueInvoices(); }, BILLING_INTERVAL_MS);
    const maintenanceInterval = setInterval(() => runMaintenanceCheck(), MAINTENANCE_INTERVAL_MS);
    intervalsRef.current = [alertInterval, backupInterval, billingInterval, maintenanceInterval];

    const handleFocus = () => { logger.debug('Window focused - triggering sync'); forceSyncNow(); };
    window.addEventListener('focus', handleFocus);
    const unsubscribe = subscribe(() => setAlertCount(getSystemAlertCount()));

    return () => {
      isMounted = false;
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      window.removeEventListener('focus', handleFocus);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (dbConnected) startAutoSync();
  }, [dbConnected]);

  const userRole = user?.role || 'Staff';
  const settingsVisible = canAccessSettings(user);

  const visibleSections = ALL_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.id === 'settings' || item.id === 'contract-template') return settingsVisible;
      return !item.roles || item.roles.includes(userRole);
    }),
  })).filter(s => s.items.length > 0);

  const handleLogout = async () => { await signOut(); onLogout(); };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f172a] text-slate-200 supports-[height:100dvh]:h-[100dvh]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`fixed inset-y-0 left-0 z-[100] w-[85vw] max-w-72 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] lg:translate-x-0 lg:w-64 lg:max-w-none lg:relative flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-[#0f1219] shadow-2xl border-r border-slate-800/60 overflow-hidden`}
        aria-label="Main navigation"
        role="dialog"
        aria-modal={sidebarOpen ? 'true' : undefined}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-5 py-5 shrink-0 border-b border-slate-800/60">
          <button
            className="flex items-center gap-3 group"
            onClick={() => { onNavigate('dashboard'); setSidebarOpen(false); }}
          >
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
              D
            </div>
            <div className="text-left">
              <span className="font-bold text-base tracking-tight text-white block leading-none">Dreambox</span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-bold">Advertising</span>
            </div>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-500 hover:text-white transition-colors p-2 -mr-1 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-white/5"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Create Button */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <button
            onClick={() => { setQuickCreateType('Quotation'); setQuickCreateOpen(true); setSidebarOpen(false); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-bold transition-all duration-200 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/20 hover:-translate-y-0.5 active:scale-95"
          >
            <Plus size={15} />
            Quick Create
            <Zap size={12} className="opacity-70 ml-auto" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {visibleSections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.label && (
                <p className="px-3 mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
                  {section.label}
                </p>
              )}
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                    className={`group flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 relative overflow-hidden ${
                      isActive
                        ? 'text-white bg-gradient-to-r from-indigo-600/90 to-violet-600/90 shadow-md shadow-indigo-900/20'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon
                      size={16}
                      className={`mr-3 shrink-0 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-600 group-hover:text-indigo-400'}`}
                    />
                    <span className="flex-1 text-left leading-none">{item.label}</span>
                    {isActive && <ChevronRight size={13} className="text-white/60 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="shrink-0 px-4 py-4 border-t border-slate-800/60 bg-[#0a0e16]/60 backdrop-blur-md">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/10 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center text-sm font-bold border border-indigo-500/30 text-indigo-300 shrink-0">
              {user?.firstName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.firstName || 'User'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider truncate">{user?.role || 'Guest'}</p>
                <span className="text-slate-700">·</span>
                <button
                  onClick={async () => {
                    const ok = await forceSyncNow();
                    showToast(ok ? 'Cloud sync complete' : 'Cloud sync failed', ok ? 'success' : 'error');
                  }}
                  disabled={syncStatus.isSyncing || !dbConnected}
                  className={`flex items-center gap-1 text-[9px] font-medium transition-colors ${
                    dbConnected ? 'text-emerald-500/80 hover:text-emerald-400' : 'text-slate-600'
                  } ${syncStatus.isSyncing ? 'cursor-wait' : 'cursor-pointer'}`}
                  title={syncStatus.lastSyncTime ? `Last sync: ${new Date(syncStatus.lastSyncTime).toLocaleTimeString()}` : 'Click to sync'}
                >
                  {dbConnected
                    ? syncStatus.isSyncing
                      ? <RefreshCw size={9} className="animate-spin text-emerald-400" />
                      : <Database size={9} />
                    : <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  }
                  {dbConnected ? (syncStatus.isSyncing ? 'Syncing…' : 'Synced') : 'Local'}
                </button>
                <span className="text-[9px] font-mono text-slate-700 ml-auto">v{APP_VERSION}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-600 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative bg-[#f8fafc]">
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        {/* Header */}
        <header className="sticky top-0 z-40 h-auto min-h-[4rem] flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 shrink-0 border-b border-slate-200/50 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight capitalize truncate">
              {currentPage.replace(/-/g, ' ')}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sync indicator */}
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-medium transition-all shadow-sm"
              title={`Last sync: ${syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleTimeString() : 'Never'}`}
            >
              {syncStatus.isSyncing
                ? <RefreshCw size={10} className="animate-spin text-indigo-500" />
                : syncStatus.isAutoSyncRunning
                  ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              }
              <span className="text-slate-600">
                {syncStatus.lastSyncTime
                  ? (s => s < 5 ? 'now' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`)(
                      Math.floor((Date.now() - syncStatus.lastSyncTime) / 1000)
                    )
                  : '--'}
              </span>
              {syncStatus.pendingCount > 0 && (
                <span className="flex items-center justify-center min-w-[16px] h-4 px-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">
                  {syncStatus.pendingCount > 9 ? '9+' : syncStatus.pendingCount}
                </span>
              )}
            </div>

            {/* Quick Create shortcut (header) */}
            <button
              onClick={() => { setQuickCreateType('Quotation'); setQuickCreateOpen(true); }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold transition-colors shadow-sm"
              title="Quick Create Quote/Invoice"
            >
              <Plus size={13} />
              New
            </button>

            {/* Alerts Bell */}
            <div className="relative" ref={alertPanelRef}>
              <button
                onClick={() => setAlertOpen(o => !o)}
                className={`relative p-2 rounded-full transition-all ${alertOpen ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50'}`}
                title={`${alertCount} System Alerts`}
                aria-label={`${alertCount} notifications`}
                aria-expanded={alertOpen}
              >
                <Bell size={20} />
                {alertCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white animate-pulse">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>

              {alertOpen && (() => {
                const expiring = getExpiringContracts();
                const overdue  = getOverdueInvoices();
                const empty    = expiring.length === 0 && overdue.length === 0;
                return (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-900">Notifications</p>
                      {!empty && <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded-full">{expiring.length + overdue.length} alerts</span>}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                      {empty && (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                          <Bell size={24} className="mx-auto mb-2 opacity-30" />
                          All clear — no alerts right now
                        </div>
                      )}

                      {overdue.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-red-500">Overdue Invoices</p>
                          {overdue.slice(0, 5).map(inv => (
                            <button
                              key={inv.id}
                              onClick={() => { onNavigate('invoices'); setAlertOpen(false); }}
                              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                            >
                              <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{inv.id}</p>
                                <p className="text-[11px] text-slate-400">${(inv.total || 0).toLocaleString()} · overdue</p>
                              </div>
                            </button>
                          ))}
                          {overdue.length > 5 && <p className="px-4 pb-2 text-[11px] text-slate-400">+{overdue.length - 5} more</p>}
                        </div>
                      )}

                      {expiring.length > 0 && (
                        <div>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-amber-500">Expiring Soon</p>
                          {expiring.slice(0, 5).map(c => {
                            const daysLeft = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000);
                            return (
                              <button
                                key={c.id}
                                onClick={() => { onNavigate('rentals'); setAlertOpen(false); }}
                                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{c.id}</p>
                                  <p className="text-[11px] text-slate-400">{daysLeft}d left · expires {c.endDate}</p>
                                </div>
                              </button>
                            );
                          })}
                          {expiring.length > 5 && <p className="px-4 pb-2 text-[11px] text-slate-400">+{expiring.length - 5} more</p>}
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100">
                      <button
                        onClick={() => { onNavigate('dashboard'); setAlertOpen(false); }}
                        className="w-full text-center text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        View all on Dashboard →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 relative z-10 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <div className="max-w-7xl mx-auto pb-20">
            {children}
          </div>
        </div>
      </main>

      {/* Quick Create Panel */}
      <QuickCreate
        open={quickCreateOpen}
        initialType={quickCreateType}
        onClose={() => setQuickCreateOpen(false)}
      />
    </div>
  );
};
