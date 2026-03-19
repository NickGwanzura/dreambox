
import React, { useState } from 'react';
import { MoreHorizontal, Calendar, DollarSign, Phone, Mail, Building2, MapPin, Layers, ArrowUpRight, GripVertical } from 'lucide-react';
import { CRMOpportunity, OpportunityStatus, OpportunityStage } from '../../types';
import { getCRMCompanyById, getCRMContactById, updateCRMOpportunity } from '../../services/crmService';
import { formatCurrency } from '../../utils/sanitizers';
import { calculateLeadScore } from '../../services/leadScoring';
import { LeadScorePill } from './LeadScoreBadge';
import { useToast } from '../ToastProvider';

interface CRMPipelineProps {
  opportunities: CRMOpportunity[];
  onSelectOpportunity: (opportunity: CRMOpportunity) => void;
  onOpportunityUpdated?: () => void;
}

interface Column {
  status: OpportunityStatus;
  title: string;
  color: string;
  bgColor: string;
}

const COLUMNS: Column[] = [
  { status: 'new', title: 'New Leads', color: 'border-slate-400', bgColor: 'bg-slate-50' },
  { status: 'contacted', title: 'Contacted', color: 'border-blue-400', bgColor: 'bg-blue-50' },
  { status: 'qualified', title: 'Qualified', color: 'border-indigo-400', bgColor: 'bg-indigo-50' },
  { status: 'proposal', title: 'Proposal', color: 'border-violet-400', bgColor: 'bg-violet-50' },
  { status: 'negotiation', title: 'Negotiation', color: 'border-amber-400', bgColor: 'bg-amber-50' },
  { status: 'closed_won', title: 'Closed Won', color: 'border-emerald-400', bgColor: 'bg-emerald-50' },
];

const STAGE_LABELS: Record<OpportunityStage, string> = {
  new_lead: 'New',
  initial_contact: 'Contact',
  discovery_call: 'Discovery',
  site_survey: 'Site Survey',
  proposal_sent: 'Proposal',
  negotiation: 'Negotiating',
  contract_pending: 'Contract',
  closed_won: 'Won',
  closed_lost: 'Lost',
  nurture: 'Nurture',
};

export const CRMPipeline: React.FC<CRMPipelineProps> = ({ 
  opportunities, 
  onSelectOpportunity,
  onOpportunityUpdated 
}) => {
  const [draggedOpportunityId, setDraggedOpportunityId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<OpportunityStatus | null>(null);
  const { showToast } = useToast();

  const getOpportunitiesByStatus = (status: OpportunityStatus) => 
    opportunities.filter(o => o.status === status);

  const getTotalValue = (status: OpportunityStatus) =>
    getOpportunitiesByStatus(status).reduce((sum, o) => sum + (o.estimatedValue || 0), 0);

  const handleDragStart = (e: React.DragEvent, opportunityId: string) => {
    setDraggedOpportunityId(opportunityId);
    e.dataTransfer.effectAllowed = 'move';
    // Set a custom drag image if needed
    e.dataTransfer.setData('text/plain', opportunityId);
  };

  const handleDragEnd = () => {
    setDraggedOpportunityId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: OpportunityStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the column (not entering a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, newStatus: OpportunityStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (!draggedOpportunityId) return;

    const opportunity = opportunities.find(o => o.id === draggedOpportunityId);
    if (!opportunity || opportunity.status === newStatus) return;

    // Update the opportunity status
    const updatedOpportunity: CRMOpportunity = {
      ...opportunity,
      status: newStatus,
      // Also update stage based on status
      stage: getStageForStatus(newStatus, opportunity.stage),
      lastModifiedDate: new Date().toISOString(),
    };

    updateCRMOpportunity(updatedOpportunity);
    onOpportunityUpdated?.();
    setDraggedOpportunityId(null);

    const company = getCRMCompanyById(opportunity.companyId);
    const columnLabel = COLUMNS.find(c => c.status === newStatus)?.title ?? newStatus;
    showToast(`${company?.name ?? 'Lead'} moved to ${columnLabel}`, 'success', 3500);
  };

  const getStageForStatus = (status: OpportunityStatus, currentStage: OpportunityStage): OpportunityStage => {
    // Map status to appropriate stage
    const statusToStage: Record<OpportunityStatus, OpportunityStage> = {
      new: 'new_lead',
      contacted: 'initial_contact',
      qualified: 'discovery_call',
      proposal: 'proposal_sent',
      negotiation: 'negotiation',
      closed_won: 'closed_won',
      closed_lost: 'closed_lost',
    };
    return statusToStage[status] || currentStage;
  };

  return (
    <div className="flex gap-6 overflow-x-auto pb-4 min-h-[500px]">
      {COLUMNS.map((column) => {
        const columnOpportunities = getOpportunitiesByStatus(column.status);
        const totalValue = getTotalValue(column.status);
        const isDragOver = dragOverColumn === column.status;

        return (
          <div 
            key={column.status}
            className="flex-shrink-0 w-80"
            onDragOver={(e) => handleDragOver(e, column.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            {/* Column Header - Light Style */}
            <div className={`mb-4 p-4 rounded-3xl ${column.bgColor} border-2 ${column.color} border-opacity-50 transition-all duration-200 ${isDragOver ? 'ring-2 ring-indigo-400 ring-offset-2 scale-105' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">{column.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-black text-slate-900">{columnOpportunities.length}</span>
                    <span className="text-xs text-slate-500 font-medium">deals</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(totalValue)}</p>
                  <p className="text-xs text-slate-500">total value</p>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className={`space-y-4 min-h-[200px] rounded-3xl transition-all duration-200 p-2 ${isDragOver ? 'bg-indigo-50/50 border-2 border-dashed border-indigo-300' : ''}`}>
              {columnOpportunities.map((opportunity) => (
                <PipelineCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onClick={() => onSelectOpportunity(opportunity)}
                  isDragging={draggedOpportunityId === opportunity.id}
                  onDragStart={(e) => handleDragStart(e, opportunity.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
              
              {columnOpportunities.length === 0 && (
                <div className={`flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl bg-white transition-all duration-200 ${isDragOver ? 'bg-indigo-50 border-indigo-300' : ''}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${isDragOver ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                    <Building2 className={`w-5 h-5 ${isDragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
                  </div>
                  <p className="text-sm font-medium">
                    {isDragOver ? 'Drop here' : 'No deals'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface PipelineCardProps {
  opportunity: CRMOpportunity;
  onClick: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ 
  opportunity, 
  onClick, 
  isDragging,
  onDragStart,
  onDragEnd
}) => {
  const company = getCRMCompanyById(opportunity.companyId);
  const primaryContact = getCRMContactById(opportunity.primaryContactId);

  // Calculate lead score
  const leadScore = React.useMemo(() => {
    try {
      return calculateLeadScore(opportunity, company || undefined, primaryContact || undefined);
    } catch {
      return null;
    }
  }, [opportunity, company, primaryContact]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group bg-white rounded-3xl p-5 border border-slate-200 hover:border-indigo-300 cursor-move transition-all duration-200 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 ${isDragging ? 'opacity-50 rotate-2 scale-95 shadow-2xl' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
            <Building2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
              {company?.name || 'Unknown Company'}
            </h4>
            <p className="text-xs text-slate-500 truncate">
              {primaryContact?.fullName || 'No contact assigned'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="text-slate-300 cursor-grab active:cursor-grabbing p-1 hover:text-slate-400 transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all">
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Lead Score */}
      {leadScore && (
        <div className="mb-4">
          <LeadScorePill score={leadScore} />
        </div>
      )}

      {/* Deal Value & Stage */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-slate-900">
            {formatCurrency(opportunity.estimatedValue)}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-2 py-1 bg-slate-100 rounded-lg">
          {STAGE_LABELS[opportunity.stage]}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm mb-4">
        {opportunity.locationInterest && (
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{opportunity.locationInterest}</span>
          </div>
        )}
        {opportunity.billboardType && (
          <div className="flex items-center gap-2 text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>{opportunity.billboardType}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="flex items-center gap-3">
          {opportunity.numberOfAttempts > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="w-3 h-3" />
              {opportunity.numberOfAttempts}
            </span>
          )}
        </div>
        
        {opportunity.nextFollowUpDate && (
          <span className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium ${
            isOverdue(opportunity.nextFollowUpDate) 
              ? 'bg-red-50 text-red-600 border border-red-200' 
              : isToday(opportunity.nextFollowUpDate)
                ? 'bg-amber-50 text-amber-600 border border-amber-200'
                : 'bg-slate-100 text-slate-600'
          }`}>
            <Calendar className="w-3 h-3" />
            {formatDate(opportunity.nextFollowUpDate)}
          </span>
        )}
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
