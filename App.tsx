
import React, { useState, useEffect, ReactNode, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { BillboardList } from './components/BillboardList';
import { ClientList } from './components/ClientList';
import { Rentals } from './components/Rentals';
import { Financials } from './components/Financials';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { OutsourcedList } from './components/OutsourcedList';
import { Analytics } from './components/Analytics';
import { Payments } from './components/Payments';
import { Tasks } from './components/Tasks';
import { Maintenance } from './components/Maintenance';
import { Auth } from './components/Auth';
import { ClientPortal } from './components/ClientPortal';
import { PublicView } from './components/PublicView';
import { CRM } from './components/crm/CRM';
import { getCurrentUser } from './services/authServiceSecure';
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getCurrentUser());
  const [portalMode, setPortalMode] = useState<{active: boolean, clientId: string | null}>({ active: false, clientId: null });
  const [publicMode, setPublicMode] = useState<{active: boolean, type: 'billboard' | 'map', id?: string}>({ active: false, type: 'map' });
  const [pageError, setPageError] = useState<string | null>(null);

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
          return (
            <FeatureErrorBoundary featureName="Rentals" onReset={() => setPageError(null)}>
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
                <PublicView type={publicMode.type} billboardId={publicMode.id} />
              </ToastProvider>
          </ErrorBoundary>
      )
  }

  // Client Portal Routing (No Auth Required)
  if (portalMode.active && portalMode.clientId) {
      return (
          <ErrorBoundary>
              <ToastProvider>
                <ClientPortal clientId={portalMode.clientId} />
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
            {renderPage()}
          </Layout>
        </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
