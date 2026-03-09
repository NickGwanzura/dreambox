
import React from 'react';
import { 
  Building2, Phone, Mail, MapPin, ArrowUpRight,
  Calendar, DollarSign, TrendingUp, Clock, Layers
} from 'lucide-react';
import { CRMOpportunity, OpportunityStatus } from '../../types';
import { getCRMCompanyById, getCRMContactById, getContactsByCompany } from '../../services/crmService';
import { formatCurrency } from '../../utils/sanitizers';
import { calculateLeadScore } from '../../services/leadScoring';
import { LeadScorePill } from './LeadScoreBadge';

interface CRMContactListProps {
  opportunities: CRMOpportunity[];
  onSelectOpportunity: (opportunity: CRMOpportunity) => void;
}

const STATUS_BADGES: Record<OpportunityStatus, { bg: string; text: string; border: string; label: string }> = {
  new: { 
    bg: 'bg-slate-100', 
    text: 'text-slate-700', 
    border: 'border-slate-200',
    label: 'New'
  },
  contacted: { 
    bg: 'bg-blue-100', 
    text: 'text-blue-700', 
    border: 'border-blue-200',
    label: 'Contacted'
  },
  qualified: { 
    bg: 'bg-indigo-100', 
    text: 'text-indigo-700', 
    border: 'border-indigo-200',
    label: 'Qualified'
  },
  proposal: { 
    bg: 'bg-violet-100', 
    text: 'text-violet-700', 
    border: 'border-violet-200',
    label: 'Proposal'
  },
  negotiation: { 
    bg: 'bg-amber-100', 
    text: 'text-amber-700', 
    border: 'border-amber-200',
    label: 'Negotiation'
  },
  closed_won: { 
    bg: 'bg-emerald-100', 
    text: 'text-emerald-700', 
    border: 'border-emerald-200',
    label: 'Won'
  },
  closed_lost: { 
    bg: 'bg-red-100', 
    text: 'text-red-700', 
    border: 'border-red-200',
    label: 'Lost'
  },
};

export const CRMContactList: React.FC<CRMContactListProps> = ({ 
  opportunities, 
  onSelectOpportunity 
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 p-5 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
        <div className="col-span-3">Company & Contact</div>
        <div className="col-span-1">Score</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Location & Type</div>
        <div className="col-span-2">Deal Value</div>
        <div className="col-span-1">Follow-up</div>
        <div className="col-span-1"></div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-slate-100">
        {opportunities.map((opportunity) => (
          <ContactRow
            key={opportunity.id}
            opportunity={opportunity}
            onClick={() => onSelectOpportunity(opportunity)}
          />
        ))}
      </div>

      {opportunities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-lg font-bold text-slate-700">No opportunities found</p>
          <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or add a new opportunity</p>
        </div>
      )}
    </div>
  );
};

interface ContactRowProps {
  opportunity: CRMOpportunity;
  onClick: () => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ opportunity, onClick }) => {
  const company = getCRMCompanyById(opportunity.companyId);
  const primaryContact = getCRMContactById(opportunity.primaryContactId);
  const allContacts = getContactsByCompany(opportunity.companyId);
  
  // Calculate lead score
  const leadScore = React.useMemo(() => {
    try {
      return calculateLeadScore(opportunity, company || undefined, primaryContact || undefined);
    } catch {
      return null;
    }
  }, [opportunity, company, primaryContact]);

  const statusConfig = STATUS_BADGES[opportunity.status];

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-12 gap-4 p-5 hover:bg-slate-50 cursor-pointer transition-colors group"
    >
      {/* Company & Contact */}
      <div className="col-span-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
          <Building2 className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
            {company?.name || 'Unknown Company'}
          </h4>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 truncate">
              {primaryContact?.fullName || 'No primary contact'}
            </p>
            {allContacts.length > 1 && (
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">
                +{allContacts.length - 1}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lead Score */}
      <div className="col-span-1 flex items-center">
        <LeadScorePill score={leadScore} />
      </div>

      {/* Status */}
      <div className="col-span-2 flex items-center">
        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Location & Type */}
      <div className="col-span-2 flex flex-col justify-center gap-1">
        {opportunity.locationInterest && (
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{opportunity.locationInterest}</span>
          </div>
        )}
        {opportunity.billboardType && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Layers className="w-3.5 h-3.5" />
            <span>{opportunity.billboardType}</span>
          </div>
        )}
      </div>

      {/* Deal Value */}
      <div className="col-span-2 flex items-center">
        <div>
          <p className="font-bold text-slate-900">
            {formatCurrency(opportunity.estimatedValue)}
          </p>
          {opportunity.campaignDuration && (
            <p className="text-xs text-slate-500">{opportunity.campaignDuration}</p>
          )}
        </div>
      </div>

      {/* Follow-up */}
      <div className="col-span-1 flex items-center">
        {opportunity.nextFollowUpDate ? (
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl font-bold border ${
            isOverdue(opportunity.nextFollowUpDate) 
              ? 'bg-red-100 text-red-700 border-red-200' 
              : isToday(opportunity.nextFollowUpDate)
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <Calendar className="w-3 h-3" />
            {formatDate(opportunity.nextFollowUpDate)}
          </span>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
      </div>

      {/* Actions */}
      <div className="col-span-1 flex items-center justify-end">
        <button className="p-2 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-50 rounded-xl">
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Helper functions
const isOverdue = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

const isToday = (dateStr: string): boolean => {
  return new Date(dateStr).toDateString() === new Date().toDateString();
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
