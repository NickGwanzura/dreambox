
// ─── Maintenance / Migration Mode ────────────────────────────────────────────
// Set to true to show the maintenance screen to all visitors.
const MAINTENANCE_MODE = true;

// Back online: 2026-06-19 12:00:00 CAT (UTC+2)
const MAINTENANCE_END = new Date('2026-06-19T10:00:00Z');

function MaintenanceScreen() {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSecs = Math.max(0, Math.floor((MAINTENANCE_END.getTime() - now.getTime()) / 1000));
  const hrs  = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad  = (n: number) => String(n).padStart(2, '0');

  const liveLogo = 'https://static.wixstatic.com/media/33e2c5_fa30ae7289ea444186df47e4189fca0d~mv2.png/v1/crop/x_0,y_194,w_526,h_100/fill/w_678,h_136,fp_0.50_0.50,lg_1,q_85,enc_avif,quality_auto/IMG_9520__1_-removebg-preview.png';

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" }}
         className="relative min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col items-center justify-center px-4">

      {/* Animated moving grid */}
      <style>{`
        @keyframes gridScroll {
          from { background-position: 0 0; }
          to   { background-position: 48px 48px; }
        }
        .maint-grid {
          animation: gridScroll 6s linear infinite;
          background-image:
            linear-gradient(rgba(99,102,241,0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.18) 1px, transparent 1px);
          background-size: 48px 48px;
        }
      `}</style>

      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0">
        {/* Live scrolling grid */}
        <div className="maint-grid absolute inset-0 opacity-[0.22]" />
        {/* Glow orbs */}
        <div className="absolute -top-32 right-[15%] h-[560px] w-[560px] rounded-full bg-indigo-500/[0.18] blur-[140px]" />
        <div className="absolute bottom-[-60px] left-[8%] h-[400px] w-[400px] rounded-full bg-violet-600/[0.14] blur-[110px]" />
        {/* Radial vignette to push grid to background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_44%,transparent_20%,rgba(2,6,23,0.65)_100%)]" />
        {/* Top haze */}
        <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-slate-950/70 to-transparent" />
        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      {/* Indigo accent line top */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-2xl text-center">

        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <img src={liveLogo} alt="Dreambox Advertising" className="h-10 w-auto object-contain" />
        </div>

        {/* Status pill */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-5 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-amber-300 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Scheduled Maintenance
        </div>

        {/* Heading */}
        <h1 className="text-4xl font-black leading-[1.06] tracking-tight text-white sm:text-5xl">
          Back online at{' '}
          <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
            12:00 midday
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-white/60">
          The Dreambox platform is briefly offline for a scheduled upgrade. We&apos;ll be back today at noon — all campaign data, contracts, and records are safe and will be ready when we return.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/40">
          Looking to book a site or request a quote? Reach us directly below and we&apos;ll respond straight away.
        </p>

        {/* Countdown */}
        <div className="mx-auto mt-10 flex items-center justify-center gap-3">
          {[
            { value: pad(hrs),  label: 'Hours' },
            { value: pad(mins), label: 'Minutes' },
            { value: pad(secs), label: 'Seconds' },
          ].map((unit, i) => (
            <React.Fragment key={unit.label}>
              {i > 0 && <span className="mb-5 text-3xl font-black text-white/25">:</span>}
              <div className="flex flex-col items-center gap-2">
                <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.06] backdrop-blur-sm shadow-xl shadow-slate-950/40">
                  {/* Shimmer top line */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
                  <span className="text-3xl font-black tabular-nums text-white">{unit.value}</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{unit.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-auto mt-12 h-px max-w-sm bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Contact buttons */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://wa.me/263778018909?text=Hi%20Dreambox%2C%20I%27d%20like%20to%20enquire%20about%20a%20campaign."
            className="inline-flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-6 py-3 text-sm font-bold text-emerald-300 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 0C5.373 0 0 5.373 0 12c0 2.115.554 4.1 1.523 5.823L.057 23.986l6.324-1.438A11.945 11.945 0 0011.998 24C18.625 24 24 18.627 24 12S18.625 0 11.998 0zm0 21.818a9.814 9.814 0 01-5.007-1.375l-.36-.214-3.732.849.866-3.638-.235-.373A9.787 9.787 0 012.18 12c0-5.414 4.406-9.818 9.818-9.818 5.414 0 9.82 4.404 9.82 9.818 0 5.412-4.406 9.818-9.82 9.818z"/></svg>
            WhatsApp Us
          </a>
          <a
            href="mailto:info@dreamboxadvertising.com"
            className="inline-flex items-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.05] px-6 py-3 text-sm font-bold text-white/60 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            info@dreamboxadvertising.com
          </a>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-5 text-[11px] font-semibold text-white/20">
        © 2026 Dreambox Advertising (Pvt) Ltd · Harare, Zimbabwe
      </p>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, ReactNode, useCallback, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Auth } from './components/Auth';
import { AuthCallback } from './components/AuthCallback';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Dashboard = lazyWithRetry(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const BillboardList = lazyWithRetry(() => import('./components/BillboardList').then(m => ({ default: m.BillboardList })));
const ClientList = lazyWithRetry(() => import('./components/ClientList').then(m => ({ default: m.ClientList })));
const Rentals = lazyWithRetry(() => import('./components/Rentals').then(m => ({ default: m.Rentals })));
const Financials = lazyWithRetry(() => import('./components/Financials').then(m => ({ default: m.Financials })));
const Quotations = lazyWithRetry(() => import('./components/Quotations').then(m => ({ default: m.Quotations })));
const Expenses = lazyWithRetry(() => import('./components/Expenses').then(m => ({ default: m.Expenses })));
const Settings = lazyWithRetry(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const ContractTemplatePage = lazyWithRetry(() => import('./components/ContractTemplatePage').then(m => ({ default: m.ContractTemplatePage })));
const Analytics = lazyWithRetry(() => import('./components/Analytics').then(m => ({ default: m.Analytics })));
const BusinessIntelligence = lazyWithRetry(() => import('./components/BusinessIntelligence').then(m => ({ default: m.BusinessIntelligence })));
const Payments = lazyWithRetry(() => import('./components/Payments').then(m => ({ default: m.Payments })));
const Tasks = lazyWithRetry(() => import('./components/Tasks').then(m => ({ default: m.Tasks })));
const Maintenance = lazyWithRetry(() => import('./components/Maintenance').then(m => ({ default: m.Maintenance })));
const ClientPortal = lazyWithRetry(() => import('./components/ClientPortal').then(m => ({ default: m.ClientPortal })));
const PublicView = lazyWithRetry(() => import('./components/PublicView').then(m => ({ default: m.PublicView })));
const PublicWebsite = lazyWithRetry(() => import('./components/PublicWebsite').then(m => ({ default: m.PublicWebsite })));
const CRM = lazyWithRetry(() => import('./components/crm/CRM').then(m => ({ default: m.CRM })));
import { getCurrentUser, updatePassword } from './services/authService';
import { getCurrentUser as getCachedUser } from './services/authServiceSecure';
import { canAccessSettings } from './utils/settingsAccess';
import { ToastProvider } from './components/ToastProvider';
import { FeatureErrorBoundary } from './components/error-boundaries/FeatureErrorBoundary';
import { logger } from './utils/logger';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("Uncaught error:", error, errorInfo);
  }

  render() {
    const self = this as any;
    const { hasError, error } = self.state;
    const { children } = self.props;
    
    if (hasError) {
      const errorMessage = error?.message || "An unexpected error occurred while rendering the application.";
      
      logger.error('Application Error:', error);
      
      return (
        <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-900 p-6">
           <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-md w-full border border-slate-100">
             <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4" role="img" aria-label="Error">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
             </div>
             <h1 className="text-xl font-bold mb-2 text-slate-900">Application Error</h1>
             <p className="text-slate-900 mb-6 text-sm leading-relaxed">
               {errorMessage}
             </p>
             <div className="space-y-3">
               <button 
                 onClick={() => window.location.reload()} 
                 className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs hover:bg-slate-800 transition-all w-full shadow-lg shadow-slate-900/20"
               >
                 Reload Application
               </button>
               <button 
                 onClick={() => self.setState({ hasError: false, error: undefined })}
                 className="bg-white text-slate-700 border border-slate-200 px-6 py-3 rounded-xl font-bold uppercase text-xs hover:bg-slate-50 transition-all w-full"
               >
                 Try to Recover
               </button>
             </div>
           </div>
        </div>
      );
    }

    return children || null;
  }
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try { return !!localStorage.getItem('db_auth_token'); } catch { return false; }
  });
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [portalMode, setPortalMode] = useState<{active: boolean, clientId: string | null}>({ active: false, clientId: null });
  const [publicMode, setPublicMode] = useState<{active: boolean, type: 'billboard' | 'map', id?: string}>({ active: false, type: 'map' });
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      getCurrentUser().then(user => {
        if (user && (user as any).mustResetPassword) {
          setMustResetPassword(true);
        }
      });
    } else {
      setMustResetPassword(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      
      // Check for Client Portal
      const isPortal = params.get('portal') === 'true';
      const clientId = params.get('clientId');
      if (isPortal && clientId) {
          setPortalMode({ active: true, clientId });
          return;
      }

      // Check for clean URL paths: /billboard/:slug or /locations
      const billboardMatch = path.match(/^\/billboard\/(.+)$/i);
      if (billboardMatch) {
          setPublicMode({ active: true, type: 'billboard', id: billboardMatch[1] });
          return;
      }
      if (path === '/locations') {
          setPublicMode({ active: true, type: 'map' });
          return;
      }

      // Check for legacy query-param public share
      const isPublic = params.get('public') === 'true';
      const type = params.get('type');
      const id = params.get('id');

      if (isPublic) {
          setPublicMode({
              active: true,
              type: (type === 'billboard' || type === 'map') ? type : 'map',
              id: id || undefined
          });
      }
  }, []);

  const handlePageChange = useCallback((page: string) => {
    setPageError(null);
    setCurrentPage(page);
  }, []);

  const renderPage = () => {
    if (pageError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error Loading Page</h2>
          <p className="text-slate-900 mb-4">{pageError}</p>
          <button 
            onClick={() => setPageError(null)}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg"
          >
            Try Again
          </button>
        </div>
      );
    }

    try {
      switch (currentPage) {
        case 'dashboard': 
          return (
            <FeatureErrorBoundary featureName="Dashboard" onReset={() => setPageError(null)}>
              <Dashboard />
            </FeatureErrorBoundary>
          );
        case 'analytics':
          return (
            <FeatureErrorBoundary featureName="Analytics" onReset={() => setPageError(null)}>
              <Analytics />
            </FeatureErrorBoundary>
          );
        case 'intelligence':
          return (
            <FeatureErrorBoundary featureName="Business Intelligence" onReset={() => setPageError(null)}>
              <BusinessIntelligence />
            </FeatureErrorBoundary>
          );
        case 'crm': 
          return (
            <FeatureErrorBoundary featureName="CRM" onReset={() => setPageError(null)}>
              <CRM />
            </FeatureErrorBoundary>
          );
        case 'billboards': 
          return (
            <FeatureErrorBoundary featureName="Billboards" onReset={() => setPageError(null)}>
              <BillboardList />
            </FeatureErrorBoundary>
          );
        case 'payments': 
          return (
            <FeatureErrorBoundary featureName="Payments" onReset={() => setPageError(null)}>
              <Payments />
            </FeatureErrorBoundary>
          );
        case 'clients': 
          return (
            <FeatureErrorBoundary featureName="Clients" onReset={() => setPageError(null)}>
              <ClientList />
            </FeatureErrorBoundary>
          );
        case 'rentals':
        case 'contracts':
          return (
            <FeatureErrorBoundary featureName="Contracts" onReset={() => setPageError(null)}>
              <Rentals />
            </FeatureErrorBoundary>
          );
        case 'tasks': 
          return (
            <FeatureErrorBoundary featureName="Tasks" onReset={() => setPageError(null)}>
              <Tasks />
            </FeatureErrorBoundary>
          );
        case 'maintenance': 
          return (
            <FeatureErrorBoundary featureName="Maintenance" onReset={() => setPageError(null)}>
              <Maintenance />
            </FeatureErrorBoundary>
          );
        case 'financials': 
          return (
            <FeatureErrorBoundary featureName="Financials" onReset={() => setPageError(null)}>
              <Financials initialTab="Invoices" />
            </FeatureErrorBoundary>
          );
        case 'quotations': 
          return (
            <FeatureErrorBoundary featureName="Quotations" onReset={() => setPageError(null)}>
              <Quotations />
            </FeatureErrorBoundary>
          );
        case 'receipts': 
          return (
            <FeatureErrorBoundary featureName="Receipts" onReset={() => setPageError(null)}>
              <Financials initialTab="Receipts" />
            </FeatureErrorBoundary>
          );
        case 'expenses': 
          return (
            <FeatureErrorBoundary featureName="Expenses" onReset={() => setPageError(null)}>
              <Expenses />
            </FeatureErrorBoundary>
          );
        case 'settings': {
          if (!canAccessSettings(getCachedUser())) {
            return (
              <div className="p-8 bg-white rounded-3xl shadow-lg border border-slate-100 text-center max-w-lg mx-auto mt-8">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Restricted</h2>
                <p className="text-slate-900 text-sm">Settings access is limited to the finance/admin team. Contact Rufaro, Brian, or Nick if you need a change made.</p>
              </div>
            );
          }
          return (
            <FeatureErrorBoundary featureName="Settings" onReset={() => setPageError(null)}>
              <Settings />
            </FeatureErrorBoundary>
          );
        }
        case 'contract-template': {
          if (!canAccessSettings(getCachedUser())) {
            return (
              <div className="p-8 bg-white rounded-3xl shadow-lg border border-slate-100 text-center max-w-lg mx-auto mt-8">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Restricted</h2>
                <p className="text-slate-900 text-sm">Contract template editing is limited to the finance/admin team. Contact Rufaro, Brian, or Nick if you need a change made.</p>
              </div>
            );
          }
          return (
            <FeatureErrorBoundary featureName="Contract Template" onReset={() => setPageError(null)}>
              <ContractTemplatePage />
            </FeatureErrorBoundary>
          );
        }
        default: 
          return (
            <FeatureErrorBoundary featureName="Dashboard" onReset={() => setPageError(null)}>
              <Dashboard />
            </FeatureErrorBoundary>
          );
      }
    } catch (error) {
      logger.error('Page render error:', error);
      setPageError('Failed to load page component');
      return null;
    }
  };

  // ─── Maintenance gate ────────────────────────────────────────────────────────
  if (MAINTENANCE_MODE) {
    return (
      <ErrorBoundary>
        <MaintenanceScreen />
      </ErrorBoundary>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Public View Routing (No Auth Required)
  if (publicMode.active) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-900 text-sm">Loading...</div></div>}>
                  <PublicView type={publicMode.type} billboardId={publicMode.id} />
                </Suspense>
              </ToastProvider>
          </ErrorBoundary>
      )
  }

  // Client Portal Routing (No Auth Required)
  if (portalMode.active && portalMode.clientId) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-900 text-sm">Loading...</div></div>}>
                  <ClientPortal clientId={portalMode.clientId} />
                </Suspense>
              </ToastProvider>
          </ErrorBoundary>
      );
  }

  // Auth Callback Routing (Email verification, password reset)
  const path = window.location.pathname;
  const normalizedPath = path.replace(/\/+$/, '') || '/';
  if (normalizedPath.startsWith('/auth/')) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <AuthCallback />
              </ToastProvider>
          </ErrorBoundary>
      );
  }

  // Public Website Routing (No Auth Required)
  const publicWebsitePaths = new Set(['/', '/services', '/pricing', '/contact', '/site-availability', '/available-sites', '/faq', '/privacy', '/privacy-policy', '/terms', '/terms-of-use']);
  if (publicWebsitePaths.has(normalizedPath)) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-900 text-sm">Loading...</div></div>}>
                  <PublicWebsite />
                </Suspense>
              </ToastProvider>
          </ErrorBoundary>
      );
  }

  // Forced Password Reset
  if (isAuthenticated && mustResetPassword) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-slate-100">
              <h1 className="text-xl font-bold text-slate-900 mb-2">Password Reset Required</h1>
              <p className="text-slate-900 text-sm mb-6">Your administrator requires you to set a new password before continuing.</p>
              {resetPasswordError && <p className="text-red-600 text-sm mb-4">{resetPasswordError}</p>}
              <form onSubmit={async (e) => {
                e.preventDefault();
                setResetPasswordError(null);
                const form = e.target as HTMLFormElement;
                const newPw = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
                const confirmPw = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
                if (newPw.length < 8) { setResetPasswordError('Password must be at least 8 characters'); return; }
                if (!/[A-Z]/.test(newPw)) { setResetPasswordError('Password must contain an uppercase letter'); return; }
                if (!/[a-z]/.test(newPw)) { setResetPasswordError('Password must contain a lowercase letter'); return; }
                if (!/[0-9]/.test(newPw)) { setResetPasswordError('Password must contain a number'); return; }
                if (!/[^A-Za-z0-9]/.test(newPw)) { setResetPasswordError('Password must contain a special character'); return; }
                if (newPw !== confirmPw) { setResetPasswordError('Passwords do not match'); return; }
                const { error } = await updatePassword(newPw);
                if (error) { setResetPasswordError(error.message); return; }
                setMustResetPassword(false);
              }}>
                <input name="newPassword" type="password" placeholder="New password" required minLength={8} className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-3 text-sm" />
                <input name="confirmPassword" type="password" placeholder="Confirm new password" required minLength={8} className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-3 text-sm" />
                <ul className="text-xs text-slate-900 mb-4 space-y-0.5 pl-1">
                  <li>At least 8 characters, with uppercase, lowercase, number, and special character</li>
                </ul>
                <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase hover:bg-slate-800 transition-all">Update Password</button>
              </form>
            </div>
          </div>
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  // Main App Routing (Auth Required)
  if (!isAuthenticated) {
      return (
        <ErrorBoundary>
            <ToastProvider>
              <Auth onLogin={() => setIsAuthenticated(true)} />
            </ToastProvider>
        </ErrorBoundary>
      );
  }

  return (
    <ErrorBoundary>
        <ToastProvider>
          <Layout
              currentPage={currentPage}
              onNavigate={handlePageChange}
              onLogout={() => setIsAuthenticated(false)}
          >
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-slate-900 text-sm">Loading...</div></div>}>
              {renderPage()}
            </Suspense>
          </Layout>
        </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
