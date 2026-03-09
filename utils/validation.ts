/**
 * Input Validation Utilities
 * Centralized validation for all user inputs
 */

import { 
  EMAIL_REGEX, 
  PHONE_REGEX, 
  MAX_NAME_LENGTH, 
  MAX_DESCRIPTION_LENGTH,
  MIN_PASSWORD_LENGTH 
} from '../services/constants';
import { Billboard, Client, Contract, User, Invoice, Expense, Task, CRMCompany, CRMContact, CRMOpportunity, CRMTouchpoint, CRMTask } from '../types';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Generic validators
export const validators = {
  required: (value: any, fieldName: string): void => {
    if (value === null || value === undefined || value === '') {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
  },

  string: (value: any, fieldName: string, maxLength?: number): void => {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`, fieldName);
    }
    if (maxLength && value.length > maxLength) {
      throw new ValidationError(`${fieldName} must be less than ${maxLength} characters`, fieldName);
    }
  },

  email: (value: string, fieldName: string = 'Email'): void => {
    if (!EMAIL_REGEX.test(value)) {
      throw new ValidationError(`${fieldName} format is invalid`, fieldName);
    }
  },

  phone: (value: string, fieldName: string = 'Phone'): void => {
    if (!PHONE_REGEX.test(value)) {
      throw new ValidationError(`${fieldName} format is invalid`, fieldName);
    }
  },

  number: (value: any, fieldName: string, min?: number, max?: number): void => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName} must be a number`, fieldName);
    }
    if (min !== undefined && num < min) {
      throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
    }
    if (max !== undefined && num > max) {
      throw new ValidationError(`${fieldName} must be at most ${max}`, fieldName);
    }
  },

  date: (value: string, fieldName: string): void => {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date`, fieldName);
    }
  },

  enum: <T extends string>(value: T, allowed: T[], fieldName: string): void => {
    if (!allowed.includes(value)) {
      throw new ValidationError(
        `${fieldName} must be one of: ${allowed.join(', ')}`, 
        fieldName
      );
    }
  },
};

// Entity validators
export const validateBillboard = (data: Partial<Billboard>): void => {
  validators.required(data.name, 'Name');
  validators.string(data.name!, 'Name', MAX_NAME_LENGTH);
  validators.required(data.location, 'Location');
  validators.string(data.location!, 'Location', MAX_NAME_LENGTH);
  validators.required(data.town, 'Town');
  validators.string(data.town!, 'Town', MAX_NAME_LENGTH);
  validators.required(data.type, 'Type');
  validators.enum(data.type!, ['Static', 'LED'], 'Type');
  validators.number(data.width!, 'Width', 0.1, 100);
  validators.number(data.height!, 'Height', 0.1, 100);
  
  if (data.coordinates) {
    validators.number(data.coordinates.lat, 'Latitude', -90, 90);
    validators.number(data.coordinates.lng, 'Longitude', -180, 180);
  }
  
  if (data.dailyTraffic !== undefined) {
    validators.number(data.dailyTraffic, 'Daily traffic', 0, 10000000);
  }
};

export const validateClient = (data: Partial<Client>): void => {
  validators.required(data.companyName, 'Company name');
  validators.string(data.companyName!, 'Company name', MAX_NAME_LENGTH);
  validators.required(data.contactPerson, 'Contact person');
  validators.string(data.contactPerson!, 'Contact person', MAX_NAME_LENGTH);
  validators.required(data.email, 'Email');
  validators.email(data.email!);
  validators.required(data.phone, 'Phone');
  validators.phone(data.phone!);
  
  if (data.billingDay !== undefined) {
    validators.number(data.billingDay, 'Billing day', 1, 31);
  }
};

export const validateUser = (data: Partial<User>, isNew: boolean = false): void => {
  validators.required(data.firstName, 'First name');
  validators.string(data.firstName!, 'First name', MAX_NAME_LENGTH);
  validators.required(data.lastName, 'Last name');
  validators.string(data.lastName!, 'Last name', MAX_NAME_LENGTH);
  validators.required(data.email, 'Email');
  validators.email(data.email!);
  
  if (isNew && data.password) {
    if (data.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 
        'password'
      );
    }
  }
  
  if (data.role) {
    validators.enum(data.role, ['Admin', 'Manager', 'Staff'], 'Role');
  }
  
  if (data.status) {
    validators.enum(data.status, ['Active', 'Pending', 'Rejected'], 'Status');
  }
};

export const validateContract = (data: Partial<Contract>): void => {
  validators.required(data.clientId, 'Client');
  validators.required(data.billboardId, 'Billboard');
  validators.required(data.startDate, 'Start date');
  validators.date(data.startDate!, 'Start date');
  validators.required(data.endDate, 'End date');
  validators.date(data.endDate!, 'End date');
  
  const start = new Date(data.startDate!);
  const end = new Date(data.endDate!);
  if (end < start) {
    throw new ValidationError('End date must be after start date', 'endDate');
  }
  
  validators.number(data.monthlyRate!, 'Monthly rate', 0);
  validators.number(data.installationCost!, 'Installation cost', 0);
  validators.number(data.printingCost!, 'Printing cost', 0);
  
  if (data.side) {
    validators.enum(data.side, ['A', 'B', 'Both'], 'Side');
  }
};

export const validateInvoice = (data: Partial<Invoice>): void => {
  validators.required(data.clientId, 'Client');
  validators.date(data.date!, 'Date');
  validators.required(data.items, 'Items');
  
  if (!data.items || data.items.length === 0) {
    throw new ValidationError('At least one item is required', 'items');
  }
  
  data.items.forEach((item, index) => {
    validators.required(item.description, `Item ${index + 1} description`);
    validators.number(item.amount, `Item ${index + 1} amount`, 0);
  });
  
  if (data.status) {
    validators.enum(data.status, ['Paid', 'Pending', 'Overdue'], 'Status');
  }
  
  if (data.type) {
    validators.enum(data.type, ['Invoice', 'Quotation', 'Receipt'], 'Type');
  }
};

export const validateExpense = (data: Partial<Expense>): void => {
  validators.required(data.category, 'Category');
  validators.enum(
    data.category!, 
    ['Maintenance', 'Printing', 'Electricity', 'Labor', 'Other'], 
    'Category'
  );
  validators.required(data.description, 'Description');
  validators.string(data.description!, 'Description', MAX_DESCRIPTION_LENGTH);
  validators.number(data.amount!, 'Amount', 0);
  validators.date(data.date!, 'Date');
};

export const validateTask = (data: Partial<Task>): void => {
  validators.required(data.title, 'Title');
  validators.string(data.title!, 'Title', MAX_NAME_LENGTH);
  validators.required(data.description, 'Description');
  validators.string(data.description!, 'Description', MAX_DESCRIPTION_LENGTH);
  validators.required(data.assignedTo, 'Assigned to');
  validators.string(data.assignedTo!, 'Assigned to', MAX_NAME_LENGTH);
  validators.required(data.priority, 'Priority');
  validators.enum(data.priority!, ['Low', 'Medium', 'High'], 'Priority');
  validators.required(data.status, 'Status');
  validators.enum(data.status!, ['Todo', 'In Progress', 'Done'], 'Status');
  validators.date(data.dueDate!, 'Due date');
};

// CRM Validators
export const validateCRMCompany = (data: Partial<CRMCompany>): void => {
  validators.required(data.name, 'Company name');
  validators.string(data.name!, 'Company name', MAX_NAME_LENGTH);
};

export const validateCRMContact = (data: Partial<CRMContact>): void => {
  validators.required(data.fullName, 'Contact name');
  validators.string(data.fullName!, 'Contact name', MAX_NAME_LENGTH);
  validators.required(data.companyId, 'Company');
  
  if (data.email) {
    validators.email(data.email);
  }
  
  if (data.phone) {
    validators.phone(data.phone);
  }
};

export const validateCRMOpportunity = (data: Partial<CRMOpportunity>): void => {
  validators.required(data.companyId, 'Company');
  validators.required(data.primaryContactId, 'Primary contact');
  validators.required(data.status, 'Status');
  validators.required(data.stage, 'Stage');
  validators.enum(data.status!, ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'], 'Status');
  
  if (data.estimatedValue !== undefined) {
    validators.number(data.estimatedValue, 'Estimated value', 0);
  }
};

export const validateCRMTouchpoint = (data: Partial<CRMTouchpoint>): void => {
  validators.required(data.opportunityId, 'Opportunity');
  validators.required(data.type, 'Touchpoint type');
  validators.required(data.direction, 'Direction');
};

export const validateCRMTask = (data: Partial<CRMTask>): void => {
  validators.required(data.opportunityId, 'Opportunity');
  validators.required(data.title, 'Title');
  validators.required(data.type, 'Task type');
  validators.required(data.dueDate, 'Due date');
  validators.date(data.dueDate!, 'Due date');
  validators.required(data.assignedTo, 'Assigned to');
};

// Sanitization helpers
export const sanitizers = {
  string: (value: string): string => {
    return value
      .trim()
      .replace(/[<>]/g, '') // Basic XSS prevention
      .replace(/\s+/g, ' '); // Normalize whitespace
  },
  
  html: (value: string): string => {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  
  email: (value: string): string => {
    return value.trim().toLowerCase();
  },
};
