import React, { useState } from 'react';
import { LeadScore, LeadInsight, LeadRecommendation } from '../../services/leadScoring';
import { 
  Building2, DollarSign, MessageSquare, Target, Clock, 
  ChevronDown, ChevronUp, Lightbulb, AlertTriangle, CheckCircle2,
  XCircle, Info, Zap, TrendingUp
} from 'lucide-react';

interface LeadScoreBreakdownProps {
  score: LeadScore | null;
  className?: string;
}

const factorConfig = {
  companyFit: {
    label: 'Company Fit',
    icon: Building2,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-100',
    barColor: 'bg-indigo-400',
    description: 'Industry match, company size, and contact quality',
    maxScore: 25,
  },
  dealPotential: {
    label: 'Deal Potential',
    icon: DollarSign,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    barColor: 'bg-emerald-400',
    description: 'Deal size, campaign duration, and product interest',
    maxScore: 25,
  },
  engagement: {
    label: 'Engagement',
    icon: MessageSquare,
    color: 'text-violet-700',
    bgColor: 'bg-violet-100',
    barColor: 'bg-violet-400',
    description: 'Response rate, interaction quality, and sentiment',
    maxScore: 25,
  },
  intentSignals: {
    label: 'Intent Signals',
    icon: Target,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    barColor: 'bg-amber-400',
    description: 'Buying signals, urgency, and proposal requests',
    maxScore: 15,
  },
  recency: {
    label: 'Recency',
    icon: Clock,
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-100',
    barColor: 'bg-cyan-400',
    description: 'Last activity and response velocity',
    maxScore: 10,
  },
};

const insightTypeConfig = {
  positive: { icon: CheckCircle2, color: 'text-emerald-700', bgColor: 'bg-emerald-100', borderColor: 'border-emerald-200' },
  negative: { icon: XCircle, color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  neutral: { icon: Info, color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  warning: { icon: AlertTriangle, color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' },
  opportunity: { icon: Zap, color: 'text-violet-700', bgColor: 'bg-violet-100', borderColor: 'border-violet-200' },
};

const priorityConfig = {
  critical: { color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-200', label: 'Critical' },
  high: { color: 'text-orange-700', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', label: 'High' },
  medium: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-200', label: 'Medium' },
  low: { color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', label: 'Low' },
};

export const LeadScoreBreakdown: React.FC<LeadScoreBreakdownProps> = ({ score, className = '' }) => {
  const [expandedFactor, setExpandedFactor] = useState<string | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  if (!score) {
    return (
      <div className={`p-6 rounded-3xl bg-white border border-slate-200 shadow-sm ${className}`}>
        <div className="text-center text-slate-500">
          <Info size={48} className="mx-auto mb-3 text-slate-300" />
          <p className="font-bold text-slate-700">No score data available</p>
          <p className="text-sm mt-1">Add activity to generate lead score</p>
        </div>
      </div>
    );
  }

  const factors = Object.entries(score.factors) as [keyof typeof factorConfig, number][];
  const visibleInsights = showAllInsights ? score.insights : score.insights.slice(0, 3);
  const visibleRecommendations = showAllRecommendations ? score.recommendations : score.recommendations.slice(0, 3);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Score Overview */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Lead Score Breakdown</h3>
            <p className="text-sm text-slate-500">
              Confidence: {Math.round(score.confidence * 100)}% • Calculated {new Date(score.calculatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-black ${getScoreColor(score.totalScore)}`}>
              {score.totalScore}
            </div>
            <div className="text-sm text-slate-500">out of 100</div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="h-3 bg-white rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full rounded-full ${getScoreBarColor(score.totalScore)} transition-all duration-700`}
            style={{ width: `${score.totalScore}%` }}
          />
        </div>
      </div>

      {/* Factor Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Scoring Factors</h4>
        
        {factors.map(([key, value]) => {
          const config = factorConfig[key];
          const Icon = config.icon;
          const percentage = (value / config.maxScore) * 100;
          const isExpanded = expandedFactor === key;

          return (
            <div
              key={key}
              className={`
                rounded-2xl border transition-all duration-200 bg-white border-slate-200 shadow-sm
                ${isExpanded ? 'border-indigo-200' : 'hover:border-slate-300'}
              `}
            >
              <button
                onClick={() => setExpandedFactor(isExpanded ? null : key)}
                className="w-full p-4 flex items-center gap-4"
              >
                <div className={`p-2 rounded-xl ${config.bgColor}`}>
                  <Icon size={20} className={config.color} />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900">{config.label}</span>
                    <span className={`font-bold ${config.color}`}>
                      {value}/{config.maxScore}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full ${config.barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {isExpanded ? (
                  <ChevronUp size={18} className="text-slate-400" />
                ) : (
                  <ChevronDown size={18} className="text-slate-400" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  <p className="text-sm text-slate-500 pl-14">{config.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Insights */}
      {score.insights.length > 0 && (
        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={18} className="text-amber-600" />
            <h4 className="text-sm font-bold text-slate-900">AI Insights</h4>
          </div>
          
          <div className="space-y-3">
            {visibleInsights.map((insight, index) => {
              const config = insightTypeConfig[insight.type];
              const Icon = config.icon;

              return (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-xl ${config.bgColor} border ${config.borderColor}`}
                >
                  <Icon size={16} className={`mt-0.5 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase">{insight.category}</span>
                      {insight.impact !== 0 && (
                        <span className={`text-xs font-bold ${insight.impact > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {insight.impact > 0 ? '+' : ''}{insight.impact} pts
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mt-0.5">{insight.message}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {score.insights.length > 3 && (
            <button
              onClick={() => setShowAllInsights(!showAllInsights)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              {showAllInsights ? 'Show less' : `Show ${score.insights.length - 3} more insights`}
            </button>
          )}
        </div>
      )}

      {/* AI Recommendations */}
      {score.recommendations.length > 0 && (
        <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">AI Recommendations</h4>
          </div>
          
          <div className="space-y-3">
            {visibleRecommendations.map((rec, index) => {
              const config = priorityConfig[rec.priority];

              return (
                <div
                  key={index}
                  className={`p-4 rounded-2xl ${config.bgColor} border ${config.borderColor}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                      {config.label}
                    </div>
                    {rec.autoTrigger && (
                      <div className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-200 text-slate-600 border border-slate-300">
                        Auto
                      </div>
                    )}
                  </div>
                  <h5 className="font-bold text-slate-900 mt-2">{rec.action}</h5>
                  <p className="text-sm text-slate-600 mt-1">{rec.description}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-emerald-700 font-medium">
                    <TrendingUp size={12} />
                    <span>Expected: {rec.expectedImpact}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {score.recommendations.length > 3 && (
            <button
              onClick={() => setShowAllRecommendations(!showAllRecommendations)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              {showAllRecommendations ? 'Show less' : `Show ${score.recommendations.length - 3} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Compact version for side panels
export const LeadScoreMini: React.FC<{
  score: LeadScore | null;
}> = ({ score }) => {
  if (!score) return null;

  const factors = Object.entries(score.factors) as [keyof typeof factorConfig, number][];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-black ${getScoreColor(score.totalScore)}`}>
          {score.totalScore}
        </span>
        <span className="text-xs text-slate-500">/100</span>
      </div>
      
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <div
          className={`h-full rounded-full ${getScoreBarColor(score.totalScore)}`}
          style={{ width: `${score.totalScore}%` }}
        />
      </div>

      <div className="grid grid-cols-5 gap-1">
        {factors.map(([key, value]) => {
          const config = factorConfig[key];
          return (
            <div key={key} className="text-center" title={config.label}>
              <div className={`text-[10px] font-bold ${config.color}`}>{value}</div>
              <config.icon size={12} className={`mx-auto mt-0.5 ${config.color} opacity-60`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper functions
const getScoreColor = (score: number): string => {
  if (score >= 80) return 'text-orange-600';
  if (score >= 50) return 'text-yellow-600';
  if (score >= 25) return 'text-blue-600';
  return 'text-slate-600';
};

const getScoreBarColor = (score: number): string => {
  if (score >= 80) return 'bg-orange-400';
  if (score >= 50) return 'bg-yellow-400';
  if (score >= 25) return 'bg-blue-400';
  return 'bg-slate-400';
};
