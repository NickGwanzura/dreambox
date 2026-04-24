import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../types';
import { getCompanyProfile, updateCompanyProfile, subscribe } from '../services/mockData';
import { CONTRACT_TEMPLATE_PLACEHOLDERS, DEFAULT_CONTRACT_TEMPLATE } from '../utils/contractTemplate';
import { FileText, RotateCcw, Save, CheckCircle, Info, Eye } from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { canAccessSettings } from '../utils/settingsAccess';

export const ContractTemplatePage: React.FC = () => {
  const currentUser = getCurrentUser();
  const hasAccess = canAccessSettings(currentUser);

  const [profile, setProfile] = useState<CompanyProfile>(getCompanyProfile());
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(() => setProfile(getCompanyProfile()));
    return () => unsubscribe();
  }, []);

  if (!hasAccess) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-700">Access Restricted</h2>
        <p className="text-slate-500 font-medium mt-2">The contract template editor is limited to the finance/admin team.</p>
      </div>
    );
  }

  const template = profile.contractTemplate ?? '';
  const isDefault = !template.trim();
  const charCount = template.length;

  const handleSave = () => {
    updateCompanyProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLoadDefault = () => {
    setProfile({ ...profile, contractTemplate: DEFAULT_CONTRACT_TEMPLATE });
  };

  const handleClear = () => {
    if (confirm('Clear the template and fall back to the built-in default? Your custom text will be lost.')) {
      setProfile({ ...profile, contractTemplate: '' });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">
            Contract Template
          </h2>
          <p className="text-slate-500 font-medium">Edit the legal contract body used for every rental agreement PDF.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-2 text-sm font-bold text-green-600 animate-fade-in">
              <CheckCircle size={16} /> Saved
            </span>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2"
          >
            <Eye size={14} /> {showPreview ? 'Hide' : 'Preview'}
          </button>
          <button
            onClick={handleSave}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg"
          >
            <Save size={14} /> Save Template
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-3">
        <div className="p-2 bg-white rounded-lg text-indigo-600 shrink-0"><Info size={16} /></div>
        <div className="text-sm text-indigo-900 space-y-1">
          <p className="font-bold">How this works</p>
          <p className="text-indigo-700 leading-relaxed">
            The template below is plain text with <code className="bg-white/80 px-1.5 py-0.5 rounded text-[11px] font-mono">{`{{placeholders}}`}</code> that get replaced with
            client, billboard, rate, and date details when you click <strong>Generate Full Legal Contract</strong> on any contract. Empty = use the built-in default.
          </p>
        </div>
      </div>

      {/* Placeholders reference */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <details open>
          <summary className="p-5 cursor-pointer font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-slate-50 transition-colors">
            <FileText size={14} /> Available Placeholders ({CONTRACT_TEMPLATE_PLACEHOLDERS.length})
          </summary>
          <div className="px-5 pb-5 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-4">
              {CONTRACT_TEMPLATE_PLACEHOLDERS.map(p => (
                <div key={p.key} className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <button
                    onClick={() => navigator.clipboard?.writeText(`{{${p.key}}}`)}
                    className="font-mono text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-0.5 rounded shrink-0 border border-indigo-100"
                    title="Click to copy"
                  >
                    {`{{${p.key}}}`}
                  </button>
                  <span className="text-xs text-slate-500 pt-0.5">{p.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 italic">Click any placeholder to copy it to your clipboard.</p>
          </div>
        </details>
      </div>

      {/* Editor + Preview */}
      <div className={`grid gap-6 ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Template Body</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isDefault ? 'Empty — using built-in default' : `${charCount.toLocaleString()} chars — custom override`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLoadDefault}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <RotateCcw size={11} /> Load Default
              </button>
              {!isDefault && (
                <button
                  onClick={handleClear}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <textarea
            value={template}
            onChange={(e) => setProfile({ ...profile, contractTemplate: e.target.value })}
            rows={28}
            placeholder={DEFAULT_CONTRACT_TEMPLATE}
            className="w-full px-5 py-4 border-0 focus:outline-none text-[13px] font-mono leading-relaxed resize-y"
            spellCheck={false}
          />
        </div>

        {showPreview && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-700">Preview</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Raw template — placeholders show as {`{{…}}`}. They resolve with real data at PDF generation.</p>
            </div>
            <div className="p-6 max-h-[700px] overflow-y-auto bg-slate-50/50">
              <div className="bg-white rounded-xl shadow-sm p-8 text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap font-serif">
                {template || DEFAULT_CONTRACT_TEMPLATE}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
