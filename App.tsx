
import React, { useState, useEffect, ReactNode, useCallback, Suspense } from 'react';
import { Layout } from './components/Layout';
import { Auth } from './components/Auth';
import { AuthCallback } from './components/AuthCallback';

const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const BillboardList = React.lazy(() => import('./components/BillboardList').then(m => ({ default: m.BillboardList })));
const ClientList = React.lazy(() => import('./components/ClientList').then(m => ({ default: m.ClientList })));
const Rentals = React.lazy(() => import('./components/Rentals').then(m => ({ default: m.Rentals })));
const Financials = React.lazy(() => import('./components/Financials').then(m => ({ default: m.Financials })));
const Expenses = React.lazy(() => import('./components/Expenses').then(m => ({ default: m.Expenses })));
const Settings = React.lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const OutsourcedList = React.lazy(() => import('./components/OutsourcedList').then(m => ({ default: m.OutsourcedList })));
const Analytics = React.lazy(() => import('./components/Analytics').then(m => ({ default: m.Analytics })));
const Payments = React.lazy(() => import('./components/Payments').then(m => ({ default: m.Payments })));
const Tasks = React.lazy(() => import('./components/Tasks').then(m => ({ default: m.Tasks })));
const Maintenance = React.lazy(() => import('./components/Maintenance').then(m => ({ default: m.Maintenance })));
const ClientPortal = React.lazy(() => import('./components/ClientPortal').then(m => ({ default: m.ClientPortal })));
const PublicView = React.lazy(() => import('./components/PublicView').then(m => ({ default: m.PublicView })));
const CRM = React.lazy(() => import('./components/crm/CRM').then(m => ({ default: m.CRM })));
import { getCurrentUser, updatePassword } from './services/authService';
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
             <p className="text-slate-500 mb-6 text-sm leading-relaxed">
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
      
      // Check for Client Portal
      const isPortal = params.get('portal') === 'true';
      const clientId = params.get('clientId');
      if (isPortal && clientId) {
          setPortalMode({ active: true, clientId });
          return;
      }

      // Check for Public Share
      const isPublic = params.get('public') === 'true';
      const type = params.get('type'); // 'billboard' or 'map'
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
          <p className="text-slate-600 mb-4">{pageError}</p>
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
        case 'outsourced': 
          return (
            <FeatureErrorBoundary featureName="Outsourced" onReset={() => setPageError(null)}>
              <OutsourcedList />
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
        case 'settings': 
          return (
            <FeatureErrorBoundary featureName="Settings" onReset={() => setPageError(null)}>
              <Settings />
            </FeatureErrorBoundary>
          );
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

  // Public View Routing (No Auth Required)
  if (publicMode.active) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-400 text-sm">Loading...</div></div>}>
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
                <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-400 text-sm">Loading...</div></div>}>
                  <ClientPortal clientId={portalMode.clientId} />
                </Suspense>
              </ToastProvider>
          </ErrorBoundary>
      );
  }

  // Auth Callback Routing (Email verification, password reset)
  const path = window.location.pathname;
  if (path.startsWith('/auth/')) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <AuthCallback />
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
              <p className="text-slate-500 text-sm mb-6">Your administrator requires you to set a new password before continuing.</p>
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
                <ul className="text-xs text-slate-400 mb-4 space-y-0.5 pl-1">
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
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-slate-400 text-sm">Loading...</div></div>}>
              {renderPage()}
            </Suspense>
          </Layout>
        </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
