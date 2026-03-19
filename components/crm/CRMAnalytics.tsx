
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Users, Phone, Mail, Calendar, Target,
  CheckCircle2, Clock, FileDown, FileText
} from 'lucide-react';
import { CRMPipelineMetrics } from '../../types';
import { 
  generatePipelineReport, 
  generateOutreachReport 
} from '../../services/crmPdfService';
import { useToast } from '../ToastProvider';

interface CRMAnalyticsProps {
  metrics: CRMPipelineMetrics;
}

const COLORS = ['#6366f1', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

export const CRMAnalytics: React.FC<CRMAnalyticsProps> = ({ metrics }) => {
  const { showToast } = useToast();

  const handleExportPipelinePDF = async () => {
    try {
      await generatePipelineReport();
      showToast('Pipeline report downloaded', 'success');
    } catch (error) {
      showToast('Failed to generate report', 'error');
    }
  };

  const handleExportActivityPDF = async () => {
    try {
      await generateOutreachReport();
      showToast('Activity report downloaded', 'success');
    } catch (error) {
      showToast('Failed to generate report', 'error');
    }
  };
  // Pipeline data for bar chart
  const pipelineData = [
    { name: 'New', value: metrics.byStatus.new.count, amount: metrics.byStatus.new.value },
    { name: 'Contacted', value: metrics.byStatus.contacted.count, amount: metrics.byStatus.contacted.value },
    { name: 'Qualified', value: metrics.byStatus.qualified.count, amount: metrics.byStatus.qualified.value },
    { name: 'Proposal', value: metrics.byStatus.proposal.count, amount: metrics.byStatus.proposal.value },
    { name: 'Negotiation', value: metrics.byStatus.negotiation.count, amount: metrics.byStatus.negotiation.value },
    { name: 'Won', value: metrics.byStatus.closed_won.count, amount: metrics.byStatus.closed_won.value },
    { name: 'Lost', value: metrics.byStatus.closed_lost.count, amount: metrics.byStatus.closed_lost.value },
  ];

  // Conversion funnel data
  const funnelData = [
    { name: 'Leads', value: metrics.totalOpportunities },
    { name: 'Contacted', value: metrics.byStatus.contacted.count + metrics.byStatus.qualified.count + metrics.byStatus.proposal.count + metrics.byStatus.negotiation.count + metrics.byStatus.closed_won.count },
    { name: 'Qualified', value: metrics.byStatus.qualified.count + metrics.byStatus.proposal.count + metrics.byStatus.negotiation.count + metrics.byStatus.closed_won.count },
    { name: 'Proposals', value: metrics.byStatus.proposal.count + metrics.byStatus.negotiation.count + metrics.byStatus.closed_won.count },
    { name: 'Won', value: metrics.byStatus.closed_won.count },
  ];

  // Activity data
  const activityData = [
    { name: 'Calls Made', value: metrics.activityMetrics.callsMade, icon: Phone },
    { name: 'Connected', value: metrics.activityMetrics.callsConnected, icon: Phone },
    { name: 'Emails Sent', value: metrics.activityMetrics.emailsSent, icon: Mail },
    { name: 'Emails Opened', value: metrics.activityMetrics.emailsOpened, icon: Mail },
    { name: 'Meetings', value: metrics.activityMetrics.meetingsCompleted, icon: Calendar },
  ];

  // Win/loss data
  const winLossData = [
    { name: 'Won', value: metrics.byStatus.closed_won.count, color: '#10b981' },
    { name: 'Lost', value: metrics.byStatus.closed_lost.count, color: '#ef4444' },
    { name: 'Open', value: metrics.totalOpportunities - metrics.byStatus.closed_won.count - metrics.byStatus.closed_lost.count, color: '#6366f1' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with PDF Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Analytics Overview</h3>
          <p className="text-sm text-slate-500">Performance metrics and pipeline insights</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportPipelinePDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-medium transition-all border border-slate-200 shadow-sm"
          >
            <FileText className="w-4 h-4 text-indigo-500" />
            Pipeline PDF
          </button>
          <button
            onClick={handleExportActivityPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-medium transition-all border border-slate-200 shadow-sm"
          >
            <FileDown className="w-4 h-4 text-emerald-500" />
            Activity PDF
          </button>
        </div>
      </div>
      
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Pipeline"
          value={`$${(metrics.totalValue / 1000).toFixed(1)}k`}
          subtitle={`${metrics.totalOpportunities} opportunities`}
          icon={Target}
          color="indigo"
        />
        <StatCard
          title="Weighted Pipeline"
          value={`$${(metrics.weightedValue / 1000).toFixed(1)}k`}
          subtitle={`${Math.round((metrics.weightedValue / metrics.totalValue) * 100)}% probability`}
          icon={TrendingUp}
          color="violet"
        />
        <StatCard
          title="Win Rate"
          value={`${metrics.conversionRates.overall}%`}
          subtitle={`${metrics.byStatus.closed_won.count} won · ${metrics.byStatus.closed_lost.count} lost`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Tasks Due"
          value={`${metrics.tasksDueToday}`}
          subtitle={`${metrics.overdueTasks} overdue`}
          icon={Clock}
          color={metrics.overdueTasks > 0 ? 'red' : 'amber'}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Pipeline by Stage</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Conversion Funnel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#64748b" 
                  fontSize={12}
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Win/Loss Distribution */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Deal Outcomes</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height={192}>
              <PieChart>
                <Pie
                  data={winLossData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {winLossData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            {winLossData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-slate-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Metrics */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Activity Overview</h3>
          <div className="grid grid-cols-5 gap-4">
            {activityData.map((item) => (
              <div 
                key={item.name}
                className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors"
              >
                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                  <item.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-2xl font-black text-slate-900">{item.value}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">{item.name}</p>
              </div>
            ))}
          </div>

          {/* Conversion Rates */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Conversion Rates</h4>
            <div className="grid grid-cols-4 gap-4">
              <ConversionRate 
                label="Lead → Contacted" 
                rate={metrics.conversionRates.leadToContacted} 
              />
              <ConversionRate 
                label="Contacted → Qualified" 
                rate={metrics.conversionRates.contactedToQualified} 
              />
              <ConversionRate 
                label="Qualified → Proposal" 
                rate={metrics.conversionRates.qualifiedToProposal} 
              />
              <ConversionRate 
                label="Proposal → Closed" 
                rate={metrics.conversionRates.proposalToClosed} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: 'indigo' | 'violet' | 'emerald' | 'amber' | 'red' | 'blue';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon, color }) => {
  const colors = {
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600', iconBg: 'bg-indigo-100' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-600', iconBg: 'bg-violet-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', iconBg: 'bg-amber-100' },
    red: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', iconBg: 'bg-red-100' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600', iconBg: 'bg-blue-100' },
  };

  const c = colors[color];

  return (
    <div className={`${c.bg} rounded-3xl p-5 border ${c.border} shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">{title}</span>
        <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>
    </div>
  );
};

const ConversionRate: React.FC<{ label: string; rate: number }> = ({ label, rate }) => (
  <div className="text-center">
    <div className="relative w-16 h-16 mx-auto mb-2">
      <svg className="w-16 h-16 transform -rotate-90">
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="currentColor"
          strokeWidth="4"
          fill="transparent"
          className="text-slate-200"
        />
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="currentColor"
          strokeWidth="4"
          fill="transparent"
          strokeDasharray={`${rate * 1.76} 176`}
          className={rate >= 50 ? 'text-emerald-500' : rate >= 30 ? 'text-amber-500' : 'text-indigo-500'}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
        {rate}%
      </span>
    </div>
    <p className="text-xs text-slate-500 font-medium">{label}</p>
  </div>
);
