import React, { useState, useEffect } from 'react';
import { contracts as initialContracts, clients, billboards, getContracts, getBillboards, updateContract, subscribe } from '../services/mockData';
import { generateContractPDF } from '../services/pdfGenerator';
import { sendDocumentEmail } from '../services/documentEmail';
import { Contract, BillboardType } from '../types';
import { splitInclusiveVat } from '../services/constants';
import { FileText, Calendar, Download, X, Eye, Clock, Plus as PlusIcon, Edit, CheckCircle, AlertTriangle, Lock, RotateCcw, Send } from 'lucide-react';

export const ContractList: React.FC = () => {
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [renewContract, setRenewContract] = useState<Contract | null>(null);
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [editError, setEditError] = useState<string | null>(null);

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
          if (freshData.length !== contracts.length) {
              setContracts(freshData);
          }
      }, 2000);
      return () => clearInterval(interval);
  }, [contracts.length]);

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown';
  const getBillboard = (id: string) => getBillboards().find(b => b.id === id);

  const handleDownload = (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (client) {
      generateContractPDF(contract, client, getBillboardName(contract.billboardId));
    }
  };

  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleSendEmail = async (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (!client) { alert('Client not found'); return; }
    if (!confirm(`Send contract to ${client.companyName} (${client.email})?`)) return;
    setSendingId(contract.id);
    const { error, to } = await sendDocumentEmail('contract', contract.id);
    setSendingId(null);
    if (error) { alert(`Failed: ${error.message}`); }
    else { alert(`Contract sent to ${to}`); }
  };

  // Check availability for edited dates
  const checkAvailabilityForEdit = (contract: Contract, newStart: string, newEnd: string): boolean => {
      const billboard = getBillboard(contract.billboardId);
      if (!billboard) return false;

      // Get all contracts for this billboard except current one
      const existingContracts = getContracts().filter(c => 
          c.billboardId === contract.billboardId && 
          c.id !== contract.id && 
          c.status === 'Active'
      );
      
      const newStartTime = new Date(newStart).getTime();
      const newEndTime = new Date(newEnd).getTime();

      // Check overlaps
      const overlappingContracts = existingContracts.filter(c => {
          const cStart = new Date(c.startDate).getTime();
          const cEnd = new Date(c.endDate).getTime();
          return (newStartTime <= cEnd && newEndTime >= cStart);
      });

      if (billboard.type === BillboardType.Static) {
          if (contract.side === 'Both') {
              return !overlappingContracts.some(c => c.side === 'A' || c.side === 'B' || c.side === 'Both');
          } else {
              return !overlappingContracts.some(c => c.side === contract.side || c.side === 'Both');
          }
      } else {
          // Digital: Available if overlap count < total slots
          return overlappingContracts.length < (billboard.totalSlots || 1);
      }
  };

  const handleEditSave = async () => {
      if (!editContract) return;
      
      // Validate dates don't cause double booking
      if (!checkAvailabilityForEdit(editContract, editContract.startDate, editContract.endDate)) {
          setEditError('Selected dates overlap with an existing contract for this asset. Please choose different dates.');
          return;
      }
      
      setEditError(null);
      
      try {
          // Recalculate total contract value
          const months = Math.max(1, Math.ceil((new Date(editContract.endDate).getTime() - new Date(editContract.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
          const gross = (editContract.monthlyRate * months) + editContract.installationCost + editContract.printingCost;

          const updatedContract: Contract = {
              ...editContract,
              totalContractValue: gross,
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User'
          };
          
          updateContract(updatedContract);
          
          // Force a complete refresh by getting the latest data
          const latestContracts = getContracts();
          setContracts(latestContracts);
          setEditContract(null);
          setSelectedContract(updatedContract);
          
          console.log('Contract updated successfully:', updatedContract.id);
      } catch (error) {
          console.error('Failed to update contract:', error);
          alert('Failed to save contract changes. Please try again.');
      }
  };

  const handleRenew = async () => {
      if (!renewContract) return;
      
      try {
          const newStart = new Date(renewContract.endDate);
          newStart.setDate(newStart.getDate() + 1);
          
          const newEnd = new Date(newStart);
          newEnd.setFullYear(newEnd.getFullYear() + 1);
          
          // Check availability for renewed dates
          if (!checkAvailabilityForEdit(renewContract, newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0])) {
              setEditError('Cannot renew: The next 12-month period overlaps with an existing contract. Please check availability.');
              return;
          }
          
          const months = 12;
          const gross = (renewContract.monthlyRate * months) + renewContract.installationCost + renewContract.printingCost;

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
          
          updateContract(renewedContract);
          
          const latestContracts = getContracts();
          setContracts(latestContracts);
          setRenewContract(null);
          setSelectedContract(renewedContract);
          
          console.log('Contract renewed successfully:', renewedContract.id);
      } catch (error) {
          console.error('Failed to renew contract:', error);
          alert('Failed to renew contract. Please try again.');
      }
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
      return new Date(contract.endDate) < new Date();
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex justify-between items-center"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Contracts</h2><p className="text-slate-500 font-medium">Active agreements, billing cycles, and rental history</p></div><button className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2"><PlusIcon size={18} /> New Contract</button></div>
        <div className="grid gap-4">
          {contracts.map(contract => (
            <div key={contract.id} className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group">
              <div className="flex items-start gap-4 w-full md:w-auto">
                <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600 shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{getClientName(contract.clientId)}</h3>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-500 mt-1">
                    <span className="font-medium text-slate-700 truncate">{getBillboardName(contract.billboardId)}</span>
                    <span className="hidden sm:inline text-slate-300">•</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-xs w-fit ${contract.side === 'A' || contract.side === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{contract.details}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide font-medium flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span>
                    <span className="hidden sm:inline">ID: {contract.id}</span>
                    {contract.lastModifiedDate && <span className="text-slate-300 hidden sm:inline">• Edited {new Date(contract.lastModifiedDate).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:items-end gap-2 w-full md:w-auto md:pl-4">
                <div className="flex flex-col md:items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-slate-400 font-medium hidden sm:inline">Total Value:</span>
                    <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">${contract.totalContractValue.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-slate-500 uppercase tracking-wide">
                    {contract.monthlyRate > 0 && <span>${contract.monthlyRate}/mo</span>}{contract.installationCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Install</span>}{contract.printingCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Print</span>}{contract.hasVat && <span className="text-slate-400">incl. VAT</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 flex-wrap">
                <button onClick={() => setSelectedContract(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1">
                  <Eye size={14} /> <span className="sm:hidden">View</span><span className="hidden sm:inline">View</span>
                </button>
                <button onClick={() => { console.log('Edit clicked for contract:', contract.id); setEditContract({...contract}); setEditError(null); }} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1">
                  <Edit size={14} /> <span className="sm:hidden">Edit</span><span className="hidden sm:inline">Edit</span>
                </button>
                {isContractExpired(contract) && <button onClick={() => { setRenewContract({...contract}); setEditError(null); }} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1">
                  <RotateCcw size={14} /> <span className="sm:hidden">Renew</span><span className="hidden sm:inline">Renew</span>
                </button>}
                <button onClick={() => handleDownload(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 shadow-lg hover:shadow-slate-500/30">
                  <Download size={14} /> <span className="sm:hidden">PDF</span><span className="hidden sm:inline">PDF</span>
                </button>
                <button onClick={() => handleSendEmail(contract)} disabled={sendingId === contract.id} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
                  <Send size={14} /> <span className="hidden sm:inline">{sendingId === contract.id ? 'Sending...' : 'Email'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View Modal */}
      {selectedContract && !editContract && !renewContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Contract Details</h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {selectedContract.id} &bull; Status: <span className={`font-bold ${selectedContract.status === 'Active' ? 'text-emerald-600' : selectedContract.status === 'Expired' ? 'text-red-500' : 'text-amber-600'}`}>{selectedContract.status}</span></p>
              </div>
              <button onClick={() => setSelectedContract(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-8 space-y-6">
              {/* Context summary */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Client</p>
                    <p className="text-lg font-bold">{getClientName(selectedContract.clientId)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billing Day</p>
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-white">
                      <Clock size={13} className="text-emerald-400"/> {getBillingDayDisplay(selectedContract)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billboard</p>
                    <p className="font-semibold text-sm">{getBillboardName(selectedContract.billboardId)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedContract.details}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Duration</p>
                    <p className="font-semibold text-sm">{selectedContract.startDate}</p>
                    <p className="text-xs text-slate-400 mt-0.5">to {selectedContract.endDate}</p>
                  </div>
                </div>
              </div>

              {/* Financial breakdown */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Financial Breakdown</p>
                <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                  <div className="flex justify-between items-center px-4 py-3 text-sm">
                    <span className="text-slate-500">Monthly Rate</span>
                    <span className="font-semibold text-slate-800">${selectedContract.monthlyRate.toLocaleString()}</span>
                  </div>
                  {selectedContract.installationCost > 0 && (
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-slate-500">Installation Fee</span>
                      <span className="font-semibold text-slate-800">${selectedContract.installationCost.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedContract.printingCost > 0 && (
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-slate-500">Printing Cost</span>
                      <span className="font-semibold text-slate-800">${selectedContract.printingCost.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedContract.hasVat && (() => {
                    const { subtotal: net, vat } = splitInclusiveVat(selectedContract.monthlyRate);
                    return (
                      <>
                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-slate-500">Net / month (excl. VAT)</span>
                          <span className="font-semibold text-slate-800">${net.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-slate-500">VAT / month (15%)</span>
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
                {selectedContract.hasVat && <p className="text-xs text-slate-400 mt-1.5">Monthly rate is VAT-inclusive — 15% extracted for invoicing.</p>}
              </div>

              {selectedContract.lastModifiedDate && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <p className="text-xs text-amber-600 font-medium"><Edit size={12} className="inline mr-1"/> Last edited on {new Date(selectedContract.lastModifiedDate).toLocaleDateString()} by {selectedContract.lastModifiedBy || 'Unknown'}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedContract(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Close</button>
                <button onClick={() => { setSelectedContract(null); setEditContract({...selectedContract}); setEditError(null); }} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><Edit size={14} /> Edit</button>
                {isContractExpired(selectedContract) && (
                  <button onClick={() => { setSelectedContract(null); setRenewContract({...selectedContract}); setEditError(null); }} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><RotateCcw size={14} /> Renew</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Edit Contract</h3>
                <p className="text-xs text-slate-400 mt-0.5">{getClientName(editContract.clientId)} &bull; {getBillboardName(editContract.billboardId)}</p>
              </div>
              <button onClick={() => setEditContract(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-8 space-y-6">
              {/* Context card */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billboard</p>
                  <p className="font-semibold text-slate-800 text-sm">{getBillboardName(editContract.billboardId)}</p>
                  <p className="text-xs text-slate-500">{editContract.details}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Contract ID</p>
                  <p className="font-semibold text-slate-800 text-sm font-mono">{editContract.id}</p>
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-2"><Lock size={14} /> Asset assignment cannot be changed. Edit dates and financials only.</p>
              </div>

              {editError && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Contract Status</p>
                <select value={editContract.status} onChange={(e) => setEditContract({...editContract, status: e.target.value as 'Active' | 'Pending' | 'Expired'})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800">
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Rental Period</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Start Date</label>
                    <input type="date" value={editContract.startDate} onChange={(e) => setEditContract({...editContract, startDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">End Date</label>
                    <input type="date" value={editContract.endDate} onChange={(e) => setEditContract({...editContract, endDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Financials</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Monthly Rate ($)</label>
                    <input type="number" value={editContract.monthlyRate} onChange={(e) => setEditContract({...editContract, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                    {editContract.hasVat && editContract.monthlyRate > 0 && (
                      <p className="text-[10px] text-slate-400 mt-1">Net: ${splitInclusiveVat(editContract.monthlyRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(editContract.monthlyRate).vat.toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Installation Cost ($)</label>
                    <input type="number" value={editContract.installationCost} onChange={(e) => setEditContract({...editContract, installationCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Printing Cost ($)</label>
                    <input type="number" value={editContract.printingCost} onChange={(e) => setEditContract({...editContract, printingCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editContract.hasVat} onChange={(e) => setEditContract({...editContract, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <span className="text-sm font-medium text-slate-600">Rate includes VAT (15%)</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditContract(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                <button onClick={handleEditSave} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><CheckCircle size={14} /> Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewContract && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Renew Contract</h3>
                <p className="text-xs text-slate-400 mt-0.5">Creates a new 12-month agreement from the expired one</p>
              </div>
              <button onClick={() => setRenewContract(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
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
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Original Contract</p>
                <p className="font-bold text-base">{getClientName(renewContract.clientId)}</p>
                <p className="text-slate-300 text-sm mt-0.5">{getBillboardName(renewContract.billboardId)} &bull; {renewContract.details}</p>
                <p className="text-xs text-slate-400 mt-1">{renewContract.startDate} — {renewContract.endDate}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">New Rental Period</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Start Date</label>
                    <input type="date" value={(() => { const d = new Date(renewContract.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-2">End Date</label>
                    <input type="date" value={(() => { const d = new Date(renewContract.endDate); d.setDate(d.getDate() + 1); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 text-sm" />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Period is auto-calculated (12 months). Dates are locked.</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Financials</p>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Monthly Rate ($)</label>
                  <input type="number" value={renewContract.monthlyRate} onChange={(e) => setRenewContract({...renewContract, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                  <p className="text-[10px] text-slate-400 mt-1">Adjust the rate if pricing has changed since last term.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={renewContract.hasVat} onChange={(e) => setRenewContract({...renewContract, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <span className="text-sm font-medium text-slate-600">Rate includes VAT (15%)</span>
                </label>
              </div>

              {(() => {
                const months = 12;
                const gross = (renewContract.monthlyRate * months) + renewContract.installationCost + renewContract.printingCost;
                const { subtotal: net, vat } = renewContract.hasVat ? splitInclusiveVat(renewContract.monthlyRate) : { subtotal: renewContract.monthlyRate, vat: 0 };
                return (
                  <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Monthly Net</span>
                      <span className="font-semibold">${net.toFixed(2)}</span>
                    </div>
                    {renewContract.hasVat && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Monthly VAT (15%)</span>
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
                    <p className="text-xs text-slate-400">12 months × ${renewContract.monthlyRate.toLocaleString()}{renewContract.installationCost > 0 ? ` + $${renewContract.installationCost} install` : ''}</p>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setRenewContract(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                <button onClick={handleRenew} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><RotateCcw size={14} /> Renew Contract</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
