
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
}

export interface Invoice {
  id: string;
  contractId?: string;
  clientId: string;
  date: string;
  items: { description: string; amount: number }[];
  subtotal: number;
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
  role: 'Admin' | 'Manager' | 'Staff';
  email: string;
  username?: string; // Added for simplified login
  password?: string; // Added for Auth
  status: 'Active' | 'Pending' | 'Rejected'; // Security status
}

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

export const VAT_RATE = 0.15;
