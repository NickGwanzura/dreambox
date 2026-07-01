import React, { useState, useEffect, useCallback } from 'react';
import { contracts as initialContracts, clients, billboards, getContracts, getBillboards, addContract, updateContract, updateClient, subscribe, getEffectiveVatRate, endContract, permanentDeleteContract } from '../services/mockData';
import { generateLegalContractPDF } from '../services/pdfGenerator';
import { sendDocumentEmail } from '../services/documentEmail';
import { SendDocumentModal } from './SendDocumentModal';
import { ContractAmendmentModal } from './ContractAmendmentModal';
import { Contract, BillboardType } from '../types';
import { splitInclusiveVat, formatVatPercent } from '../services/constants';
import { addMonths, calculateContractMonths, calculateContractMonthsSafe } from '../utils/contractDate';
import { FileText, Calendar, Download, X, Eye, Clock, Plus as PlusIcon, Edit, CheckCircle, AlertTriangle, RotateCcw, Send, Loader2, Search, XCircle, Trash2 } from 'lucide-react';

export const ContractList: React.FC = () => {
  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [renewContract, setRenewContract] = useState<Contract | null>(null);
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendModal, setSendModal] = useState<{ contract: Contract; client: any } | null>(null);
  const [amendContract, setAmendContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contractToPermanentDelete, setContractToPermanentDelete] = useState<Contract | null>(null);
  const [isDeletingPermanent, setIsDeletingPermanent] = useState(false);
  const [editClientAddress, setEditClientAddress] = useState<{ streetAddress: string; city: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState<'All' | 'Static' | 'Digital'>('All');
  const [newContract, setNewContract] = useState<Contract | null>(null);

  const getContractBillboardType = (contract: Contract) => getBillboards().find(b => b.id === contract.billboardId)?.type;

  const staticCount  = contracts.filter(c => getContractBillboardType(c) === BillboardType.Static).length;
  const digitalCount = contracts.filter(c => getContractBillboardType(c) === BillboardType.LED).length;

  const filteredContracts = contracts.filter(contract => {
      if (typeFilter === 'Static'  && getContractBillboardType(contract) !== BillboardType.Static) return false;
      if (typeFilter === 'Digital' && getContractBillboardType(contract) !== BillboardType.LED)    return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const clientName = String(getClientName(contract.clientId) || '').toLowerCase();
      const billboardName = String(getBillboardName(contract.billboardId) || '').toLowerCase();
      return (
          clientName.includes(q) ||
          billboardName.includes(q) ||
          String(contract.id || '').toLowerCase().includes(q) ||
          String(contract.details || '').toLowerCase().includes(q) ||
          contract.startDate.includes(q) ||
          contract.endDate.includes(q)
      );
  });

  // Close modals on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contractToPermanentDelete) { setContractToPermanentDelete(null); return; }
        if (sendModal) { setSendModal(null); return; }
        if (renewContract) { setRenewContract(null); return; }
        if (newContract) { setNewContract(null); return; }
        if (editContract) { setEditContract(null); setEditClientAddress(null); return; }
        if (selectedContract) { setSelectedContract(null); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contractToPermanentDelete, sendModal, renewContract, newContract, editContract, selectedContract]);

  // Subscribe to real-time updates from other components
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setContracts(getContracts());
      });
      return () => { unsubscribe(); };
  }, []);

  // Poll for updates every 2 seconds to ensure list is in sync if added from another tab or component
  useEffect(() => {
      const interval = setInterval(() => {
          const freshData = getContracts();
          const changed = freshData.length !== contracts.length ||
              freshData.some((c, i) => contracts[i] && JSON.stringify(c) !== JSON.stringify(contracts[i]));
          if (changed) {
              setContracts(freshData);
          }
      }, 2000);
      return () => clearInterval(interval);
  }, [contracts]);

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown';
  const getBillboard = (id: string) => getBillboards().find(b => b.id === id);
  const getDefaultRate = (billboardId: string, side: Contract['side'] = 'A') => {
      const billboard = getBillboard(billboardId);
      if (!billboard) return 0;
      if (billboard.type === BillboardType.LED) return billboard.ratePerSlot || 0;
      if (side === 'B') return billboard.sideBRate || 0;
      if (side === 'Both') return (billboard.sideARate || 0) + (billboard.sideBRate || 0);
      return billboard.sideARate || 0;
  };
  const getLineDetails = (contract: Contract) => {
      const billboard = getBillboard(contract.billboardId);
      if (!billboard) return contract.details || 'Billboard rental';
      if (billboard.type === BillboardType.Static) return contract.side === 'Both' ? 'Sides A & B' : `Side ${contract.side || 'A'}`;
      return `Slot ${contract.slotNumber || 1}`;
  };
  const withBillboardDefaults = (contract: Contract, billboardId: string): Contract => {
      const billboard = getBillboard(billboardId);

      const nextSide: Contract['side'] =
        billboard?.type === BillboardType.Static
          ? (contract.side === 'A' || contract.side === 'B' || contract.side === 'Both' ? contract.side : 'A')
          : undefined;

      const nextSlotNumber = billboard?.type === BillboardType.LED ? (contract.slotNumber ?? 1) : undefined;

      const next = {
        ...contract,
        billboardId,
        side: nextSide,
        slotNumber: nextSlotNumber,
        monthlyRate: getDefaultRate(billboardId, nextSide)
      };

      return { ...next, details: getLineDetails(next) };
  };

  const makeBlankContract = (): Contract => {
      const today = new Date().toISOString().split('T')[0];
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const firstClient = clients[0];
      const firstBillboard = getBillboards()[0];
      const isLED = firstBillboard?.type === BillboardType.LED;
      const draft: Contract = {
          id: `new-${Date.now()}`,
          clientId: firstClient?.id || '',
          billboardId: firstBillboard?.id || '',
          startDate: today,
          endDate: nextYear.toISOString().split('T')[0],
          monthlyRate: isLED ? (firstBillboard?.ratePerSlot || 0) : (firstBillboard?.sideARate || 0),
          installationCost: 0,
          printingCost: 0,
          productionCost: 0,
          hasVat: false,
          totalContractValue: 0,
          status: 'Pending',
          details: isLED ? 'Slot 1' : 'Side A',
          side: isLED ? undefined : 'A',
          slotNumber: isLED ? 1 : undefined,
          createdAt: new Date().toISOString(),
      };
      return draft;
  };

  const handleDownload = (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (client) {
      generateLegalContractPDF(contract, client, getBillboard(contract.billboardId));
    }
  };

  const handleSendEmail = (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (!client) { alert('Client not found'); return; }
    setSendModal({ contract, client });
  };

  interface AvailabilityResult {
      ok: boolean;
      reason?: string;
  }

  // Check availability for edited dates
  const checkAvailabilityForEdit = (contract: Contract, newStart: string, newEnd: string): AvailabilityResult => {
      const billboard = getBillboard(contract.billboardId);
      if (!billboard) {
          console.warn('[ContractList] checkAvailabilityForEdit: billboard not found', contract.billboardId);
          return { ok: false, reason: 'Billboard not found' };
      }

      // Get all contracts for this billboard except current one
      const existingContracts = getContracts().filter(c =>
          c.billboardId === contract.billboardId &&
          c.id !== contract.id &&
          ['active', 'pending'].includes(String(c.status || '').toLowerCase())
      );
      
      const newStartTime = new Date(newStart).getTime();
      const newEndTime = new Date(newEnd).getTime();

      // Check overlaps
      const overlappingContracts = existingContracts.filter(c => {
          const cStart = new Date(c.startDate).getTime();
          const cEnd = new Date(c.endDate).getTime();
          return (newStartTime <= cEnd && newEndTime >= cStart);
      });

      let ok = false;
      let reason = '';

      if (billboard.type === BillboardType.Static) {
          if (contract.side === 'Both') {
              const conflict = overlappingContracts.find(c => c.side === 'A' || c.side === 'B' || c.side === 'Both');
              ok = !conflict;
              if (conflict) reason = `Side conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          } else {
              const conflict = overlappingContracts.find(c => c.side === contract.side || c.side === 'Both');
              ok = !conflict;
              if (conflict) reason = `Side conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          }
      } else {
          if (contract.slotNumber) {
              const conflict = overlappingContracts.find(c => c.slotNumber === contract.slotNumber);
              ok = !conflict;
              if (conflict) reason = `Slot ${contract.slotNumber} conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          } else {
              ok = overlappingContracts.length < (billboard.totalSlots || 1);
              if (!ok) reason = `All ${billboard.totalSlots || 1} slots full (${overlappingContracts.length} overlaps)`;
          }
      }

      if (!ok) {
          console.warn('[ContractList] Availability FAILED:', {
              contractId: contract.id,
              billboardId: contract.billboardId,
              billboardName: billboard.name,
              side: contract.side,
              slotNumber: contract.slotNumber,
              newStart,
              newEnd,
              overlappingCount: overlappingContracts.length,
              reason,
              overlappingContracts: overlappingContracts.map(c => ({ id: c.id, side: c.side, slot: c.slotNumber, start: c.startDate, end: c.endDate, status: c.status }))
          });
      }

      return { ok, reason };
  };

  const handleEditSave = async () => {
      console.log('[ContractList] handleEditSave called', { editContractId: editContract?.id, saving });
      if (!editContract || saving) {
          console.warn('[ContractList] handleEditSave aborted — no editContract or already saving');
          return;
      }
      if (!editContract.startDate || !editContract.endDate) {
          console.warn('[ContractList] Validation failed: missing dates', { startDate: editContract.startDate, endDate: editContract.endDate });
          setEditError('Start date and end date are required before saving a contract term.');
          return;
      }
      if (new Date(editContract.endDate) < new Date(editContract.startDate)) {
          console.warn('[ContractList] Validation failed: endDate before startDate', { startDate: editContract.startDate, endDate: editContract.endDate });
          setEditError('End date cannot be before the start date. Pick a later end date to extend, or move the start date first.');
          return;
      }
      
      // Validate dates don't cause double booking
      const available = checkAvailabilityForEdit(editContract, editContract.startDate, editContract.endDate);
      console.log('[ContractList] Availability check result:', available.ok, available.reason, { billboardId: editContract.billboardId, side: editContract.side, slotNumber: editContract.slotNumber, start: editContract.startDate, end: editContract.endDate });
      if (!available.ok) {
          setEditError(`Selected dates overlap with an existing contract: ${available.reason || 'Conflict detected'}. Please choose different dates.`);
          return;
      }
      
      setEditError(null);
      setSaving(true);
      
      try {
          // Recalculate total contract value
          const months = calculateContractMonths(editContract.startDate, editContract.endDate);
          const gross = (editContract.monthlyRate * months) + editContract.installationCost + editContract.printingCost + (editContract.productionCost || 0);

          const updatedContract: Contract = {
              ...editContract,
              details: getLineDetails(editContract),
              totalContractValue: gross,
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User'
          };
          
          console.log('[ContractList] Calling updateContract with:', updatedContract);
          updateContract(updatedContract);

          // Save address to the client record if it was changed
          if (editClientAddress) {
            const currentClient = clients.find(c => c.id === editContract.clientId);
            if (currentClient) {
              const addressChanged =
                editClientAddress.streetAddress !== (currentClient.streetAddress || '') ||
                editClientAddress.city !== (currentClient.city || '');
              if (addressChanged) {
                await updateClient({ ...currentClient, ...editClientAddress, country: 'Zimbabwe' });
              }
            }
          }
          setEditClientAddress(null);

          // Force a complete refresh by getting the latest data
          const latestContracts = getContracts();
          console.log('[ContractList] Post-update contract count:', latestContracts.length);
          setContracts(latestContracts);
          setEditContract(null);
          setSelectedContract(updatedContract);
          
          console.log('[ContractList] Contract updated successfully:', updatedContract.id);
      } catch (error) {
          console.error('[ContractList] CRITICAL ERROR in handleEditSave:', error);
          alert('Failed to save contract changes. Please try again.');
      } finally {
          setSaving(false);
          console.log('[ContractList] handleEditSave finished, saving=false');
      }
  };

  const handleRenew = async () => {
      console.log('[ContractList] handleRenew called', { renewContractId: renewContract?.id, saving });
      if (!renewContract || saving) {
          console.warn('[ContractList] handleRenew aborted — no renewContract or already saving');
          return;
      }
      
      setSaving(true);
      try {
          const newStart = new Date(renewContract.endDate);
          newStart.setDate(newStart.getDate() + 1);
          
          const newEnd = new Date(newStart);
          newEnd.setFullYear(newEnd.getFullYear() + 1);
          
          // Check availability for renewed dates
          const available = checkAvailabilityForEdit(renewContract, newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0]);
          console.log('[ContractList] Renew availability check:', available.ok, available.reason, { start: newStart.toISOString().split('T')[0], end: newEnd.toISOString().split('T')[0] });
          if (!available.ok) {
              setEditError('Cannot renew: The next 12-month period overlaps with an existing contract. Please check availability.');
              setSaving(false);
              return;
          }
          
          const months = 12;
          const gross = (renewContract.monthlyRate * months) + renewContract.installationCost + renewContract.printingCost + (renewContract.productionCost || 0);

          const renewedContract: Contract = {
              ...renewContract,
              id: `C-${Date.now().toString().slice(-4)}`,
              startDate: newStart.toISOString().split('T')[0],
              endDate: newEnd.toISOString().split('T')[0],
              status: 'Active',
              totalContractValue: gross,
              createdAt: new Date().toISOString(),
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User'
          };
          
          console.log('[ContractList] Calling addContract for renewal:', renewedContract);
          addContract(renewedContract);
          
          const latestContracts = getContracts();
          setContracts(latestContracts);
          setRenewContract(null);
          setSelectedContract(renewedContract);
          
          console.log('[ContractList] Contract renewed successfully:', renewedContract.id);
      } catch (error) {
          console.error('[ContractList] CRITICAL ERROR in handleRenew:', error);
          alert('Failed to renew contract. Please try again.');
      } finally {
          setSaving(false);
          console.log('[ContractList] handleRenew finished, saving=false');
      }
  };

  const handleCreateSave = async () => {
      if (!newContract || saving) return;
      if (!newContract.clientId) { setEditError('Please select a client.'); return; }
      if (!newContract.startDate || !newContract.endDate) { setEditError('Start date and end date are required.'); return; }
      if (new Date(newContract.endDate) < new Date(newContract.startDate)) { setEditError('End date cannot be before start date.'); return; }
      const available = checkAvailabilityForEdit(newContract, newContract.startDate, newContract.endDate);
      if (!available.ok) { setEditError(available.reason || 'Billboard not available for selected dates.'); return; }
      setSaving(true);
      try {
          const months = calculateContractMonths(newContract.startDate, newContract.endDate);
          const gross = (newContract.monthlyRate * months) + newContract.installationCost + newContract.printingCost + (newContract.productionCost || 0);
          const contract: Contract = {
              ...newContract,
              id: `C-${Date.now().toString().slice(-6)}`,
              totalContractValue: gross,
              createdAt: new Date().toISOString(),
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User',
          };
          await addContract(contract);
          setContracts(getContracts());
          setNewContract(null);
      } catch (error) {
          console.error('[ContractList] handleCreateSave error:', error);
          setEditError('Failed to create contract. Please try again.');
      } finally {
          setSaving(false);
      }
  };

  const openTermAdjustment = (contract: Contract) => {
      setSelectedContract(null);
      setEditContract(null);
      setAmendContract(contract);
  };
  
  const getBillingDayDisplay = (contract: Contract) => {
      const client = getClient(contract.clientId);
      if (client && client.billingDay) {
          const suffix = (d: number) => {
            const j = d % 10, k = d % 100;
            if (j === 1 && k !== 11) return "st";
            if (j === 2 && k !== 12) return "nd";
            if (j === 3 && k !== 13) return "rd";
            return "th";
          };
          return `${client.billingDay}${suffix(client.billingDay)} (Client Fixed)`;
      }

      if (!contract.startDate) return '';
      const parts = contract.startDate.split('-');
      if (parts.length !== 3) return '';
      const day = parseInt(parts[2], 10);
      const j = day % 10, k = day % 100;
      let suffix = "th";
      if (j === 1 && k !== 11) suffix = "st"; else if (j === 2 && k !== 12) suffix = "nd"; else if (j === 3 && k !== 13) suffix = "rd";
      return `${day}${suffix}`;
  };

  const isContractExpired = (contract: Contract) => {
      return contract.status === 'Expired';
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Contracts</h2>
            <p className="text-slate-900 font-medium">Active agreements, billing cycles, and rental history</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contracts..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900 placeholder:text-slate-900"
              />
            </div>
            <button onClick={() => { setNewContract(makeBlankContract()); setEditError(null); }} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 shrink-0">
              <PlusIcon size={18} /> <span className="hidden sm:inline">New Contract</span>
            </button>
          </div>
        </div>

        {/* Type tabs */}
        <div className="flex items-center gap-2">
          {([
            { key: 'All',     label: 'All Contracts', count: contracts.length },
            { key: 'Static',  label: 'Static',        count: staticCount },
            { key: 'Digital', label: 'Digital / LED',  count: digitalCount },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                typeFilter === tab.key
                  ? tab.key === 'Digital'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : tab.key === 'Static'
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                typeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          {filteredContracts.map(contract => (
            <div key={contract.id} className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group">
              <div className="flex items-start gap-4 w-full md:w-auto">
                <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600 shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{getClientName(contract.clientId)}</h3>
                    {(() => {
                      const bType = getContractBillboardType(contract);
                      return bType === BillboardType.LED
                        ? <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200">Digital LED</span>
                        : <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">Static</span>;
                    })()}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-900 mt-1">
                    <span className="font-medium text-slate-700 truncate">{getBillboardName(contract.billboardId)}</span>
                    <span className="hidden sm:inline text-slate-300">•</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-xs w-fit ${contract.side === 'A' || contract.side === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{contract.details}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-900 uppercase tracking-wide font-medium flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span>
                    <span className="text-slate-300 hidden sm:inline">• {calculateContractMonthsSafe(contract.startDate, contract.endDate)} mo</span>
                    <span className="hidden sm:inline">ID: {contract.id}</span>
                    {contract.lastModifiedDate && <span className="text-slate-300 hidden sm:inline">• Edited {new Date(contract.lastModifiedDate).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:items-end gap-2 w-full md:w-auto md:pl-4">
                <div className="flex flex-col md:items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-slate-900 font-medium hidden sm:inline">Total Value:</span>
                    <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">${contract.totalContractValue.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-slate-900 uppercase tracking-wide">
                    {contract.monthlyRate > 0 && <span>${contract.monthlyRate}/mo</span>}{contract.installationCost > 0 && <span className="flex items-center gap-1 text-slate-900">+ Install</span>}{contract.printingCost > 0 && <span className="flex items-center gap-1 text-slate-900">+ Print</span>}{contract.hasVat && <span className="text-slate-900">incl. VAT</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 flex-wrap">
                <button onClick={() => setSelectedContract(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-900 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1">
                  <Eye size={14} /> <span className="sm:hidden">View</span><span className="hidden sm:inline">View</span>
                </button>
                <button onClick={() => { console.log('Edit clicked for contract:', contract.id); setEditContract({...contract}); setEditError(null); const c = clients.find(cl => cl.id === contract.clientId); setEditClientAddress({ streetAddress: c?.streetAddress || '', city: c?.city || '' }); }} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-900 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1">
                  <Edit size={14} /> <span className="sm:hidden">Edit</span><span className="hidden sm:inline">Edit</span>
                </button>
                <button onClick={() => openTermAdjustment(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors flex items-center gap-1">
                  <Calendar size={14} /> <span className="hidden sm:inline">Adjust Term</span><span className="sm:hidden">Term</span>
                </button>
                {!isContractExpired(contract) && (
                  <button onClick={() => { if (window.confirm(`End contract ${contract.id}? This will mark it as Expired, free billboard availability, and stop all future billing.`)) { endContract(contract.id); } }} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1">
                    <XCircle size={14} /> <span className="hidden sm:inline">End Contract</span><span className="sm:hidden">End</span>
                  </button>
                )}
                {isContractExpired(contract) && <button onClick={() => { setRenewContract({...contract}); setEditError(null); }} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors flex items-center gap-1">
                  <RotateCcw size={14} /> <span className="sm:hidden">Renew</span><span className="hidden sm:inline">Renew</span>
                </button>}
                {isContractExpired(contract) && (
                  <button onClick={() => setContractToPermanentDelete(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1">
                    <Trash2 size={14} /> <span className="sm:hidden">Delete</span><span className="hidden sm:inline">Delete Contract</span>
                  </button>
                )}
                <button onClick={() => handleDownload(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1 shadow-lg hover:shadow-slate-500/30">
                  <Download size={14} /> <span className="sm:hidden">PDF</span><span className="hidden sm:inline">PDF</span>
                </button>
                <button onClick={() => handleSendEmail(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-xl transition-colors flex items-center gap-1">
                  <Send size={14} /> <span className="hidden sm:inline">Email</span>
                </button>
              </div>
            </div>
          ))}
          {filteredContracts.length === 0 && (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="text-slate-300" size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No {typeFilter !== 'All' ? typeFilter + ' ' : ''}contracts found</h3>
              <p className="text-slate-900 text-sm">{searchQuery ? 'Try adjusting your search.' : typeFilter !== 'All' ? `No ${typeFilter} billboard contracts yet.` : 'No contracts yet.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* View Modal */}
      {selectedContract && !editContract && !renewContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget) setSelectedContract(null); }}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Contract Details</h3>
                <p className="text-xs text-slate-900 mt-0.5">ID: {selectedContract.id} &bull; Status: <span className={`font-bold ${selectedContract.status === 'Active' ? 'text-emerald-600' : selectedContract.status === 'Expired' ? 'text-red-500' : 'text-amber-600'}`}>{selectedContract.status}</span></p>
              </div>
              <button onClick={() => setSelectedContract(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
            </div>
            <div className="p-8 space-y-6">
              {/* Context summary */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Client</p>
                    <p className="text-lg font-bold">{getClientName(selectedContract.clientId)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Billing Day</p>
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white">
                      <Clock size={13} className="text-emerald-400"/> {getBillingDayDisplay(selectedContract)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                  <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Billboard</p>
                    <p className="font-semibold text-sm">{getBillboardName(selectedContract.billboardId)}</p>
                    <p className="text-xs text-slate-900 mt-0.5">{selectedContract.details}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Duration</p>
                    <p className="font-semibold text-sm">{selectedContract.startDate}</p>
                    <p className="text-xs text-slate-900 mt-0.5">to {selectedContract.endDate}</p>
                  </div>
                </div>
              </div>

              {/* Financial breakdown */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Financial Breakdown</p>
                <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                  <div className="flex justify-between items-center px-4 py-3 text-sm">
                    <span className="text-slate-900">Monthly Rate</span>
                    <span className="font-semibold text-slate-800">${selectedContract.monthlyRate.toLocaleString()}</span>
                  </div>
                  {selectedContract.installationCost > 0 && (
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-slate-900">Installation Fee</span>
                      <span className="font-semibold text-slate-800">${selectedContract.installationCost.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedContract.printingCost > 0 && (
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-slate-900">Printing Cost</span>
                      <span className="font-semibold text-slate-800">${selectedContract.printingCost.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedContract.hasVat && (() => {
                    const { subtotal: net, vat } = splitInclusiveVat(selectedContract.monthlyRate, vatRate);
                    return (
                      <>
                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-slate-900">Net / month (excl. VAT)</span>
                          <span className="font-semibold text-slate-800">${net.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-slate-900">VAT / month ({vatPct})</span>
                          <span className="font-semibold text-slate-800">${vat.toFixed(2)}</span>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between items-center px-4 py-3 bg-white rounded-b-2xl">
                    <span className="text-sm font-bold text-slate-900">Total Contract Value</span>
                    <span className="text-lg font-extrabold text-slate-900">${selectedContract.totalContractValue.toLocaleString()}</span>
                  </div>
                </div>
                {selectedContract.hasVat && <p className="text-xs text-slate-900 mt-1.5">Monthly rate is VAT-inclusive — {vatPct} extracted for invoicing.</p>}
              </div>

              {selectedContract.lastModifiedDate && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <p className="text-xs text-amber-600 font-medium"><Edit size={12} className="inline mr-1"/> Last edited on {new Date(selectedContract.lastModifiedDate).toLocaleDateString()} by {selectedContract.lastModifiedBy || 'Unknown'}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedContract(null)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Close</button>
                <button onClick={() => openTermAdjustment(selectedContract)} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"><Calendar size={14} /> Adjust Term</button>
                {isContractExpired(selectedContract) && (
                  <button onClick={() => { setSelectedContract(null); setRenewContract({...selectedContract}); setEditError(null); }} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2"><RotateCcw size={14} /> Renew</button>
                )}
                {isContractExpired(selectedContract) && (
                  <button onClick={() => { setSelectedContract(null); setContractToPermanentDelete(selectedContract); }} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditContract(null); }}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
               <div>
                 <h3 className="text-xl font-bold text-slate-900">Edit Contract</h3>
                 <p className="text-xs text-slate-900 mt-0.5">{getClientName(editContract.clientId)} &bull; {getBillboardName(editContract.billboardId)}</p>
               </div>
              <button onClick={() => { if (!saving) setEditContract(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"><X size={20} className="text-slate-900" /></button>
            </div>
            <div className="p-8 space-y-6">
              {/* Context card */}
               <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 grid grid-cols-2 gap-4">
                 <div>
                   <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Billboard</p>
                   <p className="font-semibold text-slate-800 text-sm">{getBillboardName(editContract.billboardId)}</p>
                   <p className="text-xs text-slate-900">{editContract.details}</p>
                 </div>
                 <div>
                   <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Contract ID</p>
                   <p className="font-semibold text-slate-800 text-sm font-mono">{editContract.id}</p>
                 </div>
               </div>

              {/* Advertiser Address */}
              {editClientAddress !== null && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Advertiser Address <span className="text-slate-400 font-normal normal-case tracking-normal">(appears on contract PDF)</span></p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Street Address</label>
                      <input
                        type="text"
                        value={editClientAddress.streetAddress}
                        onChange={(e) => setEditClientAddress({ ...editClientAddress, streetAddress: e.target.value })}
                        placeholder="e.g. 54 Borrowdale Road"
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-900 mb-2">City</label>
                      <input
                        type="text"
                        value={editClientAddress.city}
                        onChange={(e) => setEditClientAddress({ ...editClientAddress, city: e.target.value })}
                        placeholder="e.g. Harare"
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs text-slate-400">Country:</span>
                    <span className="text-xs font-medium text-slate-500">Zimbabwe · locked</span>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-2"><Edit size={14} /> Edit dates, rates, fees, billboard assignment, and side/slot before saving.</p>
              </div>

              {editError && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Billboard Assignment</p>
                <select
                  value={editContract.billboardId}
                  onChange={(e) => setEditContract(withBillboardDefaults(editContract, e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                >
                  {getBillboards().map(b => <option key={b.id} value={b.id}>{b.name} - {b.location}</option>)}
                </select>
                {(() => {
                  const billboard = getBillboard(editContract.billboardId);
                  if (!billboard) return null;
                  if (billboard.type === BillboardType.Static) {
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        {(['A', 'B', 'Both'] as const).map(side => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => {
                              const next = { ...editContract, side, slotNumber: undefined, monthlyRate: getDefaultRate(editContract.billboardId, side) };
                              setEditContract({ ...next, details: getLineDetails(next) });
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${editContract.side === side ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'}`}
                          >
                            {side === 'Both' ? 'Both A&B' : `Side ${side}`}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div>
                       <label className="block text-xs font-bold uppercase text-slate-900 mb-2">LED Slot</label>
                      <select
                        value={editContract.slotNumber || 1}
                        onChange={(e) => {
                          const next = { ...editContract, slotNumber: Number(e.target.value), side: undefined };
                          setEditContract({ ...next, details: getLineDetails(next) });
                        }}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                      >
                        {Array.from({ length: billboard.totalSlots || 10 }, (_, i) => <option key={i + 1} value={i + 1}>Slot {i + 1}</option>)}
                      </select>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Contract Status</p>
                <select value={editContract.status} onChange={(e) => setEditContract({...editContract, status: e.target.value as 'Active' | 'Pending' | 'Expired'})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800">
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Rental Period</p>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Start Date</label>
                     <input type="date" value={editContract.startDate} onChange={(e) => setEditContract({...editContract, startDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800" />
                   </div>
                   <div>
                     <label className="block text-xs font-bold uppercase text-slate-900 mb-2">End Date</label>
                     <input type="date" value={editContract.endDate} onChange={(e) => setEditContract({...editContract, endDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800" />
                   </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button type="button" onClick={() => setEditContract({...editContract, endDate: new Date().toISOString().split('T')[0]})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">End Today</button>
                  <button type="button" onClick={() => setEditContract({...editContract, endDate: addMonths(editContract.endDate, 1)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+1 Month</button>
                  <button type="button" onClick={() => setEditContract({...editContract, endDate: addMonths(editContract.endDate, 3)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+3 Months</button>
                  <button type="button" onClick={() => setEditContract({...editContract, endDate: addMonths(editContract.endDate, 12)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+12 Months</button>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                  <span className="text-slate-900 font-medium">Updated term length</span>
                  <span className="text-slate-900 font-bold">{calculateContractMonthsSafe(editContract.startDate, editContract.endDate)} month(s)</span>
                </div>
              </div>

               <div className="space-y-4">
                 <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Monthly Rate ($)</label>
                    <input type="number" value={editContract.monthlyRate} onChange={(e) => setEditContract({...editContract, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                    {editContract.hasVat && editContract.monthlyRate > 0 && (
                      <p className="text-[10px] text-slate-900 mt-1">Net: ${splitInclusiveVat(editContract.monthlyRate, vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(editContract.monthlyRate, vatRate).vat.toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Installation Cost ($)</label>
                    <input type="number" value={editContract.installationCost} onChange={(e) => setEditContract({...editContract, installationCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Printing Cost ($)</label>
                    <input type="number" value={editContract.printingCost} onChange={(e) => setEditContract({...editContract, printingCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Production Fee ($)</label>
                    <input type="number" value={editContract.productionCost || 0} onChange={(e) => setEditContract({...editContract, productionCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editContract.hasVat} onChange={(e) => setEditContract({...editContract, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <span className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { if (!saving) setEditContract(null); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">Cancel</button>
                <button onClick={handleEditSave} disabled={saving} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Contract Modal */}
      {newContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) setNewContract(null); }}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">New Contract</h3>
                <p className="text-xs text-slate-500 mt-0.5">Fill in the details below to create a new contract</p>
              </div>
              <button onClick={() => { if (!saving) setNewContract(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"><X size={20} className="text-slate-900" /></button>
            </div>
            <div className="p-8 space-y-6">

              {editError && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              {/* Client */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Client</p>
                <select
                  value={newContract.clientId}
                  onChange={(e) => setNewContract({ ...newContract, clientId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                >
                  {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
              </div>

              {/* Billboard Assignment */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Billboard Assignment</p>
                <select
                  value={newContract.billboardId}
                  onChange={(e) => setNewContract(withBillboardDefaults(newContract, e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                >
                  {getBillboards().map(b => <option key={b.id} value={b.id}>{b.name} - {b.location}</option>)}
                </select>
                {(() => {
                  const billboard = getBillboard(newContract.billboardId);
                  if (!billboard) return null;
                  if (billboard.type === BillboardType.Static) {
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        {(['A', 'B', 'Both'] as const).map(side => (
                          <button
                            key={side}
                            type="button"
                            onClick={() => {
                              const next = { ...newContract, side, slotNumber: undefined, monthlyRate: getDefaultRate(newContract.billboardId, side) };
                              setNewContract({ ...next, details: getLineDetails(next) });
                            }}
                            className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${newContract.side === side ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'}`}
                          >
                            {side === 'Both' ? 'Both A&B' : `Side ${side}`}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-900 mb-2">LED Slot</label>
                      <select
                        value={newContract.slotNumber || 1}
                        onChange={(e) => {
                          const next = { ...newContract, slotNumber: Number(e.target.value), side: undefined };
                          setNewContract({ ...next, details: getLineDetails(next) });
                        }}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                      >
                        {Array.from({ length: billboard.totalSlots || 10 }, (_, i) => <option key={i + 1} value={i + 1}>Slot {i + 1}</option>)}
                      </select>
                    </div>
                  );
                })()}
              </div>

              {/* Contract Status */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Contract Status</p>
                <select value={newContract.status} onChange={(e) => setNewContract({ ...newContract, status: e.target.value as 'Active' | 'Pending' | 'Expired' })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800">
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              {/* Rental Period */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Rental Period</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Start Date</label>
                    <input type="date" value={newContract.startDate} onChange={(e) => setNewContract({ ...newContract, startDate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">End Date</label>
                    <input type="date" value={newContract.endDate} onChange={(e) => setNewContract({ ...newContract, endDate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button type="button" onClick={() => setNewContract({ ...newContract, endDate: addMonths(newContract.endDate, 1) })} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+1 Month</button>
                  <button type="button" onClick={() => setNewContract({ ...newContract, endDate: addMonths(newContract.endDate, 3) })} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+3 Months</button>
                  <button type="button" onClick={() => setNewContract({ ...newContract, endDate: addMonths(newContract.endDate, 6) })} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+6 Months</button>
                  <button type="button" onClick={() => setNewContract({ ...newContract, endDate: addMonths(newContract.endDate, 12) })} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+12 Months</button>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium">Term length</span>
                  <span className="text-slate-900 font-bold">{calculateContractMonthsSafe(newContract.startDate, newContract.endDate)} month(s)</span>
                </div>
              </div>

              {/* Financials */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Monthly Rate ($)</label>
                    <input type="number" value={newContract.monthlyRate} onChange={(e) => setNewContract({ ...newContract, monthlyRate: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                    {newContract.hasVat && newContract.monthlyRate > 0 && (
                      <p className="text-[10px] text-slate-500 mt-1">Net: ${splitInclusiveVat(newContract.monthlyRate, vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(newContract.monthlyRate, vatRate).vat.toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Installation Cost ($)</label>
                    <input type="number" value={newContract.installationCost} onChange={(e) => setNewContract({ ...newContract, installationCost: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Printing Cost ($)</label>
                    <input type="number" value={newContract.printingCost} onChange={(e) => setNewContract({ ...newContract, printingCost: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Production Fee ($)</label>
                    <input type="number" value={newContract.productionCost || 0} onChange={(e) => setNewContract({ ...newContract, productionCost: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newContract.hasVat} onChange={(e) => setNewContract({ ...newContract, hasVat: e.target.checked })} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <span className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { if (!saving) setNewContract(null); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">Cancel</button>
                <button onClick={handleCreateSave} disabled={saving} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {saving ? 'Creating…' : 'Create Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) setRenewContract(null); }}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Renew Contract</h3>
                <p className="text-xs text-slate-900 mt-0.5">Creates a new 12-month agreement from the expired one</p>
              </div>
              <button onClick={() => { if (!saving) setRenewContract(null); }} disabled={saving} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"><X size={20} className="text-slate-900" /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <p className="text-xs text-emerald-700 font-medium flex items-center gap-2"><RotateCcw size={14} /> A new contract will be created starting the day after the original expires.</p>
              </div>

              {editError && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              <div className="bg-slate-900 text-white p-4 rounded-2xl">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Original Contract</p>
                <p className="font-bold text-base">{getClientName(renewContract.clientId)}</p>
                <p className="text-slate-300 text-sm mt-0.5">{getBillboardName(renewContract.billboardId)} &bull; {renewContract.details}</p>
                <p className="text-xs text-slate-900 mt-1">{renewContract.startDate} — {renewContract.endDate}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">New Rental Period</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Start Date</label>
                    <input type="date" value={(() => { const d = new Date(renewContract.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-900 mb-2">End Date</label>
                    <input type="date" value={(() => { const d = new Date(renewContract.endDate); d.setDate(d.getDate() + 1); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                  </div>
                </div>
                <p className="text-xs text-slate-900">Period is auto-calculated (12 months). Dates are locked.</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</p>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Monthly Rate ($)</label>
                  <input type="number" value={renewContract.monthlyRate} onChange={(e) => setRenewContract({...renewContract, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                  <p className="text-[10px] text-slate-900 mt-1">Adjust the rate if pricing has changed since last term.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={renewContract.hasVat} onChange={(e) => setRenewContract({...renewContract, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <span className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</span>
                </label>
              </div>

              {(() => {
                const months = 12;
                const gross = (renewContract.monthlyRate * months) + renewContract.installationCost + renewContract.printingCost;
                const { subtotal: net, vat } = renewContract.hasVat ? splitInclusiveVat(renewContract.monthlyRate, vatRate) : { subtotal: renewContract.monthlyRate, vat: 0 };
                return (
                  <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Monthly Net</span>
                      <span className="font-semibold">${net.toFixed(2)}</span>
                    </div>
                    {renewContract.hasVat && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Monthly VAT ({vatPct})</span>
                        <span className="font-semibold">${vat.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Monthly Rate (gross)</span>
                      <span className="font-semibold">${renewContract.monthlyRate.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between">
                      <span className="text-sm font-bold uppercase tracking-wider">New Total Value</span>
                      <span className="text-xl font-black">${gross.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-900">12 months × ${renewContract.monthlyRate.toLocaleString()}{renewContract.installationCost > 0 ? ` + $${renewContract.installationCost} install` : ''}</p>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { if (!saving) setRenewContract(null); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">Cancel</button>
                <button onClick={handleRenew} disabled={saving} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} {saving ? 'Renewing…' : 'Renew Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {amendContract && (
        <ContractAmendmentModal
          contract={amendContract}
          onClose={() => setAmendContract(null)}
          onApplied={() => {
            setAmendContract(null);
            setContracts([...getContracts()]);
          }}
        />
      )}
      {sendModal && (() => {
        const { contract, client } = sendModal;
        const billboard = getBillboard(contract.billboardId);
        const subject = `Your Billboard Contract — ${billboard?.name || 'Billboard'} (${contract.startDate} to ${contract.endDate})`;
        const message = `Please find below the details of your billboard rental contract with Dreambox Advertising. A PDF copy is attached.`;
        return (
          <SendDocumentModal
            isOpen={true}
            onClose={() => setSendModal(null)}
            documentType="contract"
            documentId={contract.id}
            documentLabel={`Contract ${contract.id}`}
            clientName={client.companyName}
            clientEmail={client.email}
            defaultSubject={subject}
            defaultMessage={message}
            onSent={({ to }) => { alert(`Contract sent to ${to}`); }}
          />
        );
      })()}

      {/* Permanent Delete Confirmation Modal — only shown for Expired contracts */}
      {contractToPermanentDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { if (!isDeletingPermanent) setContractToPermanentDelete(null); }} />
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-md border border-white/20">
              <div className="p-6 border-b border-red-100 bg-red-50 flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                  <AlertTriangle className="text-red-600" size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900">Permanently Delete Contract?</h3>
                  <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Contract to Delete</p>
                  <p className="font-bold text-slate-900">{getClientName(contractToPermanentDelete.clientId)}</p>
                  <p className="text-sm text-slate-900">{getBillboardName(contractToPermanentDelete.billboardId)} &bull; {contractToPermanentDelete.details}</p>
                  <p className="text-xs text-slate-900">{contractToPermanentDelete.startDate} — {contractToPermanentDelete.endDate}</p>
                  <p className="text-xs text-slate-900 font-mono">ID: {contractToPermanentDelete.id}</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700 leading-relaxed">
                    This will permanently delete this contract and all linked records including payments, invoices, revenue entries, availability blocks, notes, attachments, and history. This action cannot be undone.
                  </p>
                </div>

                {isDeletingPermanent && (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-900 py-2">
                    <Loader2 size={16} className="animate-spin" /> Deleting…
                  </div>
                )}

                {!isDeletingPermanent && (
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setContractToPermanentDelete(null)}
                      className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setIsDeletingPermanent(true);
                        const result = await permanentDeleteContract(contractToPermanentDelete.id);
                        setIsDeletingPermanent(false);
                        setContractToPermanentDelete(null);
                        if (result.success) {
                          setContracts([...getContracts()]);
                        } else {
                          alert(result.error || 'Failed to delete contract.');
                        }
                      }}
                      className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} /> Delete Permanently
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
