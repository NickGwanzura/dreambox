
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, Upload, Download, Filter, Search, Plus, 
  BarChart3, Target, TrendingUp, Clock, Sparkles,
  LayoutGrid, List, Zap, ChevronDown, Building2,
  FileText, FileDown, MoreHorizontal, Printer
} from 'lucide-react';
import { 
  getCRMOpportunities, 
  getCRMPipelineMetrics,
  subscribe,
  initializeSampleCRMData,
  exportToCSV,
  importCSV,
  CSVImportResult
} from '../../services/crmService';
import { getCurrentUser } from '../../services/authServiceSecure';
import { CRMOpportunity, OpportunityStatus } from '../../types';
import { useToast } from '../ToastProvider';
import { logger } from '../../utils/logger';
import { CRMContactList } from './CRMContactList';
import { CRMPipeline } from './CRMPipeline';
import { CRMAnalytics } from './CRMAnalytics';
import { CSVImportModal } from './CSVImportModal';
import { OpportunityModal } from './OpportunityModal';
import { LoadingButton } from '../ui/LoadingButton';
import { LeadScoringDashboard } from './LeadScoringDashboard';
import { 
  generatePipelineReport, 
  generateLeadScoringReport, 
  generateOutreachReport,
  generateFullCRMReport 
} from '../../services/crmPdfService';

type CRMView = 'list' | 'pipeline' | 'analytics' | 'scoring';

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export const CRM: React.FC = () => {
  const [view, setView] = useState<CRMView>('pipeline');
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | 'all'>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<CRMOpportunity | undefined>();
  const [isExporting, setIsExporting] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  
  const { showToast } = useToast();
  const currentUser = getCurrentUser();

  // Initialize sample data if empty (dev only)
  useEffect(() => {
    if (currentUser) {
      initializeSampleCRMData(currentUser.id);
    }
  }, [currentUser]);

  // Subscribe to data changes
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setRefreshKey(k => k + 1);
    });
    return () => unsubscribe();
  }, []);

  // Get data
  const opportunities = useMemo(() => getCRMOpportunities(), [refreshKey]);
  const metrics = useMemo(() => getCRMPipelineMetrics(), [refreshKey]);

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(opp => {
      const matchesSearch = !searchQuery || 
        opp.companyId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || opp.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [opportunities, searchQuery, statusFilter]);

  // Export CSV
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const csv = exportToCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('CSV exported successfully', 'success');
    } catch (error) {
      logger.error('Export failed:', error);
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [showToast]);

  // Import CSV
  const handleImport = useCallback((result: CSVImportResult) => {
    if (result.success) {
      showToast(`Imported ${result.imported} records. Skipped ${result.skipped} duplicates.`, 'success');
      setShowImportModal(false);
    } else {
      showToast(`Import completed with ${result.errors.length} errors`, 'error');
    }
  }, [showToast]);

  // PDF Reports
  const handleGeneratePDF = useCallback(async (type: 'pipeline' | 'scoring' | 'outreach' | 'full') => {
    setShowPdfMenu(false);
    try {
      switch (type) {
        case 'pipeline':
          await generatePipelineReport();
          showToast('Pipeline report generated', 'success');
          break;
        case 'scoring':
          await generateLeadScoringReport();
          showToast('Lead scoring report generated', 'success');
          break;
        case 'outreach':
          await generateOutreachReport();
          showToast('Outreach report generated', 'success');
          break;
        case 'full':
          await generateFullCRMReport();
          showToast('Complete CRM report package generated', 'success');
          break;
      }
    } catch (error) {
      logger.error('PDF generation failed:', error);
      showToast('Failed to generate PDF report', 'error');
    }
  }, [showToast]);

  // Quick stats matching Dashboard style
  const quickStats = [
    { 
      label: 'Pipeline Value', 
      value: `$${(metrics.totalValue / 1000).toFixed(1)}k`, 
      subtext: `${metrics.totalOpportunities} deals`,
      icon: Target,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-100',
      trend: '+8%'
    },
    { 
      label: 'Follow-ups', 
      value: metrics.followUpsRequired.toString(), 
      subtext: metrics.followUpsRequired > 0 ? 'Need attention' : 'All caught up',
      icon: Clock,
      color: metrics.followUpsRequired > 0 ? 'text-amber-600' : 'text-emerald-600',
      bgColor: metrics.followUpsRequired > 0 ? 'bg-amber-50' : 'bg-emerald-50',
      borderColor: metrics.followUpsRequired > 0 ? 'border-amber-100' : 'border-emerald-100',
    },
    { 
      label: 'Conversion', 
      value: `${metrics.conversionRates.overall}%`, 
      subtext: 'Win rate',
      icon: TrendingUp,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
      borderColor: 'border-violet-100',
      trend: '+2%'
    },
    { 
      label: 'Activity', 
      value: `${metrics.activityMetrics.callsMade + metrics.activityMetrics.emailsSent}`, 
      subtext: 'Interactions',
      icon: Zap,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
    },
  ];

  const tabs = [
    { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
    { id: 'list', label: 'List', icon: List },
    { id: 'scoring', label: 'AI Scoring', icon: Sparkles, badge: 'New' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl font-bold text-slate-900">CRM Pipeline</h2>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
              {opportunities.length} leads
            </span>
          </div>
          <p className="text-slate-500">Track leads, manage outreach, and close billboard advertising deals</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-medium transition-all border border-slate-200 shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-medium transition-all border border-slate-200 shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          
          {/* PDF Reports Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPdfMenu(!showPdfMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-medium transition-all border border-slate-200 shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Reports
              <ChevronDown className={`w-4 h-4 transition-transform ${showPdfMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showPdfMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-lg py-2 z-50">
                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Generate PDF Reports
                </div>
                <button
                  onClick={() => handleGeneratePDF('pipeline')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  Pipeline Report
                </button>
                <button
                  onClick={() => handleGeneratePDF('scoring')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Lead Scoring Report
                </button>
                <button
                  onClick={() => handleGeneratePDF('outreach')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <Users className="w-4 h-4 text-violet-500" />
                  Outreach Activity
                </button>
                <div className="my-1 mx-3 h-px bg-slate-100" />
                <button
                  onClick={() => handleGeneratePDF('full')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <FileDown className="w-4 h-4 text-emerald-500" />
                  Full CRM Package
                </button>
              </div>
            )}
            
            {/* Click outside to close */}
            {showPdfMenu && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowPdfMenu(false)}
              />
            )}
          </div>
          
          <button
            onClick={() => {
              setSelectedOpportunity(undefined);
              setShowOpportunityModal(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-medium transition-all shadow-lg shadow-slate-900/20"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Quick Stats - Matching Dashboard Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStats.map((stat, i) => (
          <div 
            key={i}
            className={`${stat.bgColor} p-6 rounded-3xl shadow-sm border ${stat.borderColor} hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 bg-white rounded-2xl shadow-sm group-hover:shadow-md transition-all ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              {stat.trend && (
                <span className="text-xs font-bold px-2.5 py-1 bg-white text-slate-700 rounded-full border border-slate-200">
                  {stat.trend}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{stat.label}</p>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stat.value}</h3>
              <p className="text-xs text-slate-500 mt-1">{stat.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View Tabs & Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* View Tabs - Light Style */}
        <div className="flex p-1 bg-white rounded-2xl border border-slate-200 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as CRMView)}
              className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                view === tab.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all shadow-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OpportunityStatus | 'all')}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-11 pr-10 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer shadow-sm hover:border-slate-300"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[500px]">
        {view === 'pipeline' && (
          <CRMPipeline 
            opportunities={filteredOpportunities}
            onSelectOpportunity={(opp) => {
              setSelectedOpportunity(opp);
              setShowOpportunityModal(true);
            }}
            onOpportunityUpdated={() => setRefreshKey(k => k + 1)}
          />
        )}
        
        {view === 'list' && (
          <CRMContactList 
            opportunities={filteredOpportunities}
            onSelectOpportunity={(opp) => {
              setSelectedOpportunity(opp);
              setShowOpportunityModal(true);
            }}
          />
        )}
        
        {view === 'analytics' && (
          <CRMAnalytics metrics={metrics} />
        )}
        
        {view === 'scoring' && (
          <LeadScoringDashboard />
        )}
      </div>

      {/* Modals */}
      {showImportModal && (
        <CSVImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      {showOpportunityModal && (
        <OpportunityModal
          isOpen={showOpportunityModal}
          onClose={() => setShowOpportunityModal(false)}
          opportunity={selectedOpportunity}
        />
      )}
    </div>
  );
};
