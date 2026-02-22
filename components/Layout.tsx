
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Map, Users, FileText, CreditCard, Receipt, Settings as SettingsIcon,
  Menu, X, Bell, LogOut, Printer, Globe, PieChart, Wallet, ChevronRight, CheckSquare, Wrench, Database, RefreshCw
} from 'lucide-react';
import { getCurrentUser, logout } from '../services/authService';
import { getSystemAlertCount, triggerAutoBackup, runAutoBilling, runMaintenanceCheck, triggerFullSync } from '../services/mockData';

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
  const user = getCurrentUser();

  useEffect(() => {
    setAlertCount(getSystemAlertCount());
    triggerAutoBackup();
    runAutoBilling();
    runMaintenanceCheck(); // Check maintenance on load
    
    // Check DB status
    setDbConnected(!!localStorage.getItem('sb_url'));

    const interval = setInterval(() => setAlertCount(getSystemAlertCount()), 10000);
    const backupInterval = setInterval(() => triggerAutoBackup(), 5 * 60 * 1000);
    const billingInterval = setInterval(() => runAutoBilling(), 60 * 60 * 1000);
    const maintenanceInterval = setInterval(() => runMaintenanceCheck(), 60 * 60 * 1000); // Check every hour
    
    // Aggressive Sync Interval (every 5 seconds) to pull remote changes rapidly
    // This creates the "real-time" feel for cross-user interaction
    const performSync = async () => {
        if(dbConnected) {
            setIsSyncing(true);
            await triggerFullSync();
            // Use a timeout to keep the "Syncing..." text visible for at least a moment to reassure user
            setTimeout(() => setIsSyncing(false), 800);
        }
    };

    const syncInterval = setInterval(performSync, 5000); // 5 Seconds Heartbeat

    // Also trigger sync on window focus (when user switches tabs back to this app)
    const handleFocus = () => {
        console.log("Window focused - triggering immediate sync");
        performSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => { 
        clearInterval(interval); 
        clearInterval(backupInterval);
        clearInterval(billingInterval);
        clearInterval(maintenanceInterval);
        clearInterval(syncInterval);
        window.removeEventListener('focus', handleFocus);
    };
  }, [currentPage, dbConnected]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Profit & Analytics', icon: PieChart },
    { id: 'billboards', label: 'Billboards', icon: Map },
    { id: 'rentals', label: 'Rentals', icon: FileText },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'outsourced', label: 'Outsourced', icon: Globe },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'financials', label: 'Invoices & Quotes', icon: CreditCard },
    { id: 'receipts', label: 'Receipts', icon: Receipt },
    { id: 'expenses', label: 'Expenses', icon: Printer },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const handleLogout = () => { logout(); onLogout(); };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f172a] text-slate-200 supports-[height:100dvh]:h-[100dvh]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Dreambox Theme (Deep Slate/Indigo) */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[100] w-72 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] lg:translate-x-0 lg:relative flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-[#1e293b] shadow-2xl border-r border-slate-700/50 overflow-hidden`}
      >
        {/* Background Gradients for Sidebar */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-[#1e293b] to-slate-950 z-0"></div>
        {/* Subtle indigo accent glow at top */}
        <div className="absolute top-0 left-0 w-full h-96 bg-indigo-600/5 blur-[120px] rounded-full z-0 pointer-events-none"></div>

        {/* Sidebar Header */}
        <div className="relative z-10 flex items-center justify-between p-6 shrink-0 border-b border-slate-700/50">
          <div className="flex items-center gap-3 group cursor-pointer">
             <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300 border border-white/10">D</div>
             <div>
                <span className="font-bold text-xl tracking-tight text-white block leading-none">Dreambox</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Advertising</span>
             </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white transition-colors p-1">
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
        <div className="relative z-10 p-6 bg-slate-900/40 backdrop-blur-md border-t border-slate-700/50 shrink-0">
           <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold border border-slate-600 text-white shadow-inner">
                  {user?.firstName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                 <p className="text-sm font-bold text-slate-200 truncate group-hover:text-indigo-400 transition-colors">{user?.firstName || 'User'}</p>
                 <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{user?.role || 'Guest'}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-2" title="Logout">
                 <LogOut size={18} />
              </button>
           </div>
           
           <div className="flex items-center justify-between text-[10px] text-slate-500 py-1 px-1">
              <span className={`flex items-center gap-1.5 font-bold ${dbConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {dbConnected ? (
                      isSyncing ? (
                          <RefreshCw size={10} className="animate-spin text-emerald-400" />
                      ) : (
                          <Database size={10} />
                      )
                  ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                  )} 
                  {dbConnected ? (isSyncing ? 'Syncing...' : 'Connected') : 'Local Storage'}
              </span>
              <span className="font-mono opacity-50">v1.9.18</span>
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
             <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
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
             <button onClick={() => onNavigate('dashboard')} className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all duration-300" title={`${alertCount} System Alerts`}>
                <Bell size={22} />
                {alertCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-600 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm">
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
