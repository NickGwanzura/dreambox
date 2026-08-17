import React, { useState, useMemo } from 'react';
import { Contract, ContractAmendment, Invoice } from '../types';
import { addMonths, calculateContractMonths, calculateContractMonthsSafe } from '../utils/contractDate';
import { splitInclusiveVat, formatVatPercent } from '../services/constants';
import { getEffectiveVatRate } from '../services/mockData';
import { getContractAmendmentsForContract, addContractAmendment, deleteContractAmendment, updateContract, invoices, getContracts, getBillboards, addInvoice, updateInvoice, deleteInvoice, logAction } from '../services/mockData';
import { getCurrentUser } from '../services/authServiceSecure';
import { notifyApp } from '../utils/notifications';
import { X, AlertTriangle, CheckCircle, Calendar, TrendingUp, TrendingDown, FileText, History, ArrowRight, Loader2, Clock, DollarSign, Trash2 } from 'lucide-react';

interface Props {
  contract: Contract;
  onClose: () => void;
  onApplied: () => void;
}

const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const ContractAmendmentModal: React.FC<Props> = ({ contract, onClose, onApplied }) => {
  type AmendmentTab = 'extension' | 'reduction' | 'rate_change';
  const [activeTab, setActiveTab] = useState<AmendmentTab>('extension');
  const [newMonthlyRate, setNewMonthlyRate] = useState(contract.monthlyRate);
  const [newEndDate, setNewEndDate] = useState(contract.endDate);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInvoiceDeleteConfirm, setShowInvoiceDeleteConfirm] = useState(false);

  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const currentUser = getCurrentUser();

  // FIX #3: Use calculateContractMonthsSafe for display (shows 1 as fallback).
  // The throwing version calculateContractMonths is used in handleApply for business logic.
  const originalMonths = calculateContractMonthsSafe(contract.startDate, contract.endDate, 1);
  const newMonths = calculateContractMonthsSafe(contract.startDate, newEndDate, 1);
  const monthsDelta = newMonths - originalMonths;
  const rateDelta = newMonthlyRate - contract.monthlyRate;

  // FIX #4: Compare dates using getTime() numeric comparison, not string comparison.
  // String comparison "2025-01-31" > "2025-02-01" works lexicographically for ISO dates,
  // but using timestamps is safer and avoids any locale/format issues.
  const currentEndTime = new Date(contract.endDate).getTime();
  const newEndTime = new Date(newEndDate).getTime();
  const isExtension = newEndTime > currentEndTime;
  const isReduction = newEndTime < currentEndTime;

  const financialImpact = activeTab === 'rate_change'
    ? rateDelta * originalMonths
    : monthsDelta * contract.monthlyRate;
  const isValidChange = activeTab === 'rate_change'
    ? rateDelta !== 0
    : (isExtension || isReduction);

  // Affected invoices for reductions — fixed date comparison
  const affectedInvoices = useMemo(() => {
    if (!isReduction) return [];
    const newEndDateTime = new Date(newEndDate).getTime();
    return invoices.filter(i => 
      i.contractId === contract.id && 
      String(i.type || '').toLowerCase() === 'invoice' &&
      new Date(i.date).getTime() > newEndDateTime
    );
  }, [isReduction, contract.id, newEndDate]);

  const totalCreditDue = affectedInvoices.reduce((sum, i) => sum + i.total, 0);

  // Amendment history
  const history = useMemo(() => getContractAmendmentsForContract(contract.id), [contract.id]);

  const handleQuickDate = (deltaMonths: number) => {
    setError(null);
    const next = addMonths(contract.endDate, deltaMonths);
    setNewEndDate(next);
  };

  const getAvailabilityForExtension = (): { ok: boolean; reason?: string } => {
    if (!isExtension) return { ok: true };
    // Extension availability: check from day after current end to new end
    const extStart = new Date(contract.endDate);
    extStart.setDate(extStart.getDate() + 1);
    const extStartStr = extStart.toISOString().split('T')[0];

    const allContracts = getContracts();
    const activeContracts = allContracts.filter((c: Contract) =>
      c.billboardId === contract.billboardId &&
      ['active', 'pending'].includes(String(c.status || '').toLowerCase()) &&
      c.id !== contract.id
    );

    const newStart = new Date(extStartStr).getTime();
    const newEnd = new Date(newEndDate).getTime();

    const overlapping = activeContracts.filter((c: Contract) => {
      const cStart = new Date(c.startDate).getTime();
      const cEnd = new Date(c.endDate).getTime();
      return newStart <= cEnd && newEnd >= cStart;
    });

    if (overlapping.length === 0) return { ok: true };

    // Side/slot specific check — also parse details field for side info
    const billboard = getBillboards().find((b: any) => b.id === contract.billboardId);
    if (!billboard) return { ok: true };

    const detailsIncludesSide = (c: Contract, side: string): boolean => {
      const d = (c.details || '').toLowerCase();
      return d.includes(`side ${side.toLowerCase()}`) ||
        d.includes('both') ||
        d.includes('sides a & b');
    };

    if (billboard.type === 'Static') {
      const conflict = overlapping.find((c: Contract) => 
        c.side === contract.side ||
        c.side === 'Both' ||
        (contract.side && (contract.side === 'A' || contract.side === 'B') && detailsIncludesSide(c, contract.side)) ||
        (contract.side && detailsIncludesSide(c, 'Both'))
      );
      if (conflict) return { ok: false, reason: `Side conflict with ${conflict.id} (${conflict.details})` };
    } else {
      const conflict = overlapping.find((c: Contract) => c.slotNumber === contract.slotNumber);
      if (conflict) return { ok: false, reason: `Slot ${contract.slotNumber} conflict with ${conflict.id}` };
    }

    return { ok: true };
  };

  const availability = getAvailabilityForExtension();

  const handleApply = async () => {
    setError(null);

    if (!isValidChange) {
      setError('Please select a different end date. The new end date must be before or after the current end date.');
      return;
    }

    if (activeTab !== 'rate_change' && newEndDate <= contract.startDate) {
      setError('New end date must be after the contract start date.');
      return;
    }

    if (isExtension && !availability.ok) {
      setError(`Cannot extend: ${availability.reason || 'Billboard is not available for the extended period.'}`);
      return;
    }



    // FIX #5: Validate dates WILL produce a meaningful month count before proceeding.
    // Use the throwing version of calculateContractMonths to catch invalid dates early.
    try {
      if (activeTab !== 'rate_change') {
        calculateContractMonths(contract.startDate, newEndDate);
      }
    } catch (dateErr: any) {
      setError(dateErr.message || 'Invalid dates selected. Please check the start and end dates.');
      return;
    }

    setSaving(true);

    try {
      const effectiveMonths = activeTab === 'rate_change' ? originalMonths : newMonths;
      const effectiveMonthlyRate = activeTab === 'rate_change' ? newMonthlyRate : contract.monthlyRate;
      const newTotalValue = (effectiveMonthlyRate * effectiveMonths) +
        (contract.installationCost || 0) +
        (contract.printingCost || 0) +
        (contract.productionCost || 0);

      const updatedContract: Contract = {
        ...contract,
        endDate: activeTab === 'rate_change' ? contract.endDate : newEndDate,
        monthlyRate: effectiveMonthlyRate,
        totalContractValue: newTotalValue,
        lastModifiedDate: new Date().toISOString(),
        lastModifiedBy: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || currentUser?.email || 'Current User',
      };

      const amendment: ContractAmendment = {
        id: `AM-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        contractId: contract.id,
        type: activeTab,
        oldStartDate: contract.startDate,
        oldEndDate: contract.endDate,
        newStartDate: contract.startDate,
        newEndDate: activeTab === 'rate_change' ? contract.endDate : newEndDate,
        oldMonthlyRate: contract.monthlyRate,
        newMonthlyRate: effectiveMonthlyRate,
        oldTotalValue: contract.totalContractValue,
        newTotalValue: newTotalValue,
        monthsChanged: Math.abs(activeTab === 'rate_change' ? 0 : monthsDelta),
        financialImpact: financialImpact,
        reason: reason || undefined,
        requestedBy: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || currentUser?.email || 'Staff',
        approvedBy: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || currentUser?.email || 'Staff',
        status: 'applied',
        invoiceImpactNote: affectedInvoices.length > 0
          ? `${affectedInvoices.length} invoice(s) cover the removed period. Total credit due: $${totalCreditDue.toLocaleString()}. Consider issuing credit notes.`
          : undefined,
        createdAt: new Date().toISOString(),
        appliedAt: new Date().toISOString(),
      };



      // FIX #1 (REVISED): Contract-first strategy prevents orphan amendments.
      // Update the contract FIRST so that if it fails, nothing is persisted.
      // Then save the amendment; if the amendment fails, roll back the contract
      // using a snapshot of the original contract state.
      
      const originalSnapshot = { ...contract };
      
      try {
        await updateContract(updatedContract);
      } catch (contractErr: any) {
        console.error('Contract update failed. No changes were applied.');
        setError('Failed to update contract. No changes were applied.');
        setSaving(false);
        return;
      }

      try {
        await addContractAmendment(amendment);
      } catch (amendmentErr) {
        console.error('Amendment record failed. Rolling back contract...');
        try {
          await updateContract(originalSnapshot);
          setError('Contract was updated but the amendment record failed. The contract has been rolled back. Please try again.');
        } catch (rollbackErr) {
          console.error('CRITICAL: Rollback also failed.', rollbackErr);
          setError('Contract updated but amendment failed AND rollback error. Check data integrity.');
        }
        // Keep saving true during rollback to prevent user interaction with inconsistent state
        setSaving(false);
        return;
      }

      // Auto-generate invoices for extension months
      if (isExtension && monthsDelta > 0) {
        for (let i = 1; i <= monthsDelta; i++) {
          const monthDate = addMonths(contract.endDate, i);
          const gross = effectiveMonthlyRate;
          const { subtotal, vat: vatAmount } = contract.hasVat
            ? splitInclusiveVat(gross, vatRate)
            : { subtotal: gross, vat: 0 };
          try {
            await addInvoice({
              contractId: contract.id,
              clientId: contract.clientId,
              date: monthDate,
              items: [{ description: `Monthly Rental (Amendment Extension) — ${monthDate}`, amount: gross }],
              subtotal,
              vatAmount,
              total: gross,
              status: 'Pending',
              type: 'Invoice',
            } as any);
          } catch (invErr: any) {
            console.error('Failed to create extension invoice:', invErr);
            notifyApp(`Failed: ${invErr?.message || 'Server error. Please try again.'}`, 'error');
          }
        }
      }

      // --- FEATURE: Amend invoices tied to this contract ---

      // For rate changes: update all pending/unpaid invoices tied to this contract with the new rate
      if (activeTab === 'rate_change' && effectiveMonthlyRate !== contract.monthlyRate) {
        const contractInvoices = invoices.filter(i =>
          i.contractId === contract.id &&
          String(i.type || '').toLowerCase() === 'invoice' &&
          (i.status === 'Pending' || i.status === 'Overdue')
        );
        const unmatchedInvoices: string[] = [];
        for (const inv of contractInvoices) {
          // Recalculate each invoice with the new monthly rate
          const updatedItems = inv.items.map(item => {
            // Match items that look like monthly rental lines
            if (item.description && (item.description.toLowerCase().includes('monthly rental') || item.description.includes(contract.id))) {
              return { ...item, amount: effectiveMonthlyRate };
            }
            return item;
          });
          const wasModified = JSON.stringify(inv.items) !== JSON.stringify(updatedItems);
          const newGross = updatedItems.reduce((sum, it) => sum + it.amount, 0);
          const { subtotal: newSubtotal, vat: newVat } = contract.hasVat
            ? splitInclusiveVat(newGross, vatRate)
            : { subtotal: newGross, vat: 0 };
          try {
            await updateInvoice({
              ...inv,
              items: updatedItems,
              subtotal: newSubtotal,
              vatAmount: newVat,
              total: newGross,
            });
          } catch (invErr: any) {
            console.error('Failed to update invoice:', invErr);
            notifyApp(`Failed: ${invErr?.message || 'Server error. Please try again.'}`, 'error');
          }
          if (!wasModified && inv.items.length > 0) {
            unmatchedInvoices.push(inv.id);
          }
        }
        if (contractInvoices.length > 0) {
          logAction('Rate Change', `Updated ${contractInvoices.length} invoice(s) for contract ${contract.id} with new rate $${effectiveMonthlyRate}`);
        }
        if (unmatchedInvoices.length > 0) {
          console.warn('Rate change: the following invoices had no recognizable monthly rental line and were not updated:', unmatchedInvoices);
        }
      }

      // For reductions: delete/cancel invoices that fall beyond the new end date
      if (activeTab === 'reduction' && isReduction && affectedInvoices.length > 0) {
        if (!showInvoiceDeleteConfirm) {
          // First attempt — show confirmation instead of immediately deleting
          setSaving(false);
          setShowInvoiceDeleteConfirm(true);
          return;
        }
        for (const inv of affectedInvoices) {
          try {
            await deleteInvoice(inv.id);
          } catch (invErr: any) {
            console.error('Failed to delete affected invoice:', invErr);
            notifyApp(`Failed: ${invErr?.message || 'Server error. Please try again.'}`, 'error');
          }
        }
        if (affectedInvoices.length > 0) {
          logAction('Reduction', `Removed ${affectedInvoices.length} invoice(s) beyond new end date for contract ${contract.id}`);
        }
      }

      onApplied();
    } catch (err: any) {
      setError(err.message || 'Failed to apply amendment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Timeline bar calculations
  const totalSpanDays = Math.max(
    new Date(newEndDate).getTime() - new Date(contract.startDate).getTime(),
    new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()
  ) / 86400000;

  const getBarStyle = (start: string, end: string, type: 'current' | 'new' | 'overlap' | 'removed' | 'added') => {
    const startDays = (new Date(start).getTime() - new Date(contract.startDate).getTime()) / 86400000;
    const durationDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    const left = totalSpanDays > 0 ? (startDays / totalSpanDays) * 100 : 0;
    const width = totalSpanDays > 0 ? (durationDays / totalSpanDays) * 100 : 0;

    const colors = {
      current: 'bg-slate-400',
      new: 'bg-indigo-500',
      overlap: 'bg-emerald-500',
      removed: 'bg-red-400',
      added: 'bg-emerald-500',
    };

    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.max(0, width)}%`,
      className: `absolute top-0 h-full ${colors[type]} rounded-sm`,
    };
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }} role="dialog" aria-modal="true" aria-label="Contract Amendment">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Contract Amendment</h3>
            <p className="text-xs text-slate-900 mt-0.5">{contract.id} &bull; Modify contract duration</p>
          </div>
          <button onClick={() => { if (!saving) onClose(); }} disabled={saving} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40">
            <X size={20} className="text-slate-900" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* Amendment Tabs: Extend / Reduce / Rate Change */}
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
              onClick={() => { setActiveTab('extension'); setNewEndDate(contract.endDate); setError(null); setShowInvoiceDeleteConfirm(false); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'extension' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-900 hover:text-slate-700'}`}
            >
              <TrendingUp size={14} /> Extend
            </button>
            <button
              onClick={() => { setActiveTab('reduction'); setNewEndDate(contract.endDate); setError(null); setShowInvoiceDeleteConfirm(false); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'reduction' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-900 hover:text-slate-700'}`}
            >
              <TrendingDown size={14} /> Reduce
            </button>
            <button
              onClick={() => { setActiveTab('rate_change'); setNewMonthlyRate(contract.monthlyRate); setError(null); setShowInvoiceDeleteConfirm(false); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'rate_change' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-900 hover:text-slate-700'}`}
            >
              <DollarSign size={14} /> Rate
            </button>
          </div>

          {/* Context Card */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Current Contract</p>
                <p className="text-sm font-semibold">{contract.startDate} &mdash; {contract.endDate}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Duration</p>
                <p className="text-sm font-semibold">{originalMonths} month(s)</p>
              </div>
            </div>
            <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
              <p className="text-xs text-slate-900">Monthly Rate</p>
              <p className="text-sm font-bold">${contract.monthlyRate.toLocaleString()}/mo {contract.hasVat && <span className="text-slate-900 font-normal">(incl. {vatPct})</span>}</p>
            </div>
            {activeTab === 'rate_change' && (
              <div className="border-t border-indigo-700/50 pt-3 flex justify-between items-center">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">New Rate</p>
                <p className="text-sm font-bold">${newMonthlyRate.toLocaleString()}/mo {contract.hasVat && <span className="text-slate-900 font-normal">(incl. {vatPct})</span>}</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Rate Change Input */}
          {activeTab === 'rate_change' ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-900">New Monthly Rate</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Current Rate</label>
                  <input type="number" value={contract.monthlyRate} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">New Rate ($)</label>
                  <input
                    type="number"
                    value={newMonthlyRate}
                    min={0}
                    onChange={(e) => { setNewMonthlyRate(Number(e.target.value)); setError(null); }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Difference</label>
                  <div className={`w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 ${
                    rateDelta > 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : rateDelta < 0
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-slate-50 text-slate-900 border border-slate-200'
                  }`}>
                    {rateDelta > 0 ? <TrendingUp size={14} /> : rateDelta < 0 ? <TrendingDown size={14} /> : null}
                    {rateDelta === 0 ? 'No change' : `${rateDelta > 0 ? '+' : ''}$${rateDelta.toLocaleString()}/mo`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[50, 100, 200, 500].map(inc => (
                  <button key={inc} type="button" onClick={() => setNewMonthlyRate(prev => prev + inc)} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-1">
                    <DollarSign size={10} /> +{inc}
                  </button>
                ))}
                {[50, 100, 200].map(dec => (
                  <button key={dec} type="button" onClick={() => setNewMonthlyRate(prev => Math.max(0, prev - dec))} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors flex items-center gap-1">
                    <DollarSign size={10} /> -{dec}
                  </button>
                ))}
              </div>
              {contract.hasVat && newMonthlyRate > 0 && (
                <p className="text-xs text-slate-900">
                  Net: ${splitInclusiveVat(newMonthlyRate, vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(newMonthlyRate, vatRate).vat.toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            /* Date Input for Extension/Reduction */
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                {activeTab === 'extension' ? 'New End Date (Extension)' : 'New End Date (Early Termination)'}
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Current End</label>
                  <input type="date" value={contract.endDate} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">New End Date</label>
                  <input
                    type="date"
                    value={newEndDate}
                    min={activeTab === 'reduction' ? contract.startDate : contract.endDate}
                    onChange={(e) => { setNewEndDate(e.target.value); setError(null); }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Duration Change</label>
                  <div className={`w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 ${
                    monthsDelta > 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : monthsDelta < 0
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-50 text-slate-900 border border-slate-200'
                  }`}>
                    {monthsDelta > 0 ? <TrendingUp size={14} /> : monthsDelta < 0 ? <TrendingDown size={14} /> : null}
                    {monthsDelta === 0 ? 'No change' : `${monthsDelta > 0 ? '+' : ''}${monthsDelta} month${Math.abs(monthsDelta) !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>

              {/* Quick buttons */}
              <div className="flex flex-wrap gap-2">
                {activeTab === 'extension' ? (
                  <>
                    {[1, 3, 6, 12].map(m => (
                      <button key={m} type="button" onClick={() => handleQuickDate(m)} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors flex items-center gap-1">
                        <Calendar size={10} /> +{m} Mo
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {[-1, -3, -6].map(m => (
                      <button key={m} type="button" onClick={() => handleQuickDate(m)} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors flex items-center gap-1">
                        <Calendar size={10} /> {m} Mo
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Visual Timeline */}
          {isValidChange && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Timeline Preview</p>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-4">
                {/* Bar */}
                <div className="relative h-8 bg-slate-200 rounded-xl overflow-hidden">
                  {/* Current period */}
                  {(() => {
                    const style = getBarStyle(contract.startDate, contract.endDate, 'current');
                    return <div style={{ left: style.left, width: style.width }} className={`${style.className} opacity-60`} />;
                  })()}
                  {/* Added/Removed segment */}
                  {isExtension && (() => {
                    const extStart = new Date(contract.endDate);
                    extStart.setDate(extStart.getDate() + 1);
                    const style = getBarStyle(extStart.toISOString().split('T')[0], newEndDate, 'added');
                    return <div style={{ left: style.left, width: style.width }} className={style.className} />;
                  })()}
                  {isReduction && (() => {
                    const redStart = new Date(newEndDate);
                    redStart.setDate(redStart.getDate() + 1);
                    const style = getBarStyle(redStart.toISOString().split('T')[0], contract.endDate, 'removed');
                    return <div style={{ left: style.left, width: style.width }} className={style.className} />;
                  })()}
                  {/* Labels */}
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white z-10">
                    {newMonths} month{newMonths !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1 text-slate-900"><div className="w-3 h-3 bg-slate-400 rounded-sm opacity-60" /> Original</span>
                  {isExtension && <span className="flex items-center gap-1 text-emerald-600"><div className="w-3 h-3 bg-emerald-500 rounded-sm" /> Added</span>}
                  {isReduction && <span className="flex items-center gap-1 text-red-500"><div className="w-3 h-3 bg-red-400 rounded-sm" /> Removed</span>}
                </div>
              </div>
            </div>
          )}

          {/* Financial Impact */}
          {isValidChange && (() => {
            const isPositiveImpact = financialImpact > 0;
            const effectiveNewValue = (() => {
              const rate = activeTab === 'rate_change' ? newMonthlyRate : contract.monthlyRate;
              const months = activeTab === 'rate_change' ? originalMonths : newMonths;
              return (rate * months) + (contract.installationCost || 0) + (contract.printingCost || 0) + (contract.productionCost || 0);
            })();
            return (
            <div className={`rounded-2xl p-5 space-y-3 ${activeTab === 'extension' ? 'bg-emerald-50 border border-emerald-100' : activeTab === 'reduction' ? 'bg-amber-50 border border-amber-100' : 'bg-indigo-50 border border-indigo-100'}`}>
              <div className="flex justify-between items-center">
                <p className={`text-xs font-bold uppercase tracking-wider ${activeTab === 'extension' ? 'text-emerald-700' : activeTab === 'reduction' ? 'text-amber-700' : 'text-indigo-700'}`}>
                  Financial Impact
                </p>
                <span className={`text-xs font-bold px-2 py-1 rounded ${activeTab === 'extension' ? 'bg-emerald-100 text-emerald-700' : activeTab === 'reduction' ? 'bg-amber-100 text-amber-700' : isPositiveImpact ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                  {activeTab === 'extension' ? 'Additional Revenue' : activeTab === 'reduction' ? 'Credit Due' : isPositiveImpact ? 'Revenue Increase' : 'Revenue Decrease'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-0.5">Original</p>
                  <p className="text-lg font-black text-slate-800">${contract.totalContractValue.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-900">Total contract value</p>
                </div>
                <div className="bg-white/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-0.5">New</p>
                  <p className="text-lg font-black text-slate-800">${effectiveNewValue.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-900">Revised value</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${activeTab === 'extension' ? 'bg-emerald-100' : activeTab === 'reduction' ? 'bg-amber-100' : isPositiveImpact ? 'bg-indigo-100' : 'bg-red-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${activeTab === 'extension' ? 'text-emerald-700' : activeTab === 'reduction' ? 'text-amber-700' : isPositiveImpact ? 'text-indigo-700' : 'text-red-600'}`}>
                    {activeTab === 'extension' ? 'Additional Revenue' : activeTab === 'reduction' ? 'Credit Due' : isPositiveImpact ? 'Revenue Increase' : 'Revenue Decrease'}
                  </p>
                  <p className={`text-lg font-black ${activeTab === 'extension' ? 'text-emerald-700' : activeTab === 'reduction' ? 'text-amber-700' : isPositiveImpact ? 'text-indigo-700' : 'text-red-600'}`}>
                    ${Math.abs(financialImpact).toLocaleString()}
                  </p>
                  {contract.hasVat && financialImpact !== 0 && (
                    <p className="text-[10px] mt-0.5 text-slate-900">
                      Net: ${splitInclusiveVat(Math.abs(financialImpact), vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(Math.abs(financialImpact), vatRate).vat.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            );
          })()}

          {/* Affected Invoices Warning */}
          {isReduction && affectedInvoices.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle size={16} />
                <p className="text-xs font-bold uppercase tracking-wider">Invoices Affected by Reduction</p>
              </div>
              <p className="text-xs text-red-600">
                {affectedInvoices.length} invoice(s) dated after the new end date will be removed. Other invoices covering the reduced period may still need credit notes.
              </p>
              <div className="space-y-2">
                {affectedInvoices.map(inv => (
                  <div key={inv.id} className="bg-white rounded-xl border border-red-100 p-3 flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-red-400" />
                      <span className="font-medium text-slate-700">{inv.id}</span>
                      <span className="text-xs text-slate-900">{inv.date}</span>
                    </div>
                    <span className="font-bold text-slate-800">${(inv.total ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold text-red-700 pt-1 border-t border-red-100">
                <span>Total credit consideration</span>
                <span>${totalCreditDue.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Availability Warning for Extension */}
          {isExtension && !availability.ok && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">Availability Conflict</p>
                <p className="text-xs text-red-600 mt-0.5">{availability.reason || 'This billboard is not available for the extended period.'}</p>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-900">Reason for Amendment</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={activeTab === 'extension' ? 'e.g., Client wants to extend campaign for Q4...' : activeTab === 'reduction' ? 'e.g., Client requested early termination due to budget cuts...' : 'e.g., Adjusting rate due to market conditions...'}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900 placeholder:text-slate-900 min-h-[80px] resize-y"
            />
          </div>

          {/* Amendment History Toggle */}
          {history.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                  <History size={14} />
                  Amendment History ({history.length})
                </div>
                <ArrowRight size={14} className={`text-slate-900 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
              </button>
              {showHistory && (
                <div className="p-4 space-y-3 max-h-48 overflow-y-auto">
                  {history.map((amendment) => (
                    <div key={amendment.id} className="flex items-start gap-3 text-sm group">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${amendment.type === 'extension' ? 'bg-emerald-500' : amendment.type === 'reduction' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-700 capitalize">{amendment.type}</span>
                          <span className="text-xs text-slate-900">
                            <Clock size={10} className="inline mr-1" />
                            {new Date(amendment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-900 mt-0.5">
                          {formatDate(amendment.oldEndDate)} &rarr; {formatDate(amendment.newEndDate)}
                          {' · '}
                          <span className={amendment.financialImpact >= 0 ? 'text-emerald-600' : 'text-amber-600'}>
                            {amendment.financialImpact >= 0 ? '+' : '-'}${Math.abs(amendment.financialImpact).toLocaleString()}
                          </span>
                        </p>
                        {amendment.reason && <p className="text-xs text-slate-900 mt-0.5 italic truncate">"{amendment.reason}"</p>}
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('Delete this amendment record? This cannot be undone.')) {
                            deleteContractAmendment(amendment.id);
                            onApplied();
                          }
                        }}
                        className="shrink-0 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                        title="Delete amendment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invoice Deletion Confirmation */}
          {showInvoiceDeleteConfirm && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-700 text-sm">Delete {affectedInvoices.length} Invoice(s)?</h4>
                  <p className="text-xs text-red-600 mt-1">
                    This reduction will permanently delete {affectedInvoices.length} invoice(s) that cover the removed period.
                    {totalCreditDue > 0 && <span> Total value: <strong>${totalCreditDue.toLocaleString()}</strong>.</span>}
                  </p>
                </div>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {affectedInvoices.map(inv => (
                  <div key={inv.id} className="bg-white rounded-xl border border-red-100 p-2.5 flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-red-400" />
                      <span className="font-medium text-slate-700">{inv.id}</span>
                      <span className="text-xs text-slate-900">{inv.date}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inv.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        inv.status === 'Overdue' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{inv.status}</span>
                    </div>
                    <span className="font-bold text-slate-800">${(inv.total ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowInvoiceDeleteConfirm(false);
                  }}
                  className="flex-1 py-2.5 text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                >
                  Cancel Reduction
                </button>
                <button
                  onClick={() => {
                    setShowInvoiceDeleteConfirm(false);
                    handleApply();
                  }}
                  className="flex-1 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <Trash2 size={13} /> Delete & Apply
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { if (!saving) onClose(); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={saving || showInvoiceDeleteConfirm || !isValidChange || (isExtension && !availability.ok)}
              className={`flex-1 py-3 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                activeTab === 'extension'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : activeTab === 'reduction'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? 'Applying…' : activeTab === 'extension' ? 'Apply Extension' : activeTab === 'reduction' ? 'Apply Reduction' : 'Apply Rate Change'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
