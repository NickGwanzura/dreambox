import { api } from './apiClient';

type DocType = 'contract' | 'invoice' | 'quotation' | 'receipt';

export interface SendDocumentOptions {
  to?: string[];
  cc?: string[];
  subject?: string;
  customMessage?: string;
}

export const sendDocumentEmail = async (
  documentType: DocType,
  documentId: string,
  options: SendDocumentOptions = {}
): Promise<{ message: string | null; to: string | null; error: Error | null }> => {
  try {
    const result = await api.post<{ message: string; to: string }>('/api/documents/send-email', {
      documentType,
      documentId,
      ...options,
    });
    return { message: result.message, to: result.to, error: null };
  } catch (error: any) {
    return { message: null, to: null, error: new Error(error.message || 'Failed to send') };
  }
};
