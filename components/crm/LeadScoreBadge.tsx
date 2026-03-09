import React from 'react';
import { LeadScore, LeadQuality } from '../../services/leadScoring';
import { Flame, Thermometer, Snowflake, AlertCircle, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';

interface LeadScoreBadgeProps {
  score: LeadScore | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTrend?: boolean;
  onClick?: () => void;
  className?: string;
}

const qualityConfig: Record<LeadQuality, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Flame;
  description: string;
}> = {
  hot: {
    label: 'Hot',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-200',
    icon: Flame,
    description: 'High conversion probability',
  },
  warm: {
    label: 'Warm',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-200',
    icon: Thermometer,
    description: 'Moderate interest',
  },
  cold: {
    label: 'Cold',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    icon: Snowflake,
    description: 'Low engagement',
  },
  dead: {
    label: 'Dead',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
    icon: AlertCircle,
    description: 'Not viable',
  },
};

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs gap-1',
    score: 'text-sm font-bold',
    icon: 12,
  },
  md: {
    badge: 'px-2.5 py-1 text-sm gap-1.5',
    score: 'text-lg font-black',
    icon: 14,
  },
  lg: {
    badge: 'px-3 py-1.5 text-base gap-2',
    score: 'text-2xl font-black',
    icon: 18,
  },
  xl: {
    badge: 'px-4 py-2 text-lg gap-2',
    score: 'text-3xl font-black',
    icon: 22,
  },
};

export const LeadScoreBadge: React.FC<LeadScoreBadgeProps> = ({
  score,
  size = 'md',
  showTrend = false,
  onClick,
  className = '',
}) => {
  if (!score) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-xs ${className}`}>
        <Sparkles className="w-3 h-3" />
        <span>Not scored</span>
      </div>
    );
  }

  const config = qualityConfig[score.quality];
  const Icon = config.icon;
  const sizes = sizeConfig[size];

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center rounded-full border
        ${config.bgColor} ${config.borderColor}
        ${sizes.badge} ${config.color}
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
        ${className}
      `}
      title={`${config.label}: ${config.description} (Score: ${score.totalScore}/100)`}
    >
      <Icon size={sizes.icon} className={score.quality === 'hot' ? 'animate-pulse' : ''} />
      <span className={sizes.score}>{score.totalScore}</span>
      <span className="opacity-60 text-xs">/100</span>
      {showTrend && <ScoreTrendIndicator score={score} />}
    </button>
  );
};

// Compact version for table rows
export const LeadScorePill: React.FC<{
  score: LeadScore | null;
  onClick?: () => void;
}> = ({ score, onClick }) => {
  if (!score) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-500 border border-slate-200">
        --
      </span>
    );
  }

  const config = qualityConfig[score.quality];

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border
        ${config.bgColor} ${config.color} ${config.borderColor}
        ${onClick ? 'cursor-pointer hover:opacity-80 hover:scale-105' : 'cursor-default'}
        transition-all duration-200
      `}
    >
      <config.icon size={10} />
      <span>{score.totalScore}</span>
    </button>
  );
};

// Score with progress bar
export const LeadScoreBar: React.FC<{
  score: LeadScore | null;
  showLabel?: boolean;
  className?: string;
}> = ({ score, showLabel = true, className = '' }) => {
  if (!score) return null;

  const config = qualityConfig[score.quality];
  const percentage = score.totalScore;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        {showLabel && (
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded-md ${config.bgColor}`}>
              <config.icon size={14} className={config.color} />
            </div>
            <span className={`font-bold ${config.color}`}>{config.label} Lead</span>
          </div>
        )}
        <span className="font-black text-slate-900">{percentage}/100</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <div
          className={`h-full rounded-full ${config.bgColor.replace('bg-', 'bg-').replace('100', '400')} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{config.description}</p>
    </div>
  );
};

// Score trend indicator
export const ScoreTrend: React.FC<{
  trend: 'improving' | 'declining' | 'stable' | 'unknown';
  className?: string;
}> = ({ trend, className = '' }) => {
  const config = {
    improving: { icon: TrendingUp, color: 'text-emerald-600', label: 'Rising' },
    declining: { icon: TrendingDown, color: 'text-red-600', label: 'Falling' },
    stable: { icon: Minus, color: 'text-slate-500', label: 'Stable' },
    unknown: { icon: Minus, color: 'text-slate-400', label: 'No data' },
  };

  const { icon: Icon, color, label } = config[trend];

  return (
    <div className={`flex items-center gap-1 text-xs ${color} ${className}`}>
      <Icon size={12} />
      <span>{label}</span>
    </div>
  );
};

// Internal trend indicator for badge
const ScoreTrendIndicator: React.FC<{ score: LeadScore }> = ({ score }) => {
  const trend = score.totalScore >= 70 ? 'improving' : score.totalScore >= 40 ? 'stable' : 'declining';
  const config = {
    improving: { icon: TrendingUp, color: 'text-emerald-600' },
    declining: { icon: TrendingDown, color: 'text-red-600' },
    stable: { icon: Minus, color: 'text-slate-500' },
  };
  const { icon: Icon, color } = config[trend];
  
  return <Icon size={12} className={`ml-1 ${color}`} />;
};

// Quality distribution chart (for analytics)
export const QualityDistribution: React.FC<{
  scores: LeadScore[];
  className?: string;
}> = ({ scores, className = '' }) => {
  const distribution = {
    hot: scores.filter(s => s.quality === 'hot').length,
    warm: scores.filter(s => s.quality === 'warm').length,
    cold: scores.filter(s => s.quality === 'cold').length,
    dead: scores.filter(s => s.quality === 'dead').length,
  };

  const total = scores.length || 1;

  return (
    <div className={`space-y-3 ${className}`}>
      {(Object.keys(distribution) as LeadQuality[]).map((quality) => {
        const count = distribution[quality];
        const percentage = Math.round((count / total) * 100);
        const config = qualityConfig[quality];

        return (
          <div key={quality} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <config.icon size={14} className={config.color} />
                <span className="text-sm font-medium text-slate-700">{config.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{count}</span>
                <span className="text-xs text-slate-500">({percentage}%)</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full ${config.bgColor.replace('100', '400')} rounded-full transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
