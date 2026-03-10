
import React, { useState, useCallback } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { AccessibleModal } from '../ui/AccessibleModal';
import { LoadingButton } from '../ui/LoadingButton';
import { importCSV, CSVImportResult, CSVValidationError, parseCSV, validateCSVRow, checkForDuplicates } from '../../services/crmService';
import { getCurrentUser } from '../../services/authServiceSecure';
import { useToast } from '../ToastProvider';
import { logger } from '../../utils/logger';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (result: CSVImportResult) => void;
}

const CSV_TEMPLATE = `Company Name,Company Industry,Website,Primary Contact Name,Job Title,Phone Number,Email Address,LinkedIn Profile,Secondary Contact,Location Interest (Zone/City),Billboard Type Interest,Campaign Duration,Estimated Deal Value,Opportunity Status,Opportunity Stage,Lead Source,Last Contact Date,Next Follow-Up Date,Call Outcome/Notes,Number of Attempts,Street Address,City,Country
ABC Retail Ltd,Retail,https://abcretail.com,John Smith,Marketing Director,+263772123456,john.smith@abcretail.com,https://linkedin.com/in/johnsmith,,Harare CBD,LED Digital,6 months,15000,new,new_lead,Website,2026-03-10,2026-03-15,Initial inquiry,1,123 Main Street,Harare,Zimbabwe
XYZ Bank,Banking,https://xyzbank.co.zw,Sarah Johnson,Brand Manager,+263773987654,sarah.j@xyzbank.co.zw,https://linkedin.com/in/sarahj,,Bulawayo,Static Billboard,12 months,45000,contacted,initial_contact,Referral,2026-03-08,2026-03-12,Scheduled discovery call,2,456 Park Lane,Bulawayo,Zimbabwe`;

export const CSVImportModal: React.FC<CSVImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [errors, setErrors] = useState<CSVValidationError[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ row: number; email: string; company: string }>>([]);
  const [options, setOptions] = useState({
    skipDuplicates: false,
    updateExisting: false,
  });

  const { showToast } = useToast();
  const currentUser = getCurrentUser();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      handleFile(droppedFile);
    } else {
      showToast('Please upload a CSV file', 'error');
    }
  }, [showToast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  }, []);

  const handleFile = (file: File) => {
    setFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      
      // Parse preview
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1, 6).map(line => line.split(',').map(c => c.trim())); // Preview first 5 rows
        setPreview({ headers, rows });
        
        // Validate
        validateData(text);
      }
    };
    
    reader.readAsText(file);
  };

  const validateData = (text: string) => {
    const rows = parseCSV(text);
    const allErrors: CSVValidationError[] = [];
    const allDuplicates: Array<{ row: number; email: string; company: string }> = [];

    rows.forEach((row, index) => {
      const rowErrors = validateCSVRow(row, index + 2);
      allErrors.push(...rowErrors);

      const dupCheck = checkForDuplicates(row);
      if (dupCheck.isDuplicate) {
        allDuplicates.push({
          row: index + 2,
          email: row['Email Address'] || '',
          company: row['Company Name'],
        });
      }
    });

    setErrors(allErrors);
    setDuplicates(allDuplicates);
  };

  const handleImport = async () => {
    if (!csvText || !currentUser) return;
    
    setIsLoading(true);
    try {
      const result = importCSV(csvText, currentUser.id, options);
      onImport(result);
    } catch (error) {
      logger.error('Import failed:', error);
      showToast('Import failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crm-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFile = () => {
    setFile(null);
    setCsvText('');
    setPreview(null);
    setErrors([]);
    setDuplicates([]);
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Import CSV"
      size="xl"
      footer={
        <div className="flex justify-between w-full">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <LoadingButton
              onClick={handleImport}
              loading={isLoading}
              disabled={!csvText || errors.length > 0}
              variant="primary"
            >
              Import {preview?.rows.length || 0} Records
            </LoadingButton>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Upload Area */}
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-indigo-600" />
            </div>
            <p className="text-slate-900 font-bold mb-2">
              Drop your CSV file here, or click to browse
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Supports CSV files up to 10MB
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-input"
            />
            <label
              htmlFor="csv-input"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-bold cursor-pointer hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
              <FileText className="w-4 h-4" />
              Select File
            </label>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                  <FileText className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-slate-900 font-bold">{file.name}</p>
                  <p className="text-sm text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB · {preview?.rows.length || 0} rows
                  </p>
                </div>
              </div>
              <button
                onClick={clearFile}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Options */}
        {file && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Import Options</h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.skipDuplicates}
                onChange={(e) => setOptions({ ...options, skipDuplicates: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-600">
                Skip duplicate records (based on email/company)
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.updateExisting}
                onChange={(e) => setOptions({ ...options, updateExisting: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-600">
                Update existing records instead of skipping
              </span>
            </label>
          </div>
        )}

        {/* Validation Results */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h4 className="text-red-700 font-bold">
                Validation Errors ({errors.length})
              </h4>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {errors.slice(0, 10).map((error, i) => (
                <p key={i} className="text-sm text-red-600">
                  Row {error.row}: {error.column} - {error.message}
                </p>
              ))}
              {errors.length > 10 && (
                <p className="text-sm text-red-700 font-medium">
                  ... and {errors.length - 10} more errors
                </p>
              )}
            </div>
          </div>
        )}

        {/* Duplicate Warnings */}
        {duplicates.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h4 className="text-amber-700 font-bold">
                Potential Duplicates ({duplicates.length})
              </h4>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {duplicates.slice(0, 5).map((dup, i) => (
                <p key={i} className="text-sm text-amber-700">
                  Row {dup.row}: {dup.company} {dup.email && `(${dup.email})`}
                </p>
              ))}
              {duplicates.length > 5 && (
                <p className="text-sm text-amber-800 font-medium">
                  ... and {duplicates.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && errors.length === 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h4 className="text-emerald-700 font-bold">
                Preview (first 5 rows)
              </h4>
            </div>
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {preview.headers.map((header, i) => (
                      <th key={i} className="px-4 py-3 text-left text-slate-600 font-bold whitespace-nowrap text-xs uppercase tracking-wider">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-3 text-slate-600 whitespace-nowrap max-w-[150px] truncate">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
};
