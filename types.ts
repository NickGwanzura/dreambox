
export enum BillboardType {
  Static = 'Static',
  LED = 'LED'
}

export interface Billboard {
  id: string;
  name: string;
  location: string;
  town: string;
  type: BillboardType;
  width: number;
  height: number;
  imageUrl?: string; // Base64 or URL
  coordinates: {
    lat: number;
    lng: number;
  };
  
  // Marketing Info
  visibility?: string; // Traffic analysis, demographics, etc.
  dailyTraffic?: number; // Estimated daily view count

  // For Static with independent pricing
  sideARate?: number;
  sideBRate?: number;
  sideAStatus?: 'Available' | 'Rented' | 'Maintenance';
  sideBStatus?: 'Available' | 'Rented' | 'Maintenance';
  sideAClientId?: string;
  sideBClientId?: string;
  
  // For LED
  ratePerSlot?: number;
  totalSlots?: number;
  rentedSlots?: number;

  // Maintenance & Admin
  lastMaintenanceDate?: string; // ISO Date String
  notes?: string; // Internal notes
}

export interface MaintenanceLog {
  id: string;
  billboardId: string;
  date: string;
  type: 'Routine' | 'Repair' | 'Emergency' | 'Inspection';
  description: string;
  cost: number;
  performedBy: string;
  nextDueDate: string; // Calculated at time of completion + 3 months
  notes?: string; // Additional field for internal notes
}

export interface OutsourcedBillboard {
  id: string;
  billboardId: string; // Linked to internal inventory
  billboardName?: string; // Cache for display
  mediaOwner: string; // The 3rd party
  ownerContact: string;
  monthlyPayout: number; // Revenue from them
  contractStart: string;
  contractEnd: string;
  status: 'Active' | 'Inactive';
}

export interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  status: 'Active' | 'Inactive';
  billingDay?: number; // Preferred day of month for payment
}

export interface Contract {
  id: string;
  clientId: string;
  billboardId: string;
  startDate: string;
  endDate: string;
  
  // Financials
  monthlyRate: number;
  installationCost: number; // One-time fee
  printingCost: number; // Tied to a printing job
  hasVat: boolean;
  totalContractValue: number; // (Monthly * Months) + Install + Print + VAT
  
  status: 'Active' | 'Pending' | 'Expired';
  details: string; // e.g., "Side A" or "Slot 5"
  
  // Specific Tracking
  slotNumber?: number; 
  side?: 'A' | 'B' | 'Both';
  
  // Audit Trail
  createdAt?: string; // ISO Date String
  lastModifiedDate?: string; // ISO Date String
  lastModifiedBy?: string;
  assignedTo?: string; // User name of the Sales Agent who closed this deal
}

export interface Invoice {
  id: string;
  contractId?: string;
  clientId: string;
  date: string;
  items: { description: string; amount: number }[];
  subtotal: number;
  discountAmount?: number;
  discountDescription?: string;
  vatAmount: number; // 0 if hasVat is false
  total: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  type: 'Invoice' | 'Quotation' | 'Receipt';
  
  // Audit Trail
  paymentMethod?: 'Cash' | 'Bank Transfer' | 'EcoCash' | 'Other';
  paymentReference?: string;
}

export interface PrintingJob {
  id: string;
  clientId: string;
  billboardId?: string; // Optional link to installation
  date: string;
  description: string;
  dimensions: string; // e.g. "12x3m"
  
  // Cost Breakdown
  pvcCost: number;
  inkCost: number;
  electricityCost: number;
  operatorCost: number;
  weldingCost: number;
  
  totalCost: number;
  chargedAmount: number; // What we charged the client (Profit margin)
}

export interface Expense {
  id: string;
  category: 'Maintenance' | 'Printing' | 'Electricity' | 'Labor' | 'Other';
  description: string;
  amount: number;
  date: string;
  reference?: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  role: 'Admin' | 'Manager' | 'Staff' | 'Sales Agent';
  email: string;
  username?: string; // Added for simplified login
  password?: string; // Added for Auth - NEVER store plaintext
  status: 'Active' | 'Pending' | 'Rejected'; // Security status
}

/**
 * Session User - User object without sensitive fields
 * Used for authenticated session state
 */
export type SessionUser = Omit<User, 'password'>;

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Todo' | 'In Progress' | 'Done';
  dueDate: string;
  createdAt: string;
  relatedBillboardId?: string; // For automated maintenance tracking
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user: string;
}

export interface CompanyProfile {
    name: string;
    vatNumber: string;
    regNumber: string;
    email: string;
    supportEmail: string;
    phone: string;
    website: string;
    address: string;
    city: string;
    country: string;
}

/**
 * VAT Rate constant - also available in services/constants.ts
 * @deprecated Use VAT_RATE from services/constants.ts instead
 */
export const VAT_RATE = 0.15;

// ==========================================
// CRM OUTREACH TRACKING SYSTEM
// ==========================================

export type OpportunityStatus = 
  | 'new' 
  | 'contacted' 
  | 'qualified' 
  | 'proposal' 
  | 'negotiation' 
  | 'closed_won' 
  | 'closed_lost';

export type OpportunityStage = 
  | 'new_lead'
  | 'initial_contact'
  | 'discovery_call'
  | 'site_survey'
  | 'proposal_sent'
  | 'negotiation'
  | 'contract_pending'
  | 'closed_won'
  | 'closed_lost'
  | 'nurture';

export type TouchpointType = 
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'call_made'
  | 'call_connected'
  | 'call_voicemail'
  | 'call_no_answer'
  | 'linkedin_connect'
  | 'linkedin_message'
  | 'linkedin_view'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'meeting_no_show'
  | 'sms_sent'
  | 'whatsapp_sent'
  | 'note_added';

export type TouchpointDirection = 'outbound' | 'inbound';

export type TouchpointOutcome = 
  | 'successful'
  | 'no_answer'
  | 'callback_requested'
  | 'not_interested'
  | 'follow_up_required'
  | 'meeting_booked'
  | 'proposal_requested'
  | 'objection_price'
  | 'objection_timing'
  | 'unsubscribe';

export type TouchpointSentiment = 
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'objection'
  | 'buying_signal'
  | 'urgent';

export type CRMTaskType = 
  | 'call'
  | 'email'
  | 'meeting'
  | 'proposal'
  | 'follow_up'
  | 'site_survey'
  | 'contract_review';

export type CRMTaskStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled';

export type CRMTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Company entity (normalized from CSV Company Name)
export interface CRMCompany {
  id: string;
  name: string;                    // Company Name
  industry?: string;               // Company Industry
  website?: string;                // Website
  streetAddress?: string;          // Street Address
  city?: string;                   // City
  country?: string;                // Country
  createdAt: string;
  updatedAt: string;
}

// Contact entity (Primary + Secondary from CSV)
export interface CRMContact {
  id: string;
  companyId: string;
  fullName: string;                // Primary/Secondary Contact Name
  jobTitle?: string;               // Job Title
  phone?: string;                  // Phone Number
  email?: string;                  // Email Address
  linkedinUrl?: string;            // LinkedIn Profile
  isPrimary: boolean;
  createdAt: string;
}

// Main Opportunity entity (core CRM record matching CSV)
export interface CRMOpportunity {
  id: string;
  
  // Company & Contact Links
  companyId: string;
  primaryContactId: string;
  secondaryContactId?: string;
  
  // Interest & Product Fields (from CSV)
  locationInterest?: string;       // Location Interest (Zone/City)
  billboardType?: string;          // Billboard Type Interest
  campaignDuration?: string;       // Campaign Duration
  
  // Financial
  estimatedValue?: number;         // Estimated Deal Value
  actualValue?: number;            // Final closed value
  
  // Pipeline State
  status: OpportunityStatus;       // Opportunity Status
  stage: OpportunityStage;         // Opportunity Stage
  
  // Source & Attribution
  leadSource?: string;             // Lead Source
  
  // Activity Tracking (auto-updated)
  lastContactDate?: string;        // Last Contact Date
  nextFollowUpDate?: string;       // Next Follow-Up Date
  callOutcomeNotes?: string;       // Call Outcome/Notes
  numberOfAttempts: number;        // Number of Attempts
  
  // Assignment & Ownership
  assignedTo?: string;             // User ID
  createdBy: string;               // User ID
  
  // System Fields
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedReason?: string;           // Win/Loss reason
  
  // Days in stage tracking
  daysInCurrentStage: number;
  stageHistory: StageHistoryEntry[];
}

export interface StageHistoryEntry {
  stage: OpportunityStage;
  enteredAt: string;
  exitedAt?: string;
  daysInStage: number;
}

// Touchpoint - Every interaction logged
export interface CRMTouchpoint {
  id: string;
  opportunityId: string;
  
  type: TouchpointType;
  direction: TouchpointDirection;
  
  // Content
  subject?: string;
  content?: string;
  clientResponse?: string;
  
  // Outcome & Analysis
  outcome?: TouchpointOutcome;
  sentiment?: TouchpointSentiment;
  durationSeconds?: number;        // For calls
  
  // Metadata
  createdBy: string;               // User ID
  createdAt: string;
}

// Task - Follow-ups and reminders
export interface CRMTask {
  id: string;
  opportunityId: string;
  
  type: CRMTaskType;
  title: string;
  description?: string;
  
  dueDate: string;                 // Next Follow-Up Date drives this
  status: CRMTaskStatus;
  priority: CRMTaskPriority;
  
  assignedTo: string;              // User ID
  completedBy?: string;            // User ID
  completedAt?: string;
  completionNotes?: string;
  
  createdAt: string;
  createdBy: string;
}

// CSV Import/Export Row Structure
export interface CRMCSVRow {
  'Company Name': string;
  'Company Industry'?: string;
  'Website'?: string;
  'Primary Contact Name': string;
  'Job Title'?: string;
  'Phone Number'?: string;
  'Email Address'?: string;
  'LinkedIn Profile'?: string;
  'Secondary Contact'?: string;
  'Location Interest (Zone/City)'?: string;
  'Billboard Type Interest'?: string;
  'Campaign Duration'?: string;
  'Estimated Deal Value'?: string | number;
  'Opportunity Status': OpportunityStatus;
  'Opportunity Stage'?: OpportunityStage;
  'Lead Source'?: string;
  'Last Contact Date'?: string;
  'Next Follow-Up Date'?: string;
  'Call Outcome/Notes'?: string;
  'Number of Attempts'?: string | number;
  'Street Address'?: string;
  'City'?: string;
  'Country'?: string;
}

// Email Thread Tracking
export interface CRMEmailThread {
  id: string;
  opportunityId: string;
  contactId: string;
  
  subject: string;
  messages: CRMEmailMessage[];
  
  status: 'active' | 'replied' | 'no_reply' | 'bounced';
  lastActivityAt: string;
  
  // Tracking
  sentCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
}

export interface CRMEmailMessage {
  id: string;
  threadId: string;
  
  direction: TouchpointDirection;
  fromAddress: string;
  toAddresses: string[];
  
  subject: string;
  body: string;
  bodyText?: string;               // Plain text version
  
  // Tracking pixels/IDs
  trackingId?: string;
  
  // Status
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  
  // Metadata
  createdAt: string;
}

// Call Log Entry
export interface CRMCallLog {
  id: string;
  opportunityId: string;
  contactId: string;
  
  phoneNumber: string;
  direction: TouchpointDirection;
  
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  
  outcome: TouchpointOutcome;
  notes?: string;
  
  recordingUrl?: string;           // Optional call recording
  
  createdBy: string;
  createdAt: string;
}

// Pipeline Analytics
export interface CRMPipelineMetrics {
  totalOpportunities: number;
  totalValue: number;
  weightedValue: number;
  
  byStatus: Record<OpportunityStatus, {
    count: number;
    value: number;
    avgDaysInStage: number;
  }>;
  
  conversionRates: {
    leadToContacted: number;
    contactedToQualified: number;
    qualifiedToProposal: number;
    proposalToClosed: number;
    overall: number;
  };
  
  activityMetrics: {
    callsMade: number;
    callsConnected: number;
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    meetingsScheduled: number;
    meetingsCompleted: number;
  };
  
  overdueTasks: number;
  tasksDueToday: number;
  followUpsRequired: number;
}
