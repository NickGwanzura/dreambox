import React, { useState, useMemo, useEffect } from 'react';
import { 
  scoreAllLeads, 
  getHotLeads, 
  getLeadsNeedingAttention, 
  getScoringSummary,
  calculateLeadScore,
  LeadScore,
  LeadQuality,
} from '../../services/leadScoring';
import { getCRMOpportunities, getCRMCompanyById, getTouchpointsByOpportunity } from '../../services/crmService';
import { LeadScoreBadge, LeadScorePill, QualityDistribution, ScoreTrend } from './LeadScoreBadge';
import { LeadScoreBreakdown } from './LeadScoreBreakdown';
import { generateLeadScoringReport } from '../../services/crmPdfService';
import { useToast } from '../ToastProvider';
import { AccessibleModal } from '../ui/AccessibleModal';
import { 
  Flame, AlertCircle, TrendingUp, Users, Target, 
  Filter, RefreshCw, Download, ChevronRight, Zap,
  BarChart3, PieChart, Activity, ArrowUpRight, Building2,
  FileDown
} from 'lucide-react';

interface LeadScoringDashboardProps {
  className?: string;
}

export const LeadScoringDashboard: React.FC<LeadScoringDashboardProps> = ({ className = '' }) => {
  const [scores, setScores] = useState<LeadScore[]>([]);
  const [summary, setSummary] = useState<ReturnType<typeof getScoringSummary> | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadScore | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [filterQuality, setFilterQuality] = useState<LeadQuality | 'all'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'company' | 'recent'>('score');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { showToast } = useToast();

  // Load data
  const loadData = () => {
    const allScores = scoreAllLeads();
    setScores(allScores);
    setSummary(getScoringSummary());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      loadData();
      setIsRefreshing(false);
    }, 500);
  };

  const handleExportPDF = async () => {
    try {
      await generateLeadScoringReport();
      showToast('Lead scoring report downloaded', 'success');
    } catch (error) {
      showToast('Failed to generate report', 'error');
    }
  };

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    let filtered = [...scores];
    
    if (filterQuality !== 'all') {
      filtered = filtered.filter(s => s.quality === filterQuality);
    }
    
    switch (sortBy) {
      case 'score':
        filtered.sort((a, b) => b.totalScore - a.totalScore);
        break;
      case 'company':
        filtered.sort((a, b) => {
          const companyA = getCRMCompanyById(getCRMOpportunities().find(o => o.id === a.opportunityId)?.companyId || '')?.name || '';
          const companyB = getCRMCompanyById(getCRMOpportunities().find(o => o.id === b.opportunityId)?.companyId || '')?.name || '';
          return companyA.localeCompare(companyB);
        });
        break;
      case 'recent':
        filtered.sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime());
        break;
    }
    
    return filtered;
  }, [scores, filterQuality, sortBy]);

  // Get hot leads for priority section
  const hotLeads = useMemo(() => getHotLeads(75), [scores]);
  const attentionLeads = useMemo(() => getLeadsNeedingAttention(), [scores]);

  const handleLeadClick = (score: LeadScore) => {
    setSelectedLead(score);
    setIsDetailModalOpen(true);
  };

  const getCompanyName = (opportunityId: string) => {
    const opp = getCRMOpportunities().find(o => o.id === opportunityId);
    const company = opp ? getCRMCompanyById(opp.companyId) : undefined;
    return company?.name || 'Unknown Company';
  };

  const getOpportunityStage = (opportunityId: string) => {
    const opp = getCRMOpportunities().find(o => o.id === opportunityId);
    return opp?.stage || 'new_lead';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-slate-900">AI Lead Scoring</h2>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full border border-indigo-200">
              AI Powered
            </span>
          </div>
          <p className="text-slate-500">Intelligent lead qualification powered by engagement analysis</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition-all border border-slate-200 shadow-sm"
          >
            <FileDown size={18} className="text-emerald-500" />
            Export PDF
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition-all border border-slate-200 shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Recalculate All
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <SummaryCard
            label="Average Score"
            value={summary.averageScore}
            icon={BarChart3}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            borderColor="border-indigo-100"
          />
          <SummaryCard
            label="Hot Leads"
            value={summary.hotCount}
            icon={Flame}
            color="text-orange-600"
            bgColor="bg-orange-50"
            borderColor="border-orange-100"
            subtext="Score 80+"
          />
          <SummaryCard
            label="Warm Leads"
            value={summary.warmCount}
            icon={Target}
            color="text-yellow-600"
            bgColor="bg-yellow-50"
            borderColor="border-yellow-100"
            subtext="Score 50-79"
          />
          <SummaryCard
            label="Cold Leads"
            value={summary.coldCount}
            icon={Users}
            color="text-blue-600"
            bgColor="bg-blue-50"
            borderColor="border-blue-100"
            subtext="Score 25-49"
          />
          <SummaryCard
            label="Need Attention"
            value={summary.leadsNeedingAttention}
            icon={AlertCircle}
            color="text-red-600"
            bgColor="bg-red-50"
            borderColor="border-red-100"
            subtext="Action required"
          />
          <SummaryCard
            label="Total Scored"
            value={summary.totalScored}
            icon={PieChart}
            color="text-slate-600"
            bgColor="bg-slate-50"
            borderColor="border-slate-200"
          />
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Distribution & Hot Leads */}
        <div className="space-y-6">
          {/* Quality Distribution */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Quality Distribution</h3>
            <QualityDistribution scores={scores} />
          </div>

          {/* Hot Leads Priority List */}
          {hotLeads.length > 0 && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200">
              <div className="flex items-center gap-2 mb-4">
                <Flame className="text-orange-600" size={20} />
                <h3 className="text-lg font-bold text-slate-900">Hot Leads ({hotLeads.length})</h3>
              </div>
              <div className="space-y-2">
                {hotLeads.slice(0, 5).map((lead) => (
                  <button
                    key={lead.opportunityId}
                    onClick={() => handleLeadClick(lead)}
                    className="w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-orange-300 transition-colors text-left shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate">
                        {getCompanyName(lead.opportunityId)}
                      </span>
                      <LeadScorePill score={lead} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span className="capitalize">{getOpportunityStage(lead.opportunityId).replace(/_/g, ' ')}</span>
                      {lead.insights.slice(0, 1).map((insight, i) => (
                        <span key={i} className="text-slate-400 truncate">• {insight.message.slice(0, 40)}...</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attention Required */}
          {attentionLeads.length > 0 && (
            <div className="p-6 rounded-3xl bg-red-50 border border-red-200">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="text-red-600" size={20} />
                <h3 className="text-lg font-bold text-slate-900">Needs Attention ({attentionLeads.length})</h3>
              </div>
              <div className="space-y-2">
                {attentionLeads.slice(0, 3).map((lead) => (
                  <button
                    key={lead.opportunityId}
                    onClick={() => handleLeadClick(lead)}
                    className="w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-red-300 transition-colors text-left shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {getCompanyName(lead.opportunityId)}
                      </span>
                      <LeadScorePill score={lead} />
                    </div>
                    {lead.recommendations.slice(0, 1).map((rec, i) => (
                      <div key={i} className="mt-1 text-xs text-red-600 font-medium">
                        {rec.action}
                      </div>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - All Leads List */}
        <div className="lg:col-span-2">
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-bold text-slate-900">All Leads</h3>
              
              <div className="flex items-center gap-2">
                <select
                  value={filterQuality}
                  onChange={(e) => setFilterQuality(e.target.value as LeadQuality | 'all')}
                  className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer"
                >
                  <option value="all">All Qualities</option>
                  <option value="hot">Hot Only</option>
                  <option value="warm">Warm Only</option>
                  <option value="cold">Cold Only</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'score' | 'company' | 'recent')}
                  className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer"
                >
                  <option value="score">Sort by Score</option>
                  <option value="company">Sort by Company</option>
                  <option value="recent">Sort by Recent</option>
                </select>
              </div>
            </div>

            {/* Leads Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="pb-3">Company</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Stage</th>
                    <th className="pb-3">Key Insight</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr 
                      key={lead.opportunityId}
                      className="group hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4">
                        <span className="font-bold text-slate-900">
                          {getCompanyName(lead.opportunityId)}
                        </span>
                      </td>
                      <td className="py-4">
                        <LeadScorePill 
                          score={lead} 
                          onClick={() => handleLeadClick(lead)}
                        />
                      </td>
                      <td className="py-4">
                        <span className="text-sm text-slate-600 capitalize">
                          {getOpportunityStage(lead.opportunityId).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-4">
                        {lead.insights[0] ? (
                          <span className="text-sm text-slate-500 truncate max-w-[200px] block">
                            {lead.insights[0].message}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">No insights yet</span>
                        )}
                      </td>
                      <td className="py-4">
                        <button
                          onClick={() => handleLeadClick(lead)}
                          className="p-2 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-50 rounded-xl"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLeads.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Target size={32} className="text-slate-300" />
                </div>
                <p className="text-lg font-bold text-slate-700">No leads match the selected filter</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lead Detail Modal */}
      <AccessibleModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Lead Score Details</h3>
            </div>
          </div>
        }
        size="xl"
      >
        {selectedLead && (
          <LeadScoreBreakdown score={selectedLead} />
        )}
      </AccessibleModal>
    </div>
  );
};

// Summary Card Component
const SummaryCard: React.FC<{
  label: string;
  value: number;
  icon: typeof Flame;
  color: string;
  bgColor: string;
  borderColor: string;
  subtext?: string;
}> = ({ label, value, icon: Icon, color, bgColor, borderColor, subtext }) => (
  <div className={`p-5 rounded-3xl ${bgColor} border ${borderColor} shadow-sm`}>
    <div className="flex items-start justify-between">
      <div className={`p-2 rounded-xl bg-white shadow-sm`}>
        <Icon size={20} className={color} />
      </div>
    </div>
    <div className="mt-3">
      <div className={`text-2xl font-black text-slate-900`}>{value}</div>
      <div className="text-sm text-slate-600 font-medium">{label}</div>
      {subtext && <div className="text-xs text-slate-500 mt-0.5">{subtext}</div>}
    </div>
  </div>
);
