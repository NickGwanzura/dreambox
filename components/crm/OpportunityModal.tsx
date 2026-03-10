
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, User, Phone, Mail, MapPin, DollarSign, 
  Calendar, Plus, Trash2, Save,
  PhoneCall, Mail as MailIcon, MessageSquare, Calendar as CalendarIcon,
  CheckCircle2, Target, Sparkles,
  LayoutList, ClipboardList, Activity, Zap, Globe, Briefcase,
  FileDown, ArrowRight, Clock, AlertCircle
} from 'lucide-react';
import { AccessibleModal } from '../ui/AccessibleModal';
import { LoadingButton } from '../ui/LoadingButton';
import { 
  CRMOpportunity, 
  CRMCompany, 
  CRMContact, 
  OpportunityStatus, 
  OpportunityStage,
  CRMTask,
  CRMTouchpoint
} from '../../types';
import { 
  getCRMCompanyById, 
  getCRMContactById,
  getTouchpointsByOpportunity,
  getTasksByOpportunity,
  addCRMCompany,
  addCRMContact,
  addCRMOpportunity,
  updateCRMOpportunity,
  updateOpportunityStatus,
  addCRMTask,
  completeCRMTask,
  deleteCRMOpportunity,
  logCall,
  logEmail
} from '../../services/crmService';
import { getCurrentUser } from '../../services/authServiceSecure';
import { useToast } from '../ToastProvider';
import { formatCurrency } from '../../utils/sanitizers';
import { logger } from '../../utils/logger';
import { calculateLeadScore, LeadScore } from '../../services/leadScoring';
import { LeadScoreBadge, LeadScoreBar } from './LeadScoreBadge';
import { LeadScoreBreakdown } from './LeadScoreBreakdown';
import { generateOpportunityReport } from '../../services/crmPdfService';

interface OpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunity?: CRMOpportunity;
}

const STATUS_OPTIONS: { value: OpportunityStatus; label: string; color: string; bgColor: string }[] = [
  { value: 'new', label: 'New', color: 'bg-slate-500', bgColor: 'bg-slate-100' },
  { value: 'contacted', label: 'Contacted', color: 'bg-blue-500', bgColor: 'bg-blue-100' },
  { value: 'qualified', label: 'Qualified', color: 'bg-indigo-500', bgColor: 'bg-indigo-100' },
  { value: 'proposal', label: 'Proposal', color: 'bg-violet-500', bgColor: 'bg-violet-100' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-amber-500', bgColor: 'bg-amber-100' },
  { value: 'closed_won', label: 'Closed Won', color: 'bg-emerald-500', bgColor: 'bg-emerald-100' },
  { value: 'closed_lost', label: 'Closed Lost', color: 'bg-red-500', bgColor: 'bg-red-100' },
];

const BILLBOARD_TYPES = [
  { value: '', label: 'Select type' },
  { value: 'LED Digital', label: 'LED Digital' },
  { value: 'Static Billboard', label: 'Static Billboard' },
  { value: 'Both', label: 'Both Types' },
];

export const OpportunityModal: React.FC<OpportunityModalProps> = ({
  isOpen,
  onClose,
  opportunity,
}) => {
  const isEditing = !!opportunity;
  const currentUser = getCurrentUser();
  const { showToast } = useToast();

  const [formData, setFormData] = useState<Partial<CRMOpportunity & { company: Partial<CRMCompany>; contact: Partial<CRMContact> }>>({
    status: 'new',
    stage: 'new_lead',
    numberOfAttempts: 0,
    company: {},
    contact: {},
  });

  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'tasks' | 'score'>('details');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);

  const existingCompany = useMemo(() => 
    opportunity ? getCRMCompanyById(opportunity.companyId) : null,
    [opportunity]
  );
  const existingContact = useMemo(() => 
    opportunity ? getCRMContactById(opportunity.primaryContactId) : null,
    [opportunity]
  );
  const touchpoints = useMemo(() => 
    opportunity ? getTouchpointsByOpportunity(opportunity.id) : [],
    [opportunity]
  );
  const tasks = useMemo(() => 
    opportunity ? getTasksByOpportunity(opportunity.id) : [],
    [opportunity]
  );
  
  const leadScore = useMemo(() => {
    if (!opportunity) return null;
    try {
      return calculateLeadScore(opportunity, existingCompany || undefined, existingContact || undefined, touchpoints);
    } catch {
      return null;
    }
  }, [opportunity, existingCompany, existingContact, touchpoints]);

  useEffect(() => {
    if (opportunity) {
      setFormData({
        ...opportunity,
        company: existingCompany || {},
        contact: existingContact || {},
      });
    } else {
      setFormData({
        status: 'new',
        stage: 'new_lead',
        numberOfAttempts: 0,
        company: {},
        contact: {},
      });
    }
  }, [opportunity, existingCompany, existingContact]);

  const handleSave = async () => {
    if (!currentUser) return;
    
    setIsSaving(true);
    try {
      if (isEditing && opportunity) {
        updateCRMOpportunity(opportunity);
        showToast('Opportunity updated', 'success');
      } else {
        const company = addCRMCompany(formData.company as CRMCompany);
        const contact = addCRMContact({
          ...(formData.contact as CRMContact),
          companyId: company.id,
          isPrimary: true,
        });
        
        addCRMOpportunity({
          companyId: company.id,
          primaryContactId: contact.id,
          status: formData.status as OpportunityStatus,
          stage: formData.stage as OpportunityStage,
          estimatedValue: formData.estimatedValue,
          locationInterest: formData.locationInterest,
          billboardType: formData.billboardType,
          campaignDuration: formData.campaignDuration,
          leadSource: formData.leadSource,
          assignedTo: currentUser.id,
          createdBy: currentUser.id,
        });
        
        showToast('Opportunity created', 'success');
      }
      onClose();
    } catch (error) {
      logger.error('Save failed:', error);
      showToast('Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: OpportunityStatus) => {
    if (!opportunity) return;
    
    let newStage: OpportunityStage = opportunity.stage;
    if (newStatus === 'contacted' && opportunity.status === 'new') {
      newStage = 'initial_contact';
    } else if (newStatus === 'qualified') {
      newStage = 'qualification';
    } else if (newStatus === 'proposal') {
      newStage = 'proposal_sent';
    } else if (newStatus === 'negotiation') {
      newStage = 'negotiation';
    } else if (newStatus === 'closed_won') {
      newStage = 'closed_won';
    } else if (newStatus === 'closed_lost') {
      newStage = 'closed_lost';
    }
    
    updateOpportunityStatus(opportunity.id, newStatus, newStage);
    showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
    
    // Update local form data to reflect change
    setFormData({ ...formData, status: newStatus, stage: newStage });
  };

  const handleFollowUpDateChange = (date: string) => {
    if (!opportunity) return;
    
    updateCRMOpportunity({
      ...opportunity,
      nextFollowUpDate: date,
    });
    setFormData({ ...formData, nextFollowUpDate: date });
    showToast('Follow-up date updated', 'success');
  };

  const quickSetFollowUp = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    handleFollowUpDateChange(date.toISOString().split('T')[0]);
  };

  const handleLogCall = () => {
    if (!opportunity || !currentUser) return;
    
    setIsLoggingActivity(true);
    logCall(
      opportunity.id,
      opportunity.primaryContactId,
      'follow_up_required',
      'Follow-up call logged',
      0,
      currentUser.id
    );
    showToast('Call logged', 'success');
    setIsLoggingActivity(false);
  };

  const handleLogEmail = () => {
    if (!opportunity || !currentUser) return;
    
    setIsLoggingActivity(true);
    logEmail(
      opportunity.id,
      'Follow-up',
      'Email sent to prospect',
      'outbound',
      currentUser.id
    );
    showToast('Email logged', 'success');
    setIsLoggingActivity(false);
  };

  const handleAddTask = () => {
    if (!opportunity || !currentUser) return;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    addCRMTask({
      opportunityId: opportunity.id,
      type: 'follow_up',
      title: 'Follow up with prospect',
      dueDate: tomorrow.toISOString().split('T')[0],
      status: 'pending',
      priority: 'medium',
      assignedTo: currentUser.id,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    });
    showToast('Task added', 'success');
  };

  const handleDelete = () => {
    if (!opportunity || !confirm('Are you sure you want to delete this opportunity?')) return;
    
    deleteCRMOpportunity(opportunity.id);
    showToast('Opportunity deleted', 'success');
    onClose();
  };

  const handleGeneratePDF = async () => {
    if (!opportunity) return;
    try {
      await generateOpportunityReport(opportunity.id);
      showToast('Opportunity report generated', 'success');
    } catch (error) {
      logger.error('PDF generation failed:', error);
      showToast('Failed to generate report', 'error');
    }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: LayoutList },
    { id: 'activity', label: 'Activity', icon: Activity, count: touchpoints.length },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList, count: tasks.filter(t => t.status !== 'completed').length },
    { id: 'score', label: 'AI Score', icon: Sparkles, badge: leadScore?.quality === 'hot' ? 'Hot' : undefined },
  ];

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            <Building2 className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {isEditing ? existingCompany?.name || 'Edit Opportunity' : 'New Opportunity'}
            </h3>
            {isEditing && leadScore && (
              <div className="flex items-center gap-2 mt-0.5">
                <LeadScoreBadge score={leadScore} size="sm" />
                <span className="text-xs text-slate-500">
                  {existingContact?.fullName}
                </span>
              </div>
            )}
          </div>
        </div>
      }
      size="xl"
      footer={
        <div className="flex justify-between w-full">
          <div className="flex gap-2">
            {isEditing && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {isEditing && (
              <button
                onClick={handleGeneratePDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-all border border-slate-200 shadow-sm"
              >
                <FileDown className="w-4 h-4" />
                Export PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <LoadingButton
              onClick={handleSave}
              loading={isSaving}
              variant="primary"
            >
              <Save className="w-4 h-4 mr-2" />
              {isEditing ? 'Save Changes' : 'Create Opportunity'}
            </LoadingButton>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Tabs */}
        {isEditing && (
          <div className="flex p-1 bg-slate-100 rounded-2xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : ''}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Quick Actions Bar */}
            {isEditing && opportunity && (
              <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Status Quick Change */}
                  <div className="flex-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-white/70 mb-3 block">
                      Quick Status Change
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.filter(s => s.value !== 'closed_won' && s.value !== 'closed_lost').map((s) => (
                        <button
                          key={s.value}
                          onClick={() => handleStatusChange(s.value)}
                          disabled={opportunity.status === s.value}
                          className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                            opportunity.status === s.value
                              ? 'bg-white text-indigo-600 shadow-md'
                              : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                          } disabled:cursor-default`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${s.color}`} />
                            {s.label}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleStatusChange('closed_won')}
                        disabled={opportunity.status === 'closed_won'}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          opportunity.status === 'closed_won'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 border border-emerald-400/30'
                        }`}
                      >
                        ✓ Mark as Won
                      </button>
                      <button
                        onClick={() => handleStatusChange('closed_lost')}
                        disabled={opportunity.status === 'closed_lost'}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          opportunity.status === 'closed_lost'
                            ? 'bg-red-500 text-white'
                            : 'bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-400/30'
                        }`}
                      >
                        ✕ Mark as Lost
                      </button>
                    </div>
                  </div>

                  {/* Next Follow-up */}
                  <div className="lg:w-72">
                    <label className="text-xs font-bold uppercase tracking-wider text-white/70 mb-3 block">
                      Next Follow-up
                    </label>
                    <input
                      type="date"
                      value={formData.nextFollowUpDate || ''}
                      onChange={(e) => handleFollowUpDateChange(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/50 focus:bg-white/20 focus:border-white/40 outline-none transition-all mb-3"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => quickSetFollowUp(1)}
                        className="flex-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors border border-white/10"
                      >
                        Tomorrow
                      </button>
                      <button
                        onClick={() => quickSetFollowUp(3)}
                        className="flex-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors border border-white/10"
                      >
                        3 Days
                      </button>
                      <button
                        onClick={() => quickSetFollowUp(7)}
                        className="flex-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors border border-white/10"
                      >
                        1 Week
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Lead Score Card */}
            {isEditing && leadScore && (
              <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white shadow-sm">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">AI Lead Score</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Updated {new Date(leadScore.calculatedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <LeadScoreBadge score={leadScore} size="lg" />
                </div>
                <LeadScoreBar score={leadScore} showLabel={false} />
              </div>
            )}
            
            {/* Company Info */}
            <Section title="Company Information" icon={Building2}>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Company Name *">
                  <input
                    type="text"
                    value={formData.company?.name || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      company: { ...formData.company, name: e.target.value }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                    placeholder="ABC Company Ltd"
                  />
                </FormField>
                <FormField label="Industry">
                  <input
                    type="text"
                    value={formData.company?.industry || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      company: { ...formData.company, industry: e.target.value }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                    placeholder="Retail, Banking, etc."
                  />
                </FormField>
                <FormField label="Website">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.company?.website || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        company: { ...formData.company, website: e.target.value }
                      })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="https://example.com"
                    />
                  </div>
                </FormField>
                <FormField label="City">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.company?.city || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        company: { ...formData.company, city: e.target.value }
                      })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="Harare"
                    />
                  </div>
                </FormField>
              </div>
            </Section>

            {/* Contact Info */}
            <Section title="Primary Contact" icon={User}>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Full Name *">
                  <input
                    type="text"
                    value={formData.contact?.fullName || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      contact: { ...formData.contact, fullName: e.target.value }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                    placeholder="John Smith"
                  />
                </FormField>
                <FormField label="Job Title">
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.contact?.jobTitle || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contact: { ...formData.contact, jobTitle: e.target.value }
                      })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="Marketing Director"
                    />
                  </div>
                </FormField>
                <FormField label="Email">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={formData.contact?.email || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contact: { ...formData.contact, email: e.target.value }
                      })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </FormField>
                <FormField label="Phone">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.contact?.phone || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contact: { ...formData.contact, phone: e.target.value }
                      })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="+263772123456"
                    />
                  </div>
                </FormField>
              </div>
            </Section>

            {/* Deal Details */}
            <Section title="Deal Details" icon={DollarSign}>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Status">
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as OpportunityStatus })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Estimated Value">
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={formData.estimatedValue || ''}
                      onChange={(e) => setFormData({ ...formData, estimatedValue: parseFloat(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="25000"
                    />
                  </div>
                </FormField>
                <FormField label="Location Interest">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.locationInterest || ''}
                      onChange={(e) => setFormData({ ...formData, locationInterest: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="Harare CBD"
                    />
                  </div>
                </FormField>
                <FormField label="Billboard Type">
                  <select
                    value={formData.billboardType || ''}
                    onChange={(e) => setFormData({ ...formData, billboardType: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                  >
                    {BILLBOARD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Campaign Duration">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.campaignDuration || ''}
                      onChange={(e) => setFormData({ ...formData, campaignDuration: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      placeholder="6 months"
                    />
                  </div>
                </FormField>
                <FormField label="Lead Source">
                  <input
                    type="text"
                    value={formData.leadSource || ''}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                    placeholder="Website, Referral, etc."
                  />
                </FormField>
              </div>
            </Section>

            {/* Follow-up & Notes Section */}
            {isEditing && opportunity && (
              <Section title="Follow-up & Notes" icon={Clock}>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Next Follow-up Date">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        value={formData.nextFollowUpDate || ''}
                        onChange={(e) => handleFollowUpDateChange(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      />
                    </div>
                  </FormField>
                  <FormField label="Last Contact Date">
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        value={formData.lastContactDate || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, lastContactDate: e.target.value });
                          updateCRMOpportunity({ ...opportunity, lastContactDate: e.target.value });
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                      />
                    </div>
                  </FormField>
                </div>
                <div className="mt-4">
                  <FormField label="Call Outcome / Notes">
                    <textarea
                      value={formData.callOutcomeNotes || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, callOutcomeNotes: e.target.value });
                        updateCRMOpportunity({ ...opportunity, callOutcomeNotes: e.target.value });
                      }}
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all resize-none"
                      placeholder="Enter notes from last call or meeting..."
                    />
                  </FormField>
                </div>
              </Section>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && opportunity && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <ActionButton onClick={handleLogCall} icon={PhoneCall} label="Log Call" loading={isLoggingActivity} />
              <ActionButton onClick={handleLogEmail} icon={MailIcon} label="Log Email" loading={isLoggingActivity} />
            </div>

            <div className="space-y-3">
              {touchpoints.length === 0 ? (
                <EmptyState 
                  icon={MessageSquare} 
                  title="No activity recorded yet" 
                  description="Start tracking your interactions with this lead"
                />
              ) : (
                touchpoints.map((touchpoint) => (
                  <ActivityItem key={touchpoint.id} touchpoint={touchpoint} />
                ))
              )}
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && opportunity && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900">Tasks & Follow-ups</h4>
              <button
                onClick={handleAddTask}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-indigo-200"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            <div className="space-y-2">
              {tasks.length === 0 ? (
                <EmptyState 
                  icon={CalendarIcon} 
                  title="No tasks scheduled" 
                  description="Add tasks to stay on top of follow-ups"
                />
              ) : (
                tasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))
              )}
            </div>
          </div>
        )}
        
        {/* Score Tab */}
        {activeTab === 'score' && opportunity && (
          <div className="space-y-4">
            {leadScore ? (
              <LeadScoreBreakdown score={leadScore} />
            ) : (
              <EmptyState 
                icon={Target} 
                title="No Score Available" 
                description="Add more activity to generate a lead score"
              />
            )}
          </div>
        )}
      </div>
    </AccessibleModal>
  );
};

// Helper Components

const Section: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
    <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
      <Icon className="w-4 h-4 text-indigo-600" />
      {title}
    </h4>
    {children}
  </div>
);

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
      {label}
    </label>
    {children}
  </div>
);

const ActionButton: React.FC<{ onClick: () => void; icon: any; label: string; loading?: boolean }> = ({
  onClick, icon: Icon, label, loading
}) => (
  <button
    onClick={onClick}
    disabled={loading}
    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-all border border-slate-200 shadow-sm disabled:opacity-50"
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const EmptyState: React.FC<{ icon: any; title: string; description: string }> = ({ icon: Icon, title, description }) => (
  <div className="text-center py-12 text-slate-500">
    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
      <Icon className="w-8 h-8 text-slate-400" />
    </div>
    <p className="text-lg font-bold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 mt-1">{description}</p>
  </div>
);

const ActivityItem: React.FC<{ touchpoint: CRMTouchpoint }> = ({ touchpoint }) => {
  const getIcon = () => {
    if (touchpoint.type.includes('call')) return <PhoneCall className="w-4 h-4" />;
    if (touchpoint.type.includes('email')) return <MailIcon className="w-4 h-4" />;
    return <MessageSquare className="w-4 h-4" />;
  };

  const getColor = () => {
    if (touchpoint.type.includes('call')) return 'bg-blue-50 text-blue-600 border-blue-100';
    if (touchpoint.type.includes('email')) return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="flex gap-3 p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 transition-colors shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${getColor()}`}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 capitalize">
            {touchpoint.type.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-slate-400">
            {new Date(touchpoint.createdAt).toLocaleDateString()}
          </span>
        </div>
        {touchpoint.content && (
          <p className="text-sm text-slate-600 mt-1">{touchpoint.content}</p>
        )}
        {touchpoint.outcome && (
          <span className="inline-block mt-2 px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-500 border border-slate-200">
            {touchpoint.outcome.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
};

const TaskItem: React.FC<{ task: CRMTask }> = ({ task }) => {
  const isOverdue = task.status !== 'completed' && new Date(task.dueDate) < new Date();

  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-colors ${
      isOverdue 
        ? 'bg-red-50 border-red-200' 
        : 'bg-white border-slate-200 hover:border-indigo-200'
    }`}>
      <button
        onClick={() => completeCRMTask(task.id, 'Completed', '')}
        className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors ${
          task.status === 'completed'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 hover:border-indigo-500'
        }`}
      >
        {task.status === 'completed' && <CheckCircle2 className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {task.title}
        </p>
        <p className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
          Due {new Date(task.dueDate).toLocaleDateString()}
          {isOverdue && ' (Overdue)'}
        </p>
      </div>
      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize border ${
        task.priority === 'high' || task.priority === 'urgent'
          ? 'bg-red-100 text-red-700 border-red-200'
          : task.priority === 'medium'
            ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}>
        {task.priority}
      </span>
    </div>
  );
};
