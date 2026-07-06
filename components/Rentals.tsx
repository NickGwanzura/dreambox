
import React, { useState, useEffect, useRef } from 'react';
import { generateId } from '../utils/sanitizers';
import { getContracts, getBillboards, addContract, addInvoice, clients, deleteContract, updateContract, subscribe, getContractAmendmentsForContract, endContract, permanentDeleteContract, invoices } from '../services/mockData';
import { generateActiveContractsPDF, generateLegalContractPDF } from '../services/pdfGenerator';
import { generateRentalProposal } from '../services/aiService';
import { Contract, BillboardType, Invoice } from '../types';
import { splitInclusiveVat, formatVatPercent } from '../services/constants';
import { getEffectiveVatRate } from '../services/mockData';
import { addMonths, calculateContractMonths, calculateContractMonthsSafe } from '../utils/contractDate';
import { FileText, Calendar, Download, Eye, Plus, X, Wand2, RefreshCw, CheckCircle, Trash2, AlertTriangle, GanttChart, List, Lock, Edit, RotateCcw, MessageCircle, UserCircle, Loader2, Search, History, XCircle } from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { canDelete } from '../utils/settingsAccess';
import { getProductionFee } from '../utils/productionFee';
import { ContractAmendmentModal } from './ContractAmendmentModal';

const MinimalInput = ({ label, value, onChange, type = "text", required = false, disabled = false }: any) => {
  const isDate = type === 'date';
  return (
    <div className="group relative pt-4 w-full">
        <input 
        type={type} 
        required={required}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder=" "
        className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:opacity-50" 
        />
        <label className={`absolute left-0 -top-0 text-xs text-slate-900 font-medium transition-all uppercase tracking-wide 
            ${isDate ? '' : 'peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-6'} 
            peer-focus:-top-0 peer-focus:text-xs peer-focus:text-slate-800 pointer-events-none`}>
        {label}
        </label>
    </div>
  );
};

const MinimalSelect = ({ label, value, onChange, options, disabled = false }: any) => (
  <div className="group relative pt-4 w-full">
    <select 
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer disabled:opacity-50" 
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <label className="absolute left-0 -top-0 text-xs text-slate-900 font-medium uppercase tracking-wide">
      {label}
    </label>
  </div>
);

export const Rentals: React.FC = () => {
  const canUserDelete = canDelete(getCurrentUser());
  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const [rentals, setRentals] = useState<Contract[]>(getContracts());
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [selectedRental, setSelectedRental] = useState<Contract | null>(null);
  const [editRental, setEditRental] = useState<Contract | null>(null);
  const [renewRental, setRenewRental] = useState<Contract | null>(null);
  const [amendContract, setAmendContract] = useState<Contract | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [rentalToDelete, setRentalToDelete] = useState<Contract | null>(null);
  const [aiProposal, setAiProposal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editExtraLines, setEditExtraLines] = useState<Contract[]>([]);
  const [deletedEditLineIds, setDeletedEditLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletedLinesWithInvoices, setDeletedLinesWithInvoices] = useState<{ contractId: string; invoiceCount: number; totalValue: number }[]>([]);
  const [showDeleteLineConfirm, setShowDeleteLineConfirm] = useState(false);
  const [showPaidInvoiceDeleteWarning, setShowPaidInvoiceDeleteWarning] = useState(false);
  const [contractToPermanentDelete, setContractToPermanentDelete] = useState<Contract | null>(null);
  const [isDeletingPermanent, setIsDeletingPermanent] = useState(false);

  const filteredRentals = rentals.filter(contract => {
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
        if (rentalToDelete) { setRentalToDelete(null); setShowPaidInvoiceDeleteWarning(false); return; }
        if (renewRental) { setRenewRental(null); return; }
        if (editRental) { setEditRental(null); setShowDeleteLineConfirm(false); setDeletedLinesWithInvoices([]); return; }
        if (selectedRental) { setSelectedRental(null); return; }
        if (isCreateModalOpen) { setIsCreateModalOpen(false); setCreateStep(1); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contractToPermanentDelete, rentalToDelete, renewRental, editRental, selectedRental, isCreateModalOpen]);

  // Gantt State
  const [ganttDate, setGanttDate] = useState(new Date());

  const [newRental, setNewRental] = useState({
    clientId: '', billboardId: '', side: 'A' as 'A' | 'B' | 'Both', slotNumber: 1, startDate: '', endDate: '',
    monthlyRate: 0, installationCost: 0, printingCost: 0, productionCost: 0, hasVat: true, assignedTo: ''
  });

  // Real-time Subscription
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setRentals([...getContracts()]);
      });
      return () => { unsubscribe(); };
  }, []);

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getBillboard = (id: string) => getBillboards().find(b => b.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => getBillboard(id)?.name || 'Unknown';

  const selectedBillboard = getBillboard(newRental.billboardId);

  const getContractGroupId = (contract: Contract) => contract.masterContractId || contract.id;

  const getContractGroupLines = (contract: Contract) => {
      const groupId = getContractGroupId(contract);
      return getContracts().filter(c => (c.masterContractId || c.id) === groupId && c.id !== contract.id);
  };

  const getLineDetails = (line: Contract) => {
      const billboard = getBillboard(line.billboardId);
      if (!billboard) return line.details || 'Billboard rental';
      if (billboard.type === BillboardType.Static) {
          return line.side === 'Both' ? 'Sides A & B' : `Side ${line.side || 'A'}`;
      }
      return `Slot ${line.slotNumber || 1}`;
  };

  const getDefaultRate = (billboardId: string, side: Contract['side'] = 'A') => {
      const billboard = getBillboard(billboardId);
      if (!billboard) return 0;
      if (billboard.type === BillboardType.LED) return billboard.ratePerSlot || 0;
      if (side === 'B') return billboard.sideBRate || 0;
      if (side === 'Both') return (billboard.sideARate || 0) + (billboard.sideBRate || 0);
      return billboard.sideARate || 0;
  };

  const withBillboardDefaults = (line: Contract, billboardId: string): Contract => {
      const billboard = getBillboard(billboardId);
      const side: Contract['side'] = billboard?.type === BillboardType.Static ? 'A' : undefined;
      const slotNumber = billboard?.type === BillboardType.LED ? 1 : undefined;
      const next = {
          ...line,
          billboardId,
          side,
          slotNumber,
          monthlyRate: getDefaultRate(billboardId, side),
      };
      return { ...next, details: getLineDetails(next) };
  };

  const recalcContractValue = (line: Contract) => {
      const months = calculateContractMonths(line.startDate, line.endDate);
      return (Number(line.monthlyRate) || 0) * months +
          (Number(line.installationCost) || 0) +
          (Number(line.printingCost) || 0) +
          (Number(line.productionCost) || 0);
  };

  interface AvailabilityResult {
      ok: boolean;
      reason?: string;
  }

  // --- Dynamic Availability Check ---
  const checkAvailability = (billboardId: string, side: 'A' | 'B' | 'Both', start: string, end: string, excludeContractId?: string, slotNumber?: number, ignoredContractIds: string[] = []): AvailabilityResult => {
      if (!start || !end || !billboardId) return { ok: true }; // Assume available if dates not set to allow editing
      const billboard = getBillboard(billboardId);
      if (!billboard) return { ok: false, reason: 'Billboard not found' };

      // Filter contracts for this billboard that are Active
      const existingContracts = getContracts().filter(c =>
          c.billboardId === billboardId &&
          String(c.status || '').toLowerCase() === 'active' &&
          (!excludeContractId || c.id !== excludeContractId) &&
          !ignoredContractIds.includes(c.id)
      );
      
      const newStart = new Date(start).getTime();
      const newEnd = new Date(end).getTime();

      // Check Overlaps
      const overlappingContracts = existingContracts.filter(c => {
          const cStart = new Date(c.startDate).getTime();
          const cEnd = new Date(c.endDate).getTime();
          // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
          return (newStart <= cEnd && newEnd >= cStart);
      });

      let ok = false;
      let reason = '';

      if (billboard.type === BillboardType.Static) {
          if (side === 'Both') {
              const conflict = overlappingContracts.find(c => c.side === 'A' || c.side === 'B' || c.side === 'Both');
              ok = !conflict;
              if (conflict) reason = `Side conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          } else {
              const conflict = overlappingContracts.find(c => c.side === side || c.side === 'Both');
              ok = !conflict;
              if (conflict) reason = `Side conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          }
      } else {
          if (slotNumber) {
              const conflict = overlappingContracts.find(c => c.slotNumber === slotNumber);
              ok = !conflict;
              if (conflict) reason = `Slot ${slotNumber} conflict with ${conflict.id} (${conflict.details}, ${conflict.startDate}–${conflict.endDate})`;
          } else {
              ok = overlappingContracts.length < (billboard.totalSlots || 1);
              if (!ok) reason = `All ${billboard.totalSlots || 1} slots full (${overlappingContracts.length} overlaps)`;
          }
      }

      if (!ok) {
          console.warn('[Rentals] Availability FAILED:', {
              billboardId,
              billboardName: billboard.name,
              side,
              slotNumber,
              start,
              end,
              excludeContractId,
              ignoredContractIds,
              overlappingCount: overlappingContracts.length,
              reason,
              overlappingContracts: overlappingContracts.map(c => ({ id: c.id, side: c.side, slot: c.slotNumber, start: c.startDate, end: c.endDate, status: c.status }))
          });
      }

      return { ok, reason };
  };

  // Returns a map of slotNumber → { clientName, endDate, contractId } for overlapping active contracts.
  // Counts UNIQUE occupied slot numbers only — not raw contract count.
  const getSlotOccupancy = (billboardId: string, start: string, end: string): Record<number, { clientName: string; endDate: string; contractId: string }> => {
      if (!start || !end || !billboardId) return {};
      const newStart = new Date(start).getTime();
      const newEnd   = new Date(end).getTime();
      const result: Record<number, { clientName: string; endDate: string; contractId: string }> = {};
      getContracts()
          .filter(c =>
              c.billboardId === billboardId &&
              String(c.status || '').toLowerCase() === 'active' &&
              typeof c.slotNumber === 'number'
          )
          .forEach(c => {
              const cStart = new Date(c.startDate).getTime();
              const cEnd   = new Date(c.endDate).getTime();
              if (newStart <= cEnd && newEnd >= cStart) {
                  // First contract to occupy a slot wins; prevents double-counted phantom blocks
                  if (!(c.slotNumber! in result)) {
                      result[c.slotNumber!] = {
                          clientName: getClientName(c.clientId),
                          endDate: c.endDate,
                          contractId: c.id,
                      };
                  }
              }
          });
      return result;
  };

  // Find the contract blocking a specific static side for the current form dates
  const getBlockingContract = (side: 'A' | 'B' | 'Both') => {
      if (!newRental.startDate || !newRental.endDate || !newRental.billboardId) return null;
      const newStart = new Date(newRental.startDate).getTime();
      const newEnd   = new Date(newRental.endDate).getTime();
      return getContracts().find(c => {
          if (c.billboardId !== newRental.billboardId) return false;
          if (String(c.status || '').toLowerCase() !== 'active') return false;
          const cStart = new Date(c.startDate).getTime();
          const cEnd   = new Date(c.endDate).getTime();
          if (!(newStart <= cEnd && newEnd >= cStart)) return false;
          if (side === 'Both') return c.side === 'A' || c.side === 'B' || c.side === 'Both';
          return c.side === side || c.side === 'Both';
      }) ?? null;
  };

  // Pre-calculate side availability for UI state
  const sideAAvailable = checkAvailability(newRental.billboardId, 'A', newRental.startDate, newRental.endDate);
  const sideBAvailable = checkAvailability(newRental.billboardId, 'B', newRental.startDate, newRental.endDate);
  const bothAvailable = sideAAvailable.ok && sideBAvailable.ok;
  const slotOccupancy = getSlotOccupancy(newRental.billboardId, newRental.startDate, newRental.endDate);
  const takenSlotCount = Object.keys(slotOccupancy).length;
  const digitalFull = selectedBillboard?.type === BillboardType.LED && takenSlotCount >= (selectedBillboard.totalSlots || 1);

  // Auto-populate production fee when billboard changes (not on date changes)
  useEffect(() => {
    if (!selectedBillboard) return;
    setNewRental(prev => ({ ...prev, productionCost: getProductionFee(selectedBillboard) }));
  }, [newRental.billboardId]);

  // Auto-select available side and sync rates
  useEffect(() => {
    if (selectedBillboard?.type === BillboardType.Static) {
        // Auto-select available side if current selection is blocked
        if (!checkAvailability(newRental.billboardId, newRental.side, newRental.startDate, newRental.endDate).ok) {
             if (checkAvailability(newRental.billboardId, 'A', newRental.startDate, newRental.endDate).ok) {
                 setNewRental(prev => ({ ...prev, side: 'A', monthlyRate: selectedBillboard.sideARate || 0 }));
             } else if (checkAvailability(newRental.billboardId, 'B', newRental.startDate, newRental.endDate).ok) {
                 setNewRental(prev => ({ ...prev, side: 'B', monthlyRate: selectedBillboard.sideBRate || 0 }));
             }
        } else {
            // Update rate for current selection
            let rate = 0;
            if (newRental.side === 'A') rate = selectedBillboard.sideARate || 0;
            else if (newRental.side === 'B') rate = selectedBillboard.sideBRate || 0;
            else rate = (selectedBillboard.sideARate || 0) + (selectedBillboard.sideBRate || 0);
            setNewRental(prev => ({ ...prev, monthlyRate: rate }));
        }
    } else if (selectedBillboard?.type === BillboardType.LED) {
        setNewRental(prev => ({ ...prev, monthlyRate: selectedBillboard.ratePerSlot || 0 }));
    }
  }, [newRental.billboardId, newRental.startDate, newRental.endDate, newRental.side, selectedBillboard]);

  const isSubmittingRef = useRef(false);
  const handleCreateRental = async (e: React.FormEvent) => {
    e.preventDefault();
    // A double-click on submit would create the record twice
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
    if (selectedBillboard?.type === BillboardType.Static) {
        if (!checkAvailability(newRental.billboardId, newRental.side, newRental.startDate, newRental.endDate).ok) {
            alert(`Selected side option (${newRental.side}) is not available for these dates.`);
            return;
        }
    } else if (selectedBillboard?.type === BillboardType.LED) {
        if (digitalFull) {
            alert("All slots for this digital billboard are fully booked for the selected dates.");
            return;
        }
        if (!checkAvailability(newRental.billboardId, undefined, newRental.startDate, newRental.endDate, undefined, newRental.slotNumber).ok) {
            alert(`Slot ${newRental.slotNumber} is already booked for the selected dates. Please choose a different slot.`);
            return;
        }
    }

    const months = calculateContractMonths(newRental.startDate, newRental.endDate);
    const gross = (newRental.monthlyRate * months) + newRental.installationCost + newRental.printingCost + newRental.productionCost;
    const { subtotal, vat } = newRental.hasVat
      ? splitInclusiveVat(gross, vatRate)
      : { subtotal: gross, vat: 0 };
    const rentalId = `C-${Date.now().toString().slice(-4)}`;
    
    let detailText = '';
    if (selectedBillboard?.type === BillboardType.Static) {
        detailText = newRental.side === 'Both' ? "Sides A & B" : `Side ${newRental.side}`;
    } else {
        detailText = `Slot ${newRental.slotNumber}`;
    }

    const rental: Contract = {
        id: rentalId,
        clientId: newRental.clientId,
        billboardId: newRental.billboardId,
        startDate: newRental.startDate,
        endDate: newRental.endDate,
        monthlyRate: newRental.monthlyRate,
        installationCost: newRental.installationCost,
        printingCost: newRental.printingCost,
        productionCost: newRental.productionCost,
        hasVat: newRental.hasVat,
        assignedTo: newRental.assignedTo || undefined,
        totalContractValue: gross,
        status: 'Active',
        side: selectedBillboard?.type === BillboardType.Static ? newRental.side : undefined,
        slotNumber: selectedBillboard?.type === BillboardType.LED ? newRental.slotNumber : undefined,
        details: detailText,
        createdAt: new Date().toISOString()
    };

    try {
        await addContract(rental);
    } catch (err: any) {
        alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
        return;
    }

    const invoiceGross = newRental.monthlyRate + newRental.installationCost + newRental.printingCost + newRental.productionCost;
    const { subtotal: invoiceSubtotal, vat: invoiceVat } = newRental.hasVat
      ? splitInclusiveVat(invoiceGross, vatRate)
      : { subtotal: invoiceGross, vat: 0 };
    const initialInvoice: Invoice = {
        contractId: rentalId,
        clientId: newRental.clientId,
        date: new Date().toISOString().split('T')[0],
        items: [
            { description: `Rental: ${selectedBillboard?.name} (${rental.details}) - Month 1`, amount: newRental.monthlyRate },
            ...(newRental.installationCost > 0 ? [{ description: 'Installation Fee', amount: newRental.installationCost }] : []),
            ...(newRental.productionCost > 0 ? [{ description: `Production Fee (${selectedBillboard?.width}m x ${selectedBillboard?.height}m)`, amount: newRental.productionCost }] : []),
            ...(newRental.printingCost > 0 ? [{ description: 'Printing Costs', amount: newRental.printingCost }] : [])
        ],
        subtotal: invoiceSubtotal,
        vatAmount: invoiceVat,
        total: invoiceGross,
        status: 'Pending',
        type: 'Invoice'
    } as Invoice;
    try {
        await addInvoice(initialInvoice);
    } catch (err: any) {
        alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
        return;
    }
    
    setIsCreateModalOpen(false);
    setCreateStep(1);
    setNewRental({ clientId: '', billboardId: '', side: 'A', slotNumber: 1, startDate: '', endDate: '', monthlyRate: 0, installationCost: 0, printingCost: 0, productionCost: 0, hasVat: true, assignedTo: '' });
    alert("Success! Rental Active & Initial Invoice Generated.");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleEditSave = async () => {
      console.log('[Rentals] handleEditSave called', { editRentalId: editRental?.id, saving, extraLinesCount: editExtraLines.length, deletedLinesCount: deletedEditLineIds.length });
      if (!editRental || saving) {
          console.warn('[Rentals] handleEditSave aborted — no editRental or already saving');
          return;
      }
      setSaving(true);
      try {
          const allLines = [editRental, ...editExtraLines];
          console.log('[Rentals] Validating', allLines.length, 'lines');
          for (const line of allLines) {
              if (!line.billboardId) {
                  console.warn('[Rentals] Validation failed: missing billboardId on line', line.id);
                  setEditError('Every contract line must have a billboard selected.');
                  return;
              }
              if (!line.startDate || !line.endDate) {
                  console.warn('[Rentals] Validation failed: missing dates on line', line.id, { startDate: line.startDate, endDate: line.endDate });
                  setEditError('Start date and end date are required for every billboard line.');
                  return;
              }
              if (new Date(line.endDate) < new Date(line.startDate)) {
                  console.warn('[Rentals] Validation failed: endDate before startDate on line', line.id);
                  setEditError('End date cannot be before the start date on any billboard line.');
                  return;
              }
          }
          for (let i = 0; i < allLines.length; i += 1) {
              for (let j = i + 1; j < allLines.length; j += 1) {
                  const a = allLines[i];
                  const b = allLines[j];
                  if (a.billboardId !== b.billboardId) continue;
                  const overlaps = new Date(a.startDate).getTime() <= new Date(b.endDate).getTime() &&
                      new Date(a.endDate).getTime() >= new Date(b.startDate).getTime();
                  if (!overlaps) continue;
                  const billboard = getBillboard(a.billboardId);
                  const sameStaticSide = billboard?.type === BillboardType.Static &&
                      (a.side === 'Both' || b.side === 'Both' || a.side === b.side);
                  const sameDigitalSlot = billboard?.type === BillboardType.LED &&
                      (a.slotNumber || 1) === (b.slotNumber || 1);
                  if (sameStaticSide || sameDigitalSlot) {
                      console.warn('[Rentals] Validation failed: internal duplicate', { a: a.id, b: b.id, billboard: billboard?.name });
                      setEditError(`${billboard?.name || 'A billboard'} is duplicated within this contract for overlapping dates.`);
                      return;
                  }
              }
          }
          
          // Validate dates don't cause double booking
          for (const line of allLines) {
              const billboard = getBillboard(line.billboardId);
              if (!billboard) {
                  console.warn('[Rentals] Validation failed: billboard not found', line.billboardId);
                  setEditError('One selected billboard could not be found. Please reselect it.');
                  return;
              }
              const avail = checkAvailability(line.billboardId, line.side || 'A', line.startDate, line.endDate, line.id, line.slotNumber, deletedEditLineIds);
              console.log('[Rentals] Availability check for line', line.id, ':', avail.ok, avail.reason, { billboardId: line.billboardId, side: line.side, slot: line.slotNumber, start: line.startDate, end: line.endDate });
              if (!avail.ok) {
                  console.warn('[Rentals] Validation failed: external overlap on line', line.id, avail.reason);
                  setEditError(`${billboard.name} is already booked: ${avail.reason || 'Conflict detected'}.`);
                  return;
              }
          }
          
          setEditError(null);
          
          // Check if any deleted lines have associated invoices
      const linesWithInvoices = deletedEditLineIds
        .map(id => {
          const linkedInvoices = invoices.filter(i => i.contractId === id && String(i.type || '').toLowerCase() === 'invoice');
          if (linkedInvoices.length === 0) return null;
          return {
            contractId: id,
            invoiceCount: linkedInvoices.length,
            totalValue: linkedInvoices.reduce((sum, i) => sum + i.total, 0),
          };
        })
        .filter((item): item is { contractId: string; invoiceCount: number; totalValue: number } => item !== null);

      if (linesWithInvoices.length > 0 && !showDeleteLineConfirm) {
        setDeletedLinesWithInvoices(linesWithInvoices);
        setShowDeleteLineConfirm(true);
        // Keep saving=true so the user cannot trigger a second save while confirming
        return;
      }

      const updatedContract: Contract = {
              ...editRental,
              details: getLineDetails(editRental),
              totalContractValue: recalcContractValue(editRental),
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User'
          };
          
          console.log('[Rentals] Calling updateContract for primary:', updatedContract);
          try {
              await updateContract(updatedContract);
          } catch (err: any) {
              alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
              return;
          }
          for (const [idx, line] of editExtraLines.entries()) {
              const normalized: Contract = {
                  ...line,
                  clientId: updatedContract.clientId,
                  masterContractId: updatedContract.masterContractId || updatedContract.id,
                  details: getLineDetails(line),
                  totalContractValue: recalcContractValue(line),
                  lastModifiedDate: new Date().toISOString(),
                  lastModifiedBy: 'Current User',
              };
              const exists = getContracts().some(c => c.id === normalized.id);
              console.log('[Rentals] Processing extra line', idx, { id: normalized.id, exists });
              try {
                  if (exists) await updateContract(normalized);
                  else await addContract(normalized);
              } catch (err: any) {
                  alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                  return;
              }
          }
          console.log('[Rentals] Deleting lines:', deletedEditLineIds);
          for (const id of deletedEditLineIds) {
              try {
                  await deleteContract(id);
              } catch (err: any) {
                  alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
              }
          }
          setRentals([...getContracts()]);
          setEditRental(null);
          setEditExtraLines([]);
          setDeletedEditLineIds([]);
          setSelectedRental(updatedContract);
          
          console.log('[Rentals] Contract updated successfully:', updatedContract.id);
      } catch (error) {
          console.error('[Rentals] CRITICAL ERROR in handleEditSave:', error);
          alert('Failed to save contract changes. Please try again.');
      } finally {
          setSaving(false);
          console.log('[Rentals] handleEditSave finished, saving=false');
      }
  };

  const handleRenew = async () => {
      console.log('[Rentals] handleRenew called', { renewRentalId: renewRental?.id, saving });
      if (!renewRental || saving) {
          console.warn('[Rentals] handleRenew aborted — no renewRental or already saving');
          return;
      }
      setSaving(true);
      try {
          const newStart = new Date(renewRental.endDate);
          newStart.setDate(newStart.getDate() + 1);
          
          const newEnd = new Date(newStart);
          newEnd.setFullYear(newEnd.getFullYear() + 1);
          
          // Check availability for renewed dates
          const avail = checkAvailability(renewRental.billboardId, renewRental.side || 'A', newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0]);
          console.log('[Rentals] Renew availability check:', avail.ok, avail.reason, { start: newStart.toISOString().split('T')[0], end: newEnd.toISOString().split('T')[0] });
          if (!avail.ok) {
              setEditError('Cannot renew: The next 12-month period overlaps with an existing contract. Please check availability.');
              return;
          }
          
          const months = 12;
          const gross = (renewRental.monthlyRate * months) + renewRental.installationCost + renewRental.printingCost + (renewRental.productionCost || 0);

          const renewedContract: Contract = {
              ...renewRental,
              id: `C-${generateId()}`,
              startDate: newStart.toISOString().split('T')[0],
              endDate: newEnd.toISOString().split('T')[0],
              status: 'Active',
              totalContractValue: gross,
              createdAt: new Date().toISOString(),
              lastModifiedDate: new Date().toISOString(),
              lastModifiedBy: 'Current User'
          };
          
          console.log('[Rentals] Calling addContract for renewal:', renewedContract);
          try {
              await addContract(renewedContract);
          } catch (err: any) {
              alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
              return;
          }
          setRentals([...getContracts()]);
          setRenewRental(null);
          setSelectedRental(renewedContract);
          
          console.log('[Rentals] Contract renewed successfully:', renewedContract.id);
      } catch (error) {
          console.error('[Rentals] CRITICAL ERROR in handleRenew:', error);
          alert('Failed to renew contract. Please try again.');
      } finally {
          setSaving(false);
          console.log('[Rentals] handleRenew finished, saving=false');
      }
  };

  const handleGenerateProposal = async () => {
    if (!newRental.clientId || !newRental.billboardId) { alert("Please select a Client and Billboard first."); return; }
    setIsGenerating(true);
    const client = getClient(newRental.clientId)!;
    const billboard = getBillboard(newRental.billboardId)!;
    const proposal = await generateRentalProposal(client, billboard, newRental.monthlyRate);
    setAiProposal(proposal);
    setIsGenerating(false);
  };

  const confirmDelete = async () => {
      if (rentalToDelete) {
          const paidInvoicesForContract = invoices.filter(i =>
            i.contractId === rentalToDelete.id &&
            String(i.type || '').toLowerCase() === 'invoice' &&
            i.status === 'Paid'
          );
          if (paidInvoicesForContract.length > 0 && !showPaidInvoiceDeleteWarning) {
            setShowPaidInvoiceDeleteWarning(true);
            return;
          }
          try {
              await deleteContract(rentalToDelete.id);
              setRentalToDelete(null);
              setShowPaidInvoiceDeleteWarning(false);
          } catch (err: any) {
              alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
          }
      }
  };

  const isContractExpired = (contract: Contract) => {
      return contract.status === 'Expired';
  };

  const openTermAdjustment = (contract: Contract) => {
      // Keep detail modal open underneath — amendment overlays on top
      setAmendContract({ ...contract });
  };

  // --- Gantt Chart Helpers ---
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  
  const renderGanttChart = () => {
      const year = ganttDate.getFullYear();
      const month = ganttDate.getMonth();
      const daysInMonth = getDaysInMonth(year, month);
      const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
      const monthName = ganttDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      const billboards = getBillboards();

      return (
          <>
            {/* Mobile Gantt Notice */}
            <div className="lg:hidden bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={18} />
                <span className="text-sm font-bold">Calendar View requires larger screen</span>
              </div>
              <p className="text-xs text-amber-600 mt-1">Please switch to List View or view on a tablet/desktop for the calendar visualization.</p>
              <button 
                onClick={() => setViewMode('list')} 
                className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors"
              >
                Switch to List View
              </button>
            </div>

            {/* Desktop Gantt Chart */}
            <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setGanttDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-slate-200 rounded text-xs font-bold">PREV</button>
                      <h3 className="font-bold text-slate-800 w-32 text-center">{monthName}</h3>
                      <button onClick={() => setGanttDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-slate-200 rounded text-xs font-bold">NEXT</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-500 rounded"></div> Active</span>
                      <span className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-300 rounded"></div> Maintenance</span>
                  </div>
              </div>
              
              <div className="overflow-x-auto relative">
                  <div className="min-w-[1000px]">
                      {/* Header Row */}
                      <div className="flex border-b border-slate-100">
                          <div className="w-48 p-3 text-xs font-bold text-slate-900 bg-slate-50 sticky left-0 z-10 border-r border-slate-100">Billboard Asset</div>
                          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}>
                              {days.map(d => (
                                  <div key={d} className="text-[10px] text-center text-slate-900 border-r border-slate-50 py-2">{d}</div>
                              ))}
                          </div>
                      </div>

                      {/* Body Rows */}
                      {billboards.map(b => {
                          const activeContracts = filteredRentals.filter(r =>
                              r.billboardId === b.id && String(r.status || '').toLowerCase() === 'active' &&
                              (new Date(r.startDate) <= new Date(year, month, daysInMonth) && new Date(r.endDate) >= new Date(year, month, 1))
                          );

                          return (
                              <div key={b.id} className="flex border-b border-slate-100 h-14 relative group hover:bg-slate-50">
                                  <div className="w-48 p-3 text-xs font-bold text-slate-700 bg-white sticky left-0 z-10 border-r border-slate-100 flex flex-col justify-center group-hover:bg-slate-50">
                                      <span className="truncate">{b.name}</span>
                                      <span className="text-[10px] text-slate-900 font-normal">{b.location}</span>
                                  </div>
                                  <div className="flex-1 relative bg-white/50 group-hover:bg-transparent">
                                      {/* Grid Lines */}
                                      <div className="absolute inset-0 grid h-full w-full pointer-events-none" style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}>
                                          {days.map(d => <div key={d} className="border-r border-slate-50 h-full"></div>)}
                                      </div>

                                      {/* Contract Bars */}
                                      {activeContracts.map(c => {
                                          const start = new Date(c.startDate);
                                          const end = new Date(c.endDate);
                                          
                                          // Calculate start/end day within this month
                                          let startDay = start.getMonth() === month && start.getFullYear() === year ? start.getDate() : 1;
                                          let endDay = end.getMonth() === month && end.getFullYear() === year ? end.getDate() : daysInMonth;
                                          
                                          // Handle month boundaries
                                          if (end < new Date(year, month, 1)) return null;
                                          if (start > new Date(year, month, daysInMonth)) return null;

                                          const duration = endDay - startDay + 1;
                                          const left = ((startDay - 1) / daysInMonth) * 100;
                                          const width = (duration / daysInMonth) * 100;

                                          return (
                                              <div 
                                                  key={c.id}
                                                  className="absolute top-3 h-8 rounded-xl bg-indigo-500 shadow-sm border border-indigo-400 text-white text-[10px] flex items-center px-2 overflow-hidden whitespace-nowrap z-0 hover:z-20 hover:scale-105 transition-all cursor-pointer"
                                                  style={{ left: `${left}%`, width: `${width}%` }}
                                                  title={`${getClientName(c.clientId)} (${c.startDate} - ${c.endDate})`}
                                                  onClick={() => setSelectedRental(c)}
                                              >
                                                  {getClientName(c.clientId)}
                                              </div>
                                          )
                                      })}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
            </div>
        </>
      );
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Rentals Module</h2>
            <p className="text-slate-900 font-medium text-sm sm:text-base">Active contracts, renewals, and availability</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rentals..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900 placeholder:text-slate-900"
              />
            </div>
              <button onClick={() => generateActiveContractsPDF(rentals, getClientName, getBillboardName)} className="bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2">
                  <Download size={18}/> Report
              </button>
              <div className="flex bg-slate-100 rounded-full p-1 border border-slate-200">
                  <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-900 hover:text-slate-900'}`}><List size={14}/> List</button>
                  <button onClick={() => setViewMode('gantt')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'gantt' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-900 hover:text-slate-900'}`}><GanttChart size={14}/> Calendar</button>
              </div>
              <button onClick={() => { setCreateStep(1); setIsCreateModalOpen(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
                <Plus size={18} /> <span className="hidden sm:inline">New Rental</span><span className="sm:hidden">New</span>
              </button>
          </div>
        </div>

        {viewMode === 'gantt' ? renderGanttChart() : (
            <div className="grid gap-4">
            {filteredRentals.map(contract => (
                <div key={contract.id} className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 group hover:-translate-y-0.5 duration-300">
                <div className="flex items-start gap-4 w-full lg:w-auto">
                    <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600 shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{getClientName(contract.clientId)}</h3>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-900 mt-1">
                        <span className="font-medium text-slate-700 truncate">{getBillboardName(contract.billboardId)}</span>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-xs w-fit ${contract.side ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {contract.details}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-900 uppercase tracking-wide font-medium flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span>
                        <span className="text-slate-300">{calculateContractMonthsSafe(contract.startDate, contract.endDate)} mo</span>
                        <span>ID: {contract.id}</span>
                        {contract.assignedTo && <span className="flex items-center gap-1 text-indigo-400"><UserCircle size={11}/> {contract.assignedTo}</span>}
                        {contract.lastModifiedDate && <span className="text-slate-300">• Edited {new Date(contract.lastModifiedDate).toLocaleDateString()}</span>}
                        {(() => { const daysLeft = Math.ceil((new Date(contract.endDate).getTime() - Date.now()) / 86400000); return daysLeft > 0 && daysLeft <= 30 ? <span className="text-amber-500 font-bold bg-amber-50 px-1.5 py-0.5 rounded">⚠ Expires in {daysLeft}d</span> : null; })()}
                    </div>
                    </div>
                </div>

                <div className="flex flex-row lg:flex-col lg:items-end gap-2 w-full lg:w-auto pl-0 lg:pl-16 justify-between lg:justify-start items-center">
                    <div className="flex flex-col lg:items-end">
                        <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm text-slate-900 font-medium hidden sm:inline">Value:</span>
                            <span className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">${contract.totalContractValue.toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-slate-900 uppercase tracking-wide">
                            {contract.monthlyRate > 0 && <span>${contract.monthlyRate}/mo</span>}
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={() => setSelectedRental(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1">
                            <Eye size={14} /> <span className="hidden sm:inline">View</span>
                        </button>
                        <button onClick={() => { setEditRental({...contract}); setEditError(null); }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1">
                            <Edit size={14} /> <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button onClick={() => openTermAdjustment(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors flex items-center gap-1">
                            <Calendar size={14} /> <span className="hidden sm:inline">Amend</span><span className="sm:hidden">Amend</span>
                        </button>
                        {!isContractExpired(contract) && (
                            <button onClick={() => { if (window.confirm(`End contract ${contract.id}? This will mark it as Expired, free billboard availability, and stop all future billing.`)) { endContract(contract.id); } }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1">
                                <XCircle size={14} /> <span className="hidden sm:inline">End Contract</span><span className="sm:hidden">End</span>
                            </button>
                        )}
                        {isContractExpired(contract) && (
                            <button onClick={() => { setRenewRental({...contract}); setEditError(null); }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors flex items-center gap-1">
                                <RotateCcw size={14} /> <span className="hidden sm:inline">Renew</span>
                            </button>
                        )}
                        {isContractExpired(contract) && canUserDelete && (
                            <button onClick={() => setContractToPermanentDelete(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1">
                                <Trash2 size={14} /> <span className="hidden sm:inline">Delete Contract</span><span className="sm:hidden">Delete</span>
                            </button>
                        )}
                        <button onClick={() => { const client = getClient(contract.clientId); if(client) generateLegalContractPDF(contract, client, getBillboard(contract.billboardId)); }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1 shadow-lg hover:shadow-slate-500/30">
                            <Download size={14} /> <span className="hidden sm:inline">PDF</span>
                        </button>
                        {canUserDelete && !isContractExpired(contract) && (<button onClick={() => setRentalToDelete(contract)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Delete Rental">
                            <Trash2 size={16} />
                        </button>)}
                    </div>
                </div>
                </div>
            ))}
            {filteredRentals.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        {searchQuery ? <Search className="text-slate-300" size={32}/> : <FileText className="text-slate-300" size={32}/>}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{searchQuery ? 'No rentals found' : 'No Active Rentals'}</h3>
                    <p className="text-slate-900 text-sm">{searchQuery ? 'Try adjusting your search terms.' : 'Create a new rental agreement to get started.'}</p>
                </div>
            )}
            </div>
        )}
      </div>
      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { setIsCreateModalOpen(false); setCreateStep(1); }} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-4xl border border-white/20 max-h-[90vh] overflow-y-auto">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/50 sticky top-0 z-10 backdrop-blur-sm">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">New Rental Agreement</h3>
                            <p className="text-xs text-slate-900 mt-0.5">Creates a contract and generates the first month's invoice</p>
                        </div>
                        <button onClick={() => { setIsCreateModalOpen(false); setCreateStep(1); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
                    </div>
                    {/* Progress Stepper */}
                    <div className="px-8 pt-6 pb-4 bg-slate-50/60 border-b border-slate-100">
                        <div className="flex items-center justify-between max-w-md mx-auto">
                            {[
                                { n: 1, label: 'Client' },
                                { n: 2, label: 'Billboard' },
                                { n: 3, label: 'Duration' },
                            ].map((s, idx, arr) => {
                                const done = createStep > s.n;
                                const active = createStep === s.n;
                                return (
                                    <React.Fragment key={s.n}>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${done ? 'bg-emerald-500 border-emerald-500 text-white' : active ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-white border-slate-200 text-slate-900'}`}>
                                                {done ? <CheckCircle size={16}/> : s.n}
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-slate-900' : done ? 'text-emerald-600' : 'text-slate-900'}`}>{s.label}</span>
                                        </div>
                                        {idx < arr.length - 1 && (
                                            <div className={`flex-1 h-0.5 mx-2 transition-colors ${createStep > s.n ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* Wizard Body */}
                    <form onSubmit={handleCreateRental} className="p-6 sm:p-8 space-y-6">

                        {/* STEP 1 — Client */}
                        {createStep === 1 && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900">Who is the client?</h4>
                                    <p className="text-xs text-slate-900 mt-0.5">Pick the advertiser this contract is for.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                                    {clients.length === 0 && (
                                        <p className="col-span-2 text-sm text-slate-900 italic text-center py-8">No clients found. Add one first under Clients.</p>
                                    )}
                                    {clients.map(c => {
                                        const isSelected = newRental.clientId === c.id;
                                        return (
                                            <button type="button" key={c.id} onClick={() => setNewRental({ ...newRental, clientId: c.id })}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${isSelected ? 'border-slate-900 bg-slate-900/5 shadow-lg' : 'border-slate-100 hover:border-slate-300 bg-white'}`}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
                                                            {c.companyName.charAt(0)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-slate-900 truncate">{c.companyName}</p>
                                                            <p className="text-xs text-slate-900 truncate">{c.contactPerson}</p>
                                                        </div>
                                                    </div>
                                                    {isSelected && <CheckCircle size={18} className="text-slate-900 shrink-0" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* STEP 2 — Billboard */}
                        {createStep === 2 && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900">Which billboard?</h4>
                                    <p className="text-xs text-slate-900 mt-0.5">Pick the asset to rent. Side/slot availability is checked on the next step.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                                    {getBillboards().length === 0 && (
                                        <p className="col-span-2 text-sm text-slate-900 italic text-center py-8">No billboards in inventory.</p>
                                    )}
                                    {getBillboards().map(b => {
                                        const isSelected = newRental.billboardId === b.id;
                                        const rateHint = b.type === BillboardType.LED
                                            ? `$${(b.ratePerSlot || 0).toLocaleString()}/slot`
                                            : `A: $${(b.sideARate || 0).toLocaleString()} · B: $${(b.sideBRate || 0).toLocaleString()}`;
                                        return (
                                            <button type="button" key={b.id} onClick={() => setNewRental({ ...newRental, billboardId: b.id })}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${isSelected ? 'border-slate-900 bg-slate-900/5 shadow-lg' : 'border-slate-100 hover:border-slate-300 bg-white'}`}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold text-slate-900 truncate">{b.name}</p>
                                                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${b.type === BillboardType.LED ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{b.type}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-900 truncate">{b.location}, {b.town}</p>
                                                        <p className="text-[11px] text-slate-900 mt-2">{b.width}m × {b.height}m · {rateHint}</p>
                                                    </div>
                                                    {isSelected && <CheckCircle size={18} className="text-slate-900 shrink-0" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* STEP 3 — Duration & Finalize */}
                        {createStep === 3 && (
                            <div className="space-y-6 animate-fade-in">
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900">How long and what's the price?</h4>
                                    <p className="text-xs text-slate-900 mt-0.5">Set dates, side/slot, and pricing.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <MinimalInput label="Start Date" type="date" value={newRental.startDate} onChange={(e: any) => setNewRental({...newRental, startDate: e.target.value})} required />
                                    <MinimalInput label="End Date" type="date" value={newRental.endDate} onChange={(e: any) => setNewRental({...newRental, endDate: e.target.value})} required />
                                </div>

                                {selectedBillboard?.type === BillboardType.Static && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Select Side</p>
                                            {newRental.startDate && (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bothAvailable ? 'bg-emerald-100 text-emerald-700' : (!sideAAvailable.ok && !sideBAvailable.ok) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {bothAvailable ? 'Both sides free' : (!sideAAvailable.ok && !sideBAvailable.ok) ? 'Both sides taken' : 'One side free'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            {(['A', 'B', 'Both'] as const).map(side => {
                                                const available = checkAvailability(newRental.billboardId, side, newRental.startDate, newRental.endDate).ok;
                                                let price = 0;
                                                if (side === 'A') price = selectedBillboard.sideARate || 0;
                                                else if (side === 'B') price = selectedBillboard.sideBRate || 0;
                                                else price = (selectedBillboard.sideARate || 0) + (selectedBillboard.sideBRate || 0);
                                                const isSelected = newRental.side === side;
                                                const disabled = !available;
                                                const blocker = disabled && newRental.startDate ? getBlockingContract(side) : null;
                                                return (
                                                    <label key={side} className={`flex-1 relative cursor-pointer rounded-xl border p-3.5 text-center transition-all ${disabled ? 'bg-red-50 border-red-200 cursor-not-allowed' : isSelected ? 'border-slate-900 bg-slate-900 ring-1 ring-slate-900 shadow-sm' : 'border-slate-200 hover:border-slate-400 bg-white'}`}>
                                                        <input type="radio" name="side" className="hidden" disabled={disabled} checked={isSelected} onChange={() => !disabled && setNewRental({ ...newRental, side, monthlyRate: price })} />
                                                        <div className={`font-black text-sm ${disabled ? 'text-red-400' : isSelected ? 'text-white' : 'text-slate-800'}`}>{side === 'Both' ? 'Both A & B' : `Side ${side}`}</div>
                                                        <div className={`text-xs mt-0.5 font-semibold ${disabled ? 'text-red-300' : isSelected ? 'text-slate-300' : 'text-slate-500'}`}>${price.toLocaleString()}/mo</div>
                                                        {disabled ? (
                                                            <div className="mt-2 space-y-0.5">
                                                                <div className="flex items-center justify-center gap-1 text-[10px] font-black uppercase text-red-500"><Lock size={9} /> Booked</div>
                                                                {blocker && (
                                                                    <>
                                                                        <div className="text-[9px] font-bold text-slate-500 truncate">{getClientName(blocker.clientId)}</div>
                                                                        <div className="text-[9px] text-slate-400">until {blocker.endDate}</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : isSelected ? (
                                                            <div className="absolute top-2 right-2 text-white"><CheckCircle size={13} /></div>
                                                        ) : null}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {!newRental.startDate && <p className="text-[10px] text-indigo-500 mt-1">* Select dates above to check availability.</p>}
                                    </div>
                                )}

                                {selectedBillboard?.type === BillboardType.LED && (() => {
                                    const totalSlots = selectedBillboard.totalSlots || 1;
                                    const freeCount  = totalSlots - takenSlotCount;
                                    const cols = Math.min(totalSlots, 6);
                                    return (
                                        <div className="overflow-hidden rounded-xl border border-slate-200">
                                            {/* Header */}
                                            <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-100">
                                                <p className="text-xs font-black uppercase tracking-wider text-slate-700">Slot Availability</p>
                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${digitalFull ? 'bg-red-100 text-red-700' : takenSlotCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {freeCount} of {totalSlots} slots free
                                                </span>
                                            </div>

                                            {!newRental.startDate ? (
                                                <p className="px-4 py-5 text-xs text-slate-400 italic text-center">Select dates above to see slot availability.</p>
                                            ) : (
                                                <div className="p-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                                    {Array.from({ length: totalSlots }, (_, i) => i + 1).map(slot => {
                                                        const taken     = slotOccupancy[slot];
                                                        const isSelected = newRental.slotNumber === slot;
                                                        return (
                                                            <button
                                                                key={slot}
                                                                type="button"
                                                                disabled={!!taken}
                                                                onClick={() => !taken && setNewRental({ ...newRental, slotNumber: slot })}
                                                                title={taken ? `Booked by ${taken.clientName} · until ${taken.endDate}` : `Slot ${slot} — available`}
                                                                className={`relative flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition-all ${
                                                                    taken
                                                                        ? 'cursor-not-allowed border-red-200 bg-red-50'
                                                                        : isSelected
                                                                        ? 'border-slate-900 bg-slate-900 shadow-md cursor-pointer'
                                                                        : 'cursor-pointer border-slate-200 bg-white hover:border-slate-900 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <span className={`text-sm font-black leading-none ${taken ? 'text-red-400' : isSelected ? 'text-white' : 'text-slate-700'}`}>{slot}</span>
                                                                {taken ? (
                                                                    <>
                                                                        <Lock size={9} className="mt-1 text-red-400" />
                                                                        <span className="mt-0.5 w-full truncate text-center text-[8px] font-bold leading-tight text-red-500">{taken.clientName.split(' ')[0]}</span>
                                                                        <span className="text-[7px] text-slate-400 leading-tight">until {taken.endDate.slice(0, 7)}</span>
                                                                    </>
                                                                ) : (
                                                                    <span className={`mt-1 text-[9px] ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>Free</span>
                                                                )}
                                                                {isSelected && !taken && (
                                                                    <CheckCircle size={10} className="absolute right-1 top-1 text-white" />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Selected slot / status footer */}
                                            {newRental.startDate && (
                                                <div className={`px-4 py-2.5 border-t text-xs font-semibold flex items-center justify-between ${
                                                    digitalFull ? 'bg-red-50 border-red-100 text-red-600' :
                                                    slotOccupancy[newRental.slotNumber] ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                                    'bg-slate-50 border-slate-100 text-slate-600'
                                                }`}>
                                                    <span>Selected:</span>
                                                    <span className="font-black">
                                                        {digitalFull ? 'All slots booked for these dates' :
                                                         slotOccupancy[newRental.slotNumber] ? `Slot ${newRental.slotNumber} is taken — choose another` :
                                                         `Slot ${newRental.slotNumber} · available`}
                                                    </span>
                                                </div>
                                            )}
                                            {digitalFull && (
                                                <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border-t border-red-100 text-[10px] font-black text-red-600">
                                                    <Lock size={10} /> All {totalSlots} slots are booked for the selected dates.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div className="bg-slate-50 p-6 rounded-2xl space-y-6">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div>
                                            <MinimalInput label="Monthly Rate ($)" type="number" value={newRental.monthlyRate} onChange={(e: any) => setNewRental({...newRental, monthlyRate: Number(e.target.value)})} />
                                            {newRental.hasVat && newRental.monthlyRate > 0 && (
                                                <p className="text-[10px] text-slate-900 mt-2">Net: ${splitInclusiveVat(newRental.monthlyRate, vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(newRental.monthlyRate, vatRate).vat.toFixed(2)}</p>
                                            )}
                                        </div>
                                        <div>
                                            <MinimalInput label="Install Fee ($)" type="number" value={newRental.installationCost} onChange={(e: any) => setNewRental({...newRental, installationCost: Number(e.target.value)})} />
                                            <p className="text-[10px] text-slate-900 mt-2">One-time setup charge billed in month 1</p>
                                        </div>
                                    </div>
                                    {selectedBillboard?.type === BillboardType.Static && (
                                        <div>
                                            <MinimalInput label="Production Fee ($)" type="number" value={newRental.productionCost} onChange={(e: any) => setNewRental({...newRental, productionCost: Number(e.target.value)})} />
                                            <p className="text-[10px] text-slate-900 mt-2">
                                                {newRental.productionCost > 0
                                                    ? `Auto-set from size ${selectedBillboard.width}m × ${selectedBillboard.height}m. Edit if needed.`
                                                    : 'No standard fee for this size — enter manually if applicable.'}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={newRental.hasVat} onChange={e => setNewRental({...newRental, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"/>
                                        <label className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</label>
                                    </div>
                                    <p className="text-[10px] text-slate-900 -mt-2">When checked, VAT-inclusive — the system extracts {vatPct} for invoicing. Uncheck only for VAT-exempt clients.</p>
                                </div>
                                <MinimalInput label="Assigned Sales Agent (Optional)" value={newRental.assignedTo} onChange={(e: any) => setNewRental({...newRental, assignedTo: e.target.value})} />

                                {/* AI Proposal — collapsible, step 3 only */}
                                <details className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                                    <summary className="p-4 cursor-pointer flex items-center gap-2 hover:bg-slate-50 transition-colors">
                                        <div className="p-2 bg-purple-100 rounded-xl text-purple-600"><Wand2 size={16}/></div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">AI Proposal Draft</h4>
                                            <p className="text-xs text-slate-900">Optional pitch email for this rental</p>
                                        </div>
                                    </summary>
                                    <div className="p-4 border-t border-slate-100 space-y-3">
                                        <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-4 min-h-[140px] text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                                            {aiProposal || "Click 'Generate' to create a professional pitch draft..."}
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={handleGenerateProposal} disabled={isGenerating} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                                                {isGenerating ? <RefreshCw size={14} className="animate-spin"/> : <Wand2 size={14} />} {isGenerating ? 'Drafting...' : 'Generate Proposal'}
                                            </button>
                                            {aiProposal && (
                                                <a href={`https://wa.me/?text=${encodeURIComponent(aiProposal)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-green-600 text-white font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                                                    <MessageCircle size={14} /> WhatsApp
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* Navigation Footer */}
                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            {createStep > 1 ? (
                                <button type="button" onClick={() => setCreateStep((prev) => (prev - 1) as 1 | 2 | 3)} className="px-6 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">
                                    Back
                                </button>
                            ) : (
                                <button type="button" onClick={() => { setIsCreateModalOpen(false); setCreateStep(1); }} className="px-6 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">
                                    Cancel
                                </button>
                            )}

                            {createStep < 3 ? (
                                <button
                                    type="button"
                                    onClick={() => setCreateStep((prev) => (prev + 1) as 1 | 2 | 3)}
                                    disabled={(createStep === 1 && !newRental.clientId) || (createStep === 2 && !newRental.billboardId)}
                                    className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Next &rarr;
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={selectedBillboard?.type === BillboardType.LED && digitalFull}
                                    className="flex-1 py-3 text-white bg-gradient-to-r from-slate-900 to-slate-700 hover:from-slate-800 hover:to-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={14} /> Generate Contract & Invoice
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* View Modal */}
      {selectedRental && !editRental && !renewRental && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget) setSelectedRental(null); }}>
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Contract Details</h3>
                        <p className="text-xs text-slate-900 mt-0.5">ID: {selectedRental.id} &bull; Status: <span className={`font-bold ${selectedRental.status === 'Active' ? 'text-emerald-600' : selectedRental.status === 'Expired' ? 'text-red-500' : 'text-amber-600'}`}>{selectedRental.status}</span></p>
                    </div>
                    <button onClick={() => setSelectedRental(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
                </div>
                <div className="p-8 space-y-6">
                    {/* Context summary card */}
                    <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Client</p>
                            <p className="text-lg font-bold">{getClientName(selectedRental.clientId)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Billboard</p>
                                <p className="font-semibold text-sm">{getBillboardName(selectedRental.billboardId)}</p>
                                <p className="text-xs text-slate-900 mt-0.5">{selectedRental.details}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Duration</p>
                                <p className="font-semibold text-sm">{selectedRental.startDate}</p>
                                <p className="text-xs text-slate-900 mt-0.5">to {selectedRental.endDate}</p>
                            </div>
                        </div>
                    </div>

                    {/* Financial breakdown */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Financial Breakdown</p>
                        <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                            <div className="flex justify-between items-center px-4 py-3 text-sm">
                                <span className="text-slate-900">Monthly Rate</span>
                                <span className="font-semibold text-slate-800">${selectedRental.monthlyRate.toLocaleString()}</span>
                            </div>
                            {selectedRental.installationCost > 0 && (
                                <div className="flex justify-between items-center px-4 py-3 text-sm">
                                    <span className="text-slate-900">Installation Fee</span>
                                    <span className="font-semibold text-slate-800">${selectedRental.installationCost.toLocaleString()}</span>
                                </div>
                            )}
                            {(selectedRental.productionCost || 0) > 0 && (
                                <div className="flex justify-between items-center px-4 py-3 text-sm">
                                    <span className="text-slate-900">Production Fee</span>
                                    <span className="font-semibold text-slate-800">${(selectedRental.productionCost || 0).toLocaleString()}</span>
                                </div>
                            )}
                            {selectedRental.printingCost > 0 && (
                                <div className="flex justify-between items-center px-4 py-3 text-sm">
                                    <span className="text-slate-900">Printing Cost</span>
                                    <span className="font-semibold text-slate-800">${selectedRental.printingCost.toLocaleString()}</span>
                                </div>
                            )}
                            {selectedRental.hasVat && (() => {
                                const { subtotal: net, vat } = splitInclusiveVat(selectedRental.monthlyRate, vatRate);
                                return (
                                    <>
                                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                                            <span className="text-slate-900">Net (excl. VAT)</span>
                                            <span className="font-semibold text-slate-800">${net.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                                            <span className="text-slate-900">VAT ({vatPct})</span>
                                            <span className="font-semibold text-slate-800">${vat.toFixed(2)}</span>
                                        </div>
                                    </>
                                );
                            })()}
                            <div className="flex justify-between items-center px-4 py-3 bg-white rounded-b-2xl">
                                <span className="text-sm font-bold text-slate-900">Total Contract Value</span>
                                <span className="text-lg font-extrabold text-slate-900">${selectedRental.totalContractValue.toLocaleString()}</span>
                            </div>
                        </div>
                        {selectedRental.hasVat && <p className="text-xs text-slate-900 mt-1.5">Monthly rate is VAT-inclusive — {vatPct} extracted for invoicing.</p>}
                    </div>

                    {selectedRental.assignedTo && (
                        <div className="flex items-center gap-2 text-sm text-indigo-600">
                            <UserCircle size={15} />
                            <span className="font-medium">Assigned to <strong>{selectedRental.assignedTo}</strong></span>
                        </div>
                    )}

                    {selectedRental.lastModifiedDate && (
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <p className="text-xs text-amber-600 font-medium"><Edit size={12} className="inline mr-1"/> Last edited on {new Date(selectedRental.lastModifiedDate).toLocaleDateString()} by {selectedRental.lastModifiedBy || 'Unknown'}</p>
                        </div>
                    )}

                    {(() => {
                        const amends = getContractAmendmentsForContract(selectedRental.id);
                        if (amends.length === 0) return null;
                        return (
                            <div className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                                    <History size={14} />
                                    Amendment History ({amends.length})
                                </div>
                                <div className="p-4 space-y-3 max-h-40 overflow-y-auto">
                                    {amends.slice(0, 3).map(a => (
                                        <div key={a.id} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${a.type === 'extension' ? 'bg-emerald-500' : a.type === 'reduction' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                                <span className="font-medium text-slate-700 capitalize">{a.type}</span>
                                                <span className="text-xs text-slate-900">{new Date(a.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <span className={`text-xs font-bold ${a.financialImpact >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {a.financialImpact >= 0 ? '+' : '-'}${Math.abs(a.financialImpact).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                    {amends.length > 3 && (
                                        <p className="text-xs text-slate-900 text-center">+{amends.length - 3} more amendments</p>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="pt-2">
                        <button
                            onClick={() => {
                                const client = getClient(selectedRental.clientId);
                                const billboard = getBillboard(selectedRental.billboardId);
                                if (!client) { alert('Client data missing.'); return; }
                                generateLegalContractPDF(selectedRental, client, billboard);
                            }}
                            className="w-full py-3 text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                        >
                            <FileText size={14} /> Generate Full Legal Contract
                        </button>
                        <p className="text-[10px] text-slate-900 mt-2 text-center">Uses your editable contract template from Settings &rarr; Company Profile.</p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setSelectedRental(null)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Close</button>
                        <button onClick={() => openTermAdjustment(selectedRental)} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"><Calendar size={14} /> Amend Contract</button>
                        {isContractExpired(selectedRental) && <button onClick={() => { setSelectedRental(null); setRenewRental({...selectedRental}); setEditError(null); }} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2"><RotateCcw size={14} /> Renew</button>}
                        {isContractExpired(selectedRental) && canUserDelete && (
                          <button onClick={() => { setSelectedRental(null); setContractToPermanentDelete(selectedRental); }} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2">
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRental && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) { setEditRental(null); setShowDeleteLineConfirm(false); setDeletedLinesWithInvoices([]); } }}>
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-3xl lg:max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Edit Rental</h3>
                        <p className="text-xs text-slate-900 mt-0.5">{getClientName(editRental.clientId)} &bull; {getBillboardName(editRental.billboardId)}</p>
                    </div>
                    <button onClick={() => { if (!saving) { setEditRental(null); setShowDeleteLineConfirm(false); setDeletedLinesWithInvoices([]); } }} disabled={saving} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"><X size={20} className="text-slate-900" /></button>
                </div>
                <div className="p-8 space-y-6">
                    {/* Context card */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Billboard</p>
                            <p className="font-semibold text-slate-800 text-sm">{getBillboardName(editRental.billboardId)}</p>
                            <p className="text-xs text-slate-900">{editRental.details}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Contract ID</p>
                            <p className="font-semibold text-slate-800 text-sm">{editRental.id}</p>
                        </div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <p className="text-xs text-amber-700 font-medium flex items-center gap-2"><Edit size={14} /> Edit dates, rates, fees, billboard assignment, side/slot, and additional billboard lines before saving.</p>
                    </div>

                    {editError && (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{editError}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Primary Billboard Line</p>
                        <select
                            value={editRental.billboardId}
                            onChange={(e) => setEditRental(withBillboardDefaults(editRental, e.target.value))}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                        >
                            {getBillboards().map(b => <option key={b.id} value={b.id}>{b.name} - {b.location}</option>)}
                        </select>
                        {(() => {
                            const billboard = getBillboard(editRental.billboardId);
                            if (!billboard) return null;
                            if (billboard.type === BillboardType.Static) {
                                return (
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['A', 'B', 'Both'] as const).map(side => (
                                            <button
                                                key={side}
                                                type="button"
                                                onClick={() => {
                                                    const next = { ...editRental, side, slotNumber: undefined, monthlyRate: getDefaultRate(editRental.billboardId, side) };
                                                    setEditRental({ ...next, details: getLineDetails(next) });
                                                }}
                                                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${editRental.side === side ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'}`}
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
                                        value={editRental.slotNumber || 1}
                                        onChange={(e) => {
                                            const next = { ...editRental, slotNumber: Number(e.target.value), side: undefined };
                                            setEditRental({ ...next, details: getLineDetails(next) });
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
                        <select value={editRental.status} onChange={(e) => setEditRental({...editRental, status: e.target.value as 'Active' | 'Pending' | 'Expired'})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800">
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
                                <input type="date" value={editRental.startDate} onChange={(e) => setEditRental({...editRental, startDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">End Date</label>
                                <input type="date" value={editRental.endDate} onChange={(e) => setEditRental({...editRental, endDate: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button type="button" onClick={() => setEditRental({...editRental, endDate: new Date().toISOString().split('T')[0]})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">End Today</button>
                            <button type="button" onClick={() => setEditRental({...editRental, endDate: addMonths(editRental.endDate, 1)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+1 Month</button>
                            <button type="button" onClick={() => setEditRental({...editRental, endDate: addMonths(editRental.endDate, 3)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+3 Months</button>
                            <button type="button" onClick={() => setEditRental({...editRental, endDate: addMonths(editRental.endDate, 12)})} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">+12 Months</button>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                            <span className="text-slate-900 font-medium">Updated term length</span>
                            <span className="text-slate-900 font-bold">{calculateContractMonthsSafe(editRental.startDate, editRental.endDate)} month(s)</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Monthly Rate ($)</label>
                                <input type="number" value={editRental.monthlyRate} onChange={(e) => setEditRental({...editRental, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900" />
                                {editRental.hasVat && editRental.monthlyRate > 0 && (
                                    <p className="text-[10px] text-slate-900 mt-1">Net: ${splitInclusiveVat(editRental.monthlyRate, vatRate).subtotal.toFixed(2)} + VAT: ${splitInclusiveVat(editRental.monthlyRate, vatRate).vat.toFixed(2)}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Installation Cost ($)</label>
                                <input type="number" value={editRental.installationCost} onChange={(e) => setEditRental({...editRental, installationCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Printing Cost ($)</label>
                                <input type="number" value={editRental.printingCost} onChange={(e) => setEditRental({...editRental, printingCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Production Fee ($)</label>
                                <input type="number" value={editRental.productionCost || 0} onChange={(e) => setEditRental({...editRental, productionCost: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900" />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editRental.hasVat} onChange={(e) => setEditRental({...editRental, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                            <span className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</span>
                        </label>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Additional Billboard Lines</p>
                            <button
                                type="button"
                                onClick={() => {
                                    const firstBoard = getBillboards()[0];
                                    if (!firstBoard) {
                                        setEditError('Add a billboard to inventory before adding a contract line.');
                                        return;
                                    }
                                    const id = `C-${Date.now().toString().slice(-6)}`;
                                    const base: Contract = {
                                        ...editRental,
                                        id,
                                        billboardId: firstBoard.id,
                                        side: firstBoard.type === BillboardType.Static ? 'A' : undefined,
                                        slotNumber: firstBoard.type === BillboardType.LED ? 1 : undefined,
                                        monthlyRate: getDefaultRate(firstBoard.id, firstBoard.type === BillboardType.Static ? 'A' : undefined),
                                        installationCost: 0,
                                        printingCost: 0,
                                        productionCost: getProductionFee(firstBoard),
                                        totalContractValue: 0,
                                        masterContractId: editRental.masterContractId || editRental.id,
                                        createdAt: new Date().toISOString(),
                                    };
                                    setEditExtraLines([...editExtraLines, { ...base, details: getLineDetails(base), totalContractValue: recalcContractValue(base) }]);
                                }}
                                className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-1"
                            >
                                <Plus size={13} /> Add Billboard
                            </button>
                        </div>

                        {editExtraLines.length === 0 && (
                            <div className="border border-dashed border-slate-200 rounded-xl p-4 text-sm text-slate-900">
                                No additional billboards on this contract yet.
                            </div>
                        )}

                        <div className="space-y-3">
                            {editExtraLines.map((line, index) => {
                                const billboard = getBillboard(line.billboardId);
                                return (
                                    <div key={line.id} className="rounded-2xl border border-slate-200 p-4 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Line {index + 2}</p>
                                                <p className="text-sm font-semibold text-slate-800">{billboard?.name || 'Unknown billboard'} &bull; {line.details}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (getContracts().some(c => c.id === line.id)) setDeletedEditLineIds([...deletedEditLineIds, line.id]);
                                                    setEditExtraLines(editExtraLines.filter(l => l.id !== line.id));
                                                }}
                                                className="p-2 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                aria-label="Remove billboard line"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <select
                                            value={line.billboardId}
                                            onChange={(e) => {
                                                const next = withBillboardDefaults(line, e.target.value);
                                                setEditExtraLines(editExtraLines.map(l => l.id === line.id ? next : l));
                                            }}
                                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                                        >
                                            {getBillboards().map(b => <option key={b.id} value={b.id}>{b.name} - {b.location}</option>)}
                                        </select>

                                        {billboard?.type === BillboardType.Static ? (
                                            <div className="grid grid-cols-3 gap-2">
                                                {(['A', 'B', 'Both'] as const).map(side => (
                                                    <button
                                                        key={side}
                                                        type="button"
                                                        onClick={() => {
                                                            const next = { ...line, side, slotNumber: undefined, monthlyRate: getDefaultRate(line.billboardId, side) };
                                                            setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...next, details: getLineDetails(next) } : l));
                                                        }}
                                                        className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${line.side === side ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'}`}
                                                    >
                                                        {side === 'Both' ? 'Both A&B' : `Side ${side}`}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : billboard ? (
                                            <select
                                                value={line.slotNumber || 1}
                                                onChange={(e) => {
                                                    const next = { ...line, slotNumber: Number(e.target.value), side: undefined };
                                                    setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...next, details: getLineDetails(next) } : l));
                                                }}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-800"
                                            >
                                                {Array.from({ length: billboard.totalSlots || 10 }, (_, i) => <option key={i + 1} value={i + 1}>Slot {i + 1}</option>)}
                                            </select>
                                        ) : null}

                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="date" value={line.startDate} onChange={(e) => setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...line, startDate: e.target.value } : l))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900" />
                                            <input type="date" value={line.endDate} onChange={(e) => setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...line, endDate: e.target.value } : l))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900" />
                                            <input type="number" value={line.monthlyRate} onChange={(e) => setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...line, monthlyRate: Number(e.target.value) } : l))} placeholder="Monthly rate" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900 placeholder:text-slate-900" />
                                            <input type="number" value={line.productionCost || 0} onChange={(e) => setEditExtraLines(editExtraLines.map(l => l.id === line.id ? { ...line, productionCost: Number(e.target.value) } : l))} placeholder="Production fee" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm text-slate-900 placeholder:text-slate-900" />
                                        </div>
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                                            <span className="text-slate-900 font-medium">Line value</span>
                                            <span className="text-slate-900 font-bold">${recalcContractValue(line).toLocaleString()}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Invoice deletion warning for removed billboard lines */}
                     {showDeleteLineConfirm && deletedLinesWithInvoices.length > 0 && (
                       <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 space-y-4">
                         <div className="flex items-start gap-3">
                           <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                           <div>
                             <h4 className="font-bold text-amber-700 text-sm">Removed Billboard Lines Have Invoices</h4>
                             <p className="text-xs text-amber-600 mt-1">
                               The following billboard lines you removed from this contract have associated invoices. Proceeding will permanently delete these invoices.
                             </p>
                           </div>
                         </div>
                         <div className="space-y-2 max-h-32 overflow-y-auto">
                           {deletedLinesWithInvoices.map((item, idx) => (
                             <div key={item.contractId} className="bg-white rounded-xl border border-amber-100 p-3 flex justify-between items-center text-sm">
                               <span className="text-slate-900 font-medium">Line {idx + 1}: {item.contractId}</span>
                               <span className="text-amber-600 font-bold">{item.invoiceCount} invoice(s) — ${item.totalValue.toLocaleString()}</span>
                             </div>
                           ))}
                         </div>
                         <div className="flex gap-3">
                           <button onClick={() => { setShowDeleteLineConfirm(false); setDeletedLinesWithInvoices([]); }} className="flex-1 py-2.5 text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">
                             Cancel — Keep Lines
                           </button>
                           <button onClick={handleEditSave} disabled={saving} className="flex-1 py-2.5 text-white bg-amber-600 hover:bg-amber-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                             {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} {saving ? 'Saving…' : 'Proceed & Delete Invoices'}
                           </button>
                         </div>
                       </div>
                     )}
                     {!showDeleteLineConfirm && (
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => { if (!saving) setEditRental(null); setShowDeleteLineConfirm(false); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">Cancel</button>
                        <button onClick={handleEditSave} disabled={saving} className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Contract Amendment Modal */}
      {amendContract && (
        <ContractAmendmentModal
          contract={amendContract}
          onClose={() => setAmendContract(null)}
          onApplied={() => {
            setAmendContract(null);
            setRentals([...getContracts()]);
          }}
        />
      )}

      {/* Renew Modal */}
      {renewRental && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" onClick={(e) => { if (e.target === e.currentTarget && !saving) setRenewRental(null); }}>
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Renew Contract</h3>
                        <p className="text-xs text-slate-900 mt-0.5">Creates a new 12-month agreement from the expired one</p>
                    </div>
                    <button onClick={() => { if (!saving) setRenewRental(null); }} disabled={saving} className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"><X size={20} className="text-slate-900" /></button>
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

                    {/* Original contract summary */}
                    <div className="bg-slate-900 text-white p-4 rounded-2xl">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Original Contract</p>
                        <p className="font-bold text-base">{getClientName(renewRental.clientId)}</p>
                        <p className="text-slate-300 text-sm mt-0.5">{getBillboardName(renewRental.billboardId)} &bull; {renewRental.details}</p>
                        <p className="text-xs text-slate-900 mt-1">{renewRental.startDate} — {renewRental.endDate}</p>
                    </div>

                    {/* New period (read-only) */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900">New Rental Period</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Start Date</label>
                                <input type="date" value={(() => { const d = new Date(renewRental.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-900 mb-2">End Date</label>
                                <input type="date" value={(() => { const d = new Date(renewRental.endDate); d.setDate(d.getDate() + 1); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0]; })()} disabled className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 text-sm" />
                            </div>
                        </div>
                        <p className="text-xs text-slate-900">Period is auto-calculated (12 months). Dates are locked.</p>
                    </div>

                    {/* Financials */}
                    <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Financials</p>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-900 mb-2">Monthly Rate ($)</label>
                            <input type="number" value={renewRental.monthlyRate} onChange={(e) => setRenewRental({...renewRental, monthlyRate: Number(e.target.value)})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium text-slate-900" />
                            <p className="text-[10px] text-slate-900 mt-1">Adjust the rate if pricing has changed since last term.</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={renewRental.hasVat} onChange={(e) => setRenewRental({...renewRental, hasVat: e.target.checked})} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                            <span className="text-sm font-medium text-slate-900">Rate includes VAT ({vatPct})</span>
                        </label>
                    </div>

                    {/* Value breakdown */}
                    {(() => {
                        const months = 12;
                        const gross = (renewRental.monthlyRate * months) + renewRental.installationCost + renewRental.printingCost + (renewRental.productionCost || 0);
                        const { subtotal: net, vat } = renewRental.hasVat ? splitInclusiveVat(renewRental.monthlyRate, vatRate) : { subtotal: renewRental.monthlyRate, vat: 0 };
                        return (
                            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-300">Monthly Net</span>
                                    <span className="font-semibold">${net.toFixed(2)}</span>
                                </div>
                                {renewRental.hasVat && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-300">Monthly VAT ({vatPct})</span>
                                        <span className="font-semibold">${vat.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-300">Monthly Rate (gross)</span>
                                    <span className="font-semibold">${renewRental.monthlyRate.toLocaleString()}</span>
                                </div>
                                <div className="border-t border-slate-700 pt-2 flex justify-between">
                                    <span className="text-sm font-bold uppercase tracking-wider">New Total Value</span>
                                    <span className="text-xl font-black">${gross.toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-slate-900">12 months × ${renewRental.monthlyRate.toLocaleString()}{renewRental.installationCost > 0 ? ` + $${renewRental.installationCost} install` : ''}{(renewRental.productionCost || 0) > 0 ? ` + $${renewRental.productionCost} production` : ''}</p>
                            </div>
                        );
                    })()}

                    <div className="flex gap-3 pt-2">
                        <button onClick={() => { if (!saving) setRenewRental(null); }} disabled={saving} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40">Cancel</button>
                        <button onClick={handleRenew} disabled={saving} className="flex-1 py-3 text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-60">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} {saving ? 'Renewing…' : 'Renew Contract'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {rentalToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { setRentalToDelete(null); setShowPaidInvoiceDeleteWarning(false); }} />
          <div className="flex min-h-full items-center justify-center p-4 text-center">
              <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-sm border border-white/20">
                 {/* Header */}
                 <div className="p-6 border-b border-red-100 bg-red-50 flex items-start gap-4">
                     <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                         <Trash2 className="text-red-600" size={22} />
                     </div>
                     <div>
                         <h3 className="text-lg font-bold text-red-900">Delete Rental Agreement?</h3>
                         <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                     </div>
                 </div>
                 <div className="p-6 space-y-4">
                     {/* What's being deleted */}
                     <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-1.5">
                         <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Rental Being Deleted</p>
                         <p className="font-bold text-slate-900">{getClientName(rentalToDelete.clientId)}</p>
                         <p className="text-sm text-slate-900">{getBillboardName(rentalToDelete.billboardId)} &bull; {rentalToDelete.details}</p>
                         <p className="text-xs text-slate-900">{rentalToDelete.startDate} — {rentalToDelete.endDate}</p>
                         <p className="text-xs text-slate-900 font-mono">ID: {rentalToDelete.id}</p>
                     </div>
                     {/* Warning about related records */}
                     <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                         <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                         <p className="text-xs text-amber-700 font-medium">Any invoices and receipts linked to this rental will be orphaned. The billboard asset will be freed for re-booking.</p>
                     </div>
                     {/* Paid Invoice Warning */}
                     {showPaidInvoiceDeleteWarning && (
                       <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
                         <div className="flex items-start gap-3">
                           <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                           <div>
                             <h4 className="font-bold text-red-700 text-sm">This Contract Has Paid Invoices</h4>
                             <p className="text-xs text-red-600 mt-1">Permanently deleting this contract will remove all financial records. Consider using <strong>"End Contract"</strong> instead, which preserves invoice history and only marks the contract as expired.</p>
                           </div>
                         </div>
                         <div className="flex gap-3">
                           <button onClick={() => { setRentalToDelete(null); setShowPaidInvoiceDeleteWarning(false); }} className="flex-1 py-2.5 text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">
                             Cancel — Keep Contract
                           </button>
                           <button onClick={confirmDelete} className="flex-1 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2">
                             <Trash2 size={13} /> Delete Anyway
                           </button>
                         </div>
                       </div>
                     )}
                     {!showPaidInvoiceDeleteWarning && (
                     <div className="flex gap-3 pt-1">
                         <button onClick={() => { setRentalToDelete(null); setShowPaidInvoiceDeleteWarning(false); }} className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Keep Rental</button>
                         <button onClick={confirmDelete} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 shadow-lg shadow-red-600/20">Delete Permanently</button>
                     </div>
                     )}
                 </div>
              </div>
          </div>
        </div>
      )}

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
                      className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors"
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
                          setRentals([...getContracts()]);
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
