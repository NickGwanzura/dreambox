/**
 * String Sanitization Utilities
 * Safe string handling for user inputs
 */

/**
 * Generate a unique ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Sanitize a string by removing dangerous characters
 */
export const sanitizeString = (input: string | undefined): string => {
  if (!input) return '';
  
  return input
    .trim()
    // Remove null bytes
    .replace(/\x00/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove control characters
    .replace(/[\x01-\x1F\x7F]/g, '')
    // Limit length (safety)
    .substring(0, 1000);
};

/**
 * Sanitize HTML content (for rich text fields)
 */
export const sanitizeHtml = (input: string | undefined): string => {
  if (!input) return '';
  
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
};

/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phone: string | undefined): string => {
  if (!phone) return '';
  
  // Basic formatting for Zimbabwe numbers
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `+263 ${cleaned.substring(1, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('263')) {
    return `+${cleaned.substring(0, 3)} ${cleaned.substring(3, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
  }
  
  return phone;
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number | undefined, currency: string = 'USD'): string => {
  if (amount === undefined || amount === null) return '-';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string | undefined, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Convert string to URL-safe slug
 */
export const slugify = (text: string | undefined): string => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

/**
 * Parse and normalize URL
 */
export const normalizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  
  let normalized = url.trim();
  
  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  
  return normalized;
};
