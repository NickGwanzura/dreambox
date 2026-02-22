import React, { useState, useEffect } from 'react';
import { contracts as initialContracts, clients, billboards, getContracts } from '../services/mockData';
import { generateContractPDF } from '../services/pdfGenerator';
import { Contract } from '../types';
import { FileText, Calendar, Download, X, Eye, Clock, Plus as PlusIcon } from 'lucide-react';

export const ContractList: React.FC = () => {
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);

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

  const handleDownload = (contract: Contract) => {
      const client = getClient(contract.clientId);
      if (client) { generateContractPDF(contract, client, getBillboardName(contract.billboardId)); }
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

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex justify-between items-center"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Contracts</h2><p className="text-slate-500 font-medium">Active agreements, billing cycles, and rental history</p></div><button className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2"><PlusIcon size={18} /> New Contract</button></div>
        <div className="grid gap-4">
          {contracts.map(contract => (
            <div key={contract.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group">
              <div className="flex items-start gap-5"><div className="p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600"><FileText className="w-6 h-6" /></div><div><h3 className="font-bold text-slate-900 text-lg">{getClientName(contract.clientId)}</h3><div className="flex items-center gap-2 text-sm text-slate-500 mt-1"><span className="font-medium text-slate-700">{getBillboardName(contract.billboardId)}</span><span className="text-slate-300">•</span><span className={`font-bold px-2 py-0.5 rounded text-xs ${contract.side === 'A' || contract.side === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{contract.details}</span></div><div className="flex items-center gap-3 mt-3 text-xs text-slate-400 uppercase tracking-wide font-medium flex-wrap"><span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span><span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 shadow-sm" title="Monthly Billing Cycle"><Clock size={12} /> Bill Day: {getBillingDayDisplay(contract)}</span><span>ID: {contract.id}</span></div></div></div>
              <div className="flex flex-col md:items-end gap-1 w-full md:w-auto pl-16 md:pl-0"><div className="flex items-center gap-2"><span className="text-sm text-slate-400 font-medium">Total Value:</span><span className="text-2xl font-bold text-slate-900 tracking-tight">${contract.totalContractValue.toLocaleString()}</span></div><div className="flex gap-2 text-[10px] text-slate-500 uppercase tracking-wide">{contract.monthlyRate > 0 && <span>${contract.monthlyRate}/mo</span>}{contract.installationCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Install</span>}{contract.printingCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Print</span>}{contract.hasVat && <span className="text-slate-400">+ VAT</span>}</div></div>
              <div className="flex gap-3 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-5 md:pt-0 mt-2 md:mt-0 pl-16 md:pl-0"><button onClick={() => setSelectedContract(contract)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"><Eye size={14} /> View</button><button onClick={() => handleDownload(contract)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 shadow-lg hover:shadow-slate-500/30"><Download size={14} /> PDF</button></div>
            </div>
          ))}
        </div>
      </div>
      {selectedContract && (<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all"><div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="text-xl font-bold text-slate-900">Contract Details</h3><button onClick={() => setSelectedContract(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button></div><div className="p-8 space-y-6"><div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center"><div><p className="text-xs font-bold uppercase text-slate-400 mb-2">Lessee</p><h4 className="text-xl font-bold text-slate-900">{getClientName(selectedContract.clientId)}</h4></div><div className="text-right"><p className="text-xs font-bold uppercase text-slate-400 mb-1">Billing Day</p><span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 shadow-sm"><Clock size={14} className="text-emerald-500"/> {getBillingDayDisplay(selectedContract)}</span></div></div><div className="grid grid-cols-2 gap-6"><div><p className="text-xs font-bold uppercase text-slate-400 mb-1">Asset</p><p className="font-medium text-slate-800">{getBillboardName(selectedContract.billboardId)}</p><p className="text-xs text-slate-500">{selectedContract.details}</p></div><div><p className="text-xs font-bold uppercase text-slate-400 mb-1">Duration</p><p className="font-medium text-slate-900">{selectedContract.startDate}</p><p className="text-xs text-slate-500">to {selectedContract.endDate}</p></div></div><div className="space-y-2 border-t border-slate-100 pt-4"><div className="flex justify-between text-sm"><span className="text-slate-500">Monthly Rate</span><span className="font-medium">${selectedContract.monthlyRate.toLocaleString()}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Installation Fee</span><span className="font-medium">${selectedContract.installationCost.toLocaleString()}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Printing Costs</span><span className="font-medium">${selectedContract.printingCost.toLocaleString()}</span></div><div className="flex justify-between text-lg font-bold pt-2 text-slate-900"><span>Total Value</span><span>${selectedContract.totalContractValue.toLocaleString()}</span></div></div><button onClick={() => handleDownload(selectedContract)} className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Download size={18} /> Download Contract PDF</button></div></div></div>)}
    </>
  );
};