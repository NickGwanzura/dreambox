import React, { useState, useEffect, useRef } from "react";
import { generateId } from "../utils/sanitizers";
import {
  getInvoices,
  getContracts,
  getClients,
  getBillboards,
  addInvoice,
  updateInvoice,
  deleteInvoice,
  addContract,
  getCompanyProfile,
  getCompanyLogo,
  subscribe,
  convertInvoiceType,
  convertQuotationToInvoice,
} from "../services/mockData";
import { calculateContractMonths } from "../utils/contractDate";
import {
  generateInvoicePDF,
  generateStatementPDF,
} from "../services/pdfGenerator";
import { sendDocumentEmail } from "../services/documentEmail";
import { SendDocumentModal } from "./SendDocumentModal";
import {
  Download,
  Plus,
  X,
  Save,
  Link2,
  CreditCard,
  Search,
  Trash2,
  FileText,
  Building2,
  Phone,
  Mail,
  Globe,
  Send,
  Edit,
  ArrowRight,
  Receipt,
} from "lucide-react";
import { Invoice, Contract, BillboardType, QuoteStatus } from "../types";
import { splitInclusiveVat, formatVatPercent } from "../services/constants";
import { getEffectiveVatRate } from "../services/mockData";
import { canDelete, canWriteFinance } from "../utils/settingsAccess";
import { useToast } from "./ToastProvider";
import { getCurrentUser } from "../services/authServiceSecure";
import {
  uploadPaymentProof,
  isBankPaymentMethod,
  openPaymentProof,
} from "../services/paymentProof";
import { fetchPage, PaginationMeta } from "../services/pagination";
import { isConfigured } from "../services/apiClient";
import { PaginationControls } from "./ui/PaginationControls";

type InvoiceLineItem = Invoice["items"][number];
type DueDateProvenance =
  | "initial"
  | "auto"
  | "existing"
  | "manual-set"
  | "manual-cleared";

const getLocalDateInputValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const MinimalInput = ({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
}: any) => (
  <div className="group relative">
    <input
      type={type}
      required={required}
      disabled={disabled}
      value={value}
      onChange={onChange}
      aria-label={label}
      placeholder=" "
      className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-900 disabled:cursor-not-allowed"
    />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">
      {label}
    </label>
  </div>
);
const MinimalTextarea = ({
  label,
  value,
  onChange,
  rows = 3,
  required = false,
  disabled = false,
}: any) => (
  <div className="group relative">
    <textarea
      rows={rows}
      required={required}
      disabled={disabled}
      value={value}
      onChange={onChange}
      aria-label={label}
      placeholder=" "
      className="peer w-full resize-none px-0 py-3 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-900 disabled:cursor-not-allowed"
    />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">
      {label}
    </label>
  </div>
);
const MinimalSelect = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: any) => (
  <div className="group relative">
    <select
      value={value}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer disabled:text-slate-900 disabled:cursor-not-allowed"
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium uppercase tracking-wide">
      {label}
    </label>
  </div>
);

interface FinancialsProps {
  initialTab?: "Invoices" | "Receipts" | "Statements";
}

export const Financials: React.FC<FinancialsProps> = ({
  initialTab = "Invoices",
}) => {
  const { showToast } = useToast();
  const notify = (message: string) => showToast(message, /failed|error|required|not found|proof/i.test(message) ? 'error' : 'success');
  const currentUser = getCurrentUser();
  const canUserWrite = canWriteFinance(currentUser, "invoices");
  const defaultReceiver = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const [activeTab, setActiveTab] = useState<
    "Invoices" | "Receipts" | "Statements"
  >(initialTab);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>(getInvoices());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshPage, setRefreshPage] = useState(0);
  const [allClients, setAllClients] = useState(getClients());
  const [searchTerm, setSearchTerm] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("all");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [newItem, setNewItem] = useState({ description: "", amount: 0 });
  const [formData, setFormData] = useState<Partial<Invoice>>({
    clientId: "",
    items: [],
    date: getLocalDateInputValue(),
    status: "Pending",
    contractId: "",
    paymentMethod: "Bank Transfer",
    paymentReference: "",
    receivedBy: defaultReceiver,
    receivingAccount: "",
    dueDate: "",
  });
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [selectedInvoiceToPay, setSelectedInvoiceToPay] = useState("");
  const [hasVat, setHasVat] = useState(false);
  const [discountType, setDiscountType] = useState<"amount" | "percentage">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [discountDescription, setDiscountDescription] = useState("");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [convertingQuotation, setConvertingQuotation] =
    useState<Invoice | null>(null);
  const [convertForm, setConvertForm] = useState({
    billboardId: "",
    startDate: "",
    endDate: "",
  });
  const [billboardSelections, setBillboardSelections] = useState<
    Record<string, { sideA?: boolean; sideB?: boolean; slots?: number }>
  >({});
  const [billboardSearch, setBillboardSearch] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");

  const getEmptyFormData = (): Partial<Invoice> => ({
    clientId: "",
    items: [],
    date: getLocalDateInputValue(),
    status: "Pending",
    contractId: "",
    paymentMethod: "Bank Transfer",
    paymentReference: "",
    receivedBy: defaultReceiver,
    receivingAccount: "",
    dueDate: "",
  });
  const resetQuoteFields = () => {
    setExpiryDate("");
    setTerms("");
    setNotes("");
  };

  // Refresh data whenever tab changes, modal closes, or a data sync happens
  useEffect(() => {
    if (!isConfigured()) setInvoices(getInvoices());
    setAllClients(getClients());
  }, [activeTab, isModalOpen]);

  // Subscribe to live data changes (application database sync)
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      if (!isConfigured()) setInvoices(getInvoices());
      setRefreshPage(value => value + 1);
      setAllClients(getClients());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isConfigured()) return;
    let active = true;
    setIsLoadingPage(true);
    setPageError(null);
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const clientIds = normalizedSearch ? allClients.filter(client => client.companyName.toLowerCase().includes(normalizedSearch)).map(client => client.id).join(',') : '';
    const type = activeTab === 'Invoices' ? 'Invoice' : activeTab === 'Receipts' ? 'Receipt' : 'all';
    fetchPage<Invoice>('/api/invoices', page, undefined, { search: searchTerm.trim(), month: invoiceMonth, status: invoiceStatus, type, clientIds }).then(result => {
      if (!active) return;
      setInvoices(result.data);
      setPagination(result.pagination);
    }).catch(error => active && setPageError(error?.message || 'Unable to load invoices.')).finally(() => active && setIsLoadingPage(false));
    return () => { active = false; };
  }, [page, refreshPage, activeTab, searchTerm, invoiceMonth, invoiceStatus, allClients]);

  useEffect(() => { setPage(1); }, [activeTab, searchTerm, invoiceMonth, invoiceStatus]);

  const getClientDueDate = (clientId: string, invoiceDate: string) => {
    const billingDay = allClients.find((client) => client.id === clientId)
      ?.billingDay;
    if (!billingDay || billingDay < 1 || billingDay > 31) return "";

    const safeInvoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
      ? invoiceDate
      : getLocalDateInputValue();
    const issuedOn = new Date(`${safeInvoiceDate}T12:00:00`);
    if (Number.isNaN(issuedOn.getTime())) return "";
    const dueForMonth = (year: number, month: number) =>
      new Date(
        year,
        month,
        Math.min(billingDay, new Date(year, month + 1, 0).getDate()),
        12,
      );
    let dueOn = dueForMonth(issuedOn.getFullYear(), issuedOn.getMonth());
    if (dueOn < issuedOn) {
      dueOn = dueForMonth(issuedOn.getFullYear(), issuedOn.getMonth() + 1);
    }
    return getLocalDateInputValue(dueOn);
  };

  const handleClientSelect = (clientId: string) => {
    setFormData((previous) => {
      const shouldGenerateDueDate =
        activeTab === "Invoices" &&
        (dueDateProvenanceRef.current === "initial" ||
          dueDateProvenanceRef.current === "auto");
      const dueDate = shouldGenerateDueDate
        ? getClientDueDate(clientId, previous.date || "")
        : previous.dueDate;
      if (shouldGenerateDueDate && dueDate) {
        dueDateProvenanceRef.current = "auto";
      }
      return {
      ...previous,
      clientId,
      dueDate,
      };
    });
  };

  const handleRentalSelect = (contractId: string) => {
    const contract = getContracts().find((c) => c.id === contractId);
    if (contract) {
      const billboard = getBillboards().find(
        (b) => b.id === contract.billboardId,
      );
      setFormData((previous) => {
        const shouldGenerateDueDate =
          activeTab === "Invoices" &&
          (dueDateProvenanceRef.current === "initial" ||
            dueDateProvenanceRef.current === "auto");
        const dueDate = shouldGenerateDueDate
          ? getClientDueDate(contract.clientId, previous.date || "")
          : previous.dueDate;
        if (shouldGenerateDueDate && dueDate) {
          dueDateProvenanceRef.current = "auto";
        }
        return {
        ...previous,
        contractId: contractId,
        clientId: contract.clientId,
        dueDate,
        items: [
          {
            description: `Monthly Rental - ${billboard?.name} (${contract.details})`,
            amount: contract.monthlyRate,
          },
        ],
        };
      });
      setHasVat(contract.hasVat);
    }
  };
  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceToPay(invoiceId);
    const invoice = getInvoices().find((i) => i.id === invoiceId);
    if (invoice) {
      const paid = getInvoices()
        .filter(
          (i) =>
            i.type === "Receipt" &&
            !i.isVoided &&
            i.linkedInvoiceId === invoice.id,
        )
        .reduce((sum, receipt) => sum + Number(receipt.total || 0), 0);
      const balance = Math.max(
        0,
        Math.round((Number(invoice.total) - paid) * 100) / 100,
      );
      setFormData({
        ...formData,
        clientId: invoice.clientId,
        contractId: invoice.contractId,
        items: [
          {
            description: `Payment for Invoice #${invoice.id}`,
            amount: balance,
          },
        ],
      });
      setHasVat(false);
      setDiscountType("amount");
      setDiscountValue(0);
      setDiscountDescription("");
    }
  };
  const addItem = () => {
    const trimmedDescription = newItem.description.trim();
    if (trimmedDescription && newItem.amount > 0) {
      setFormData({
        ...formData,
        items: [
          ...(formData.items || []),
          { description: trimmedDescription, amount: newItem.amount },
        ],
      });
      setNewItem({ description: "", amount: 0 });
    }
  };
  const toggleBillboardSide = (billboardId: string, side: "A" | "B") => {
    setBillboardSelections((prev) => {
      const cur = prev[billboardId] || {};
      const key = side === "A" ? "sideA" : "sideB";
      return { ...prev, [billboardId]: { ...cur, [key]: !cur[key] } };
    });
  };
  const setBillboardSlots = (billboardId: string, slots: number) => {
    setBillboardSelections((prev) => ({
      ...prev,
      [billboardId]: {
        ...(prev[billboardId] || {}),
        slots: Math.max(0, Math.floor(slots || 0)),
      },
    }));
  };
  const addSelectedBillboards = () => {
    const allBillboards = getBillboards();
    const newItems: InvoiceLineItem[] = [];
    Object.entries(billboardSelections).forEach(([billboardId, sel]) => {
      const b = allBillboards.find((x) => x.id === billboardId);
      if (!b) return;
      if (b.type === BillboardType.LED) {
        if (sel.slots && sel.slots > 0) {
          const rate = b.ratePerSlot || 0;
          newItems.push({
            description: `${b.name} — ${b.location}, ${b.town} (LED, ${sel.slots} slot${sel.slots > 1 ? "s" : ""})`,
            amount: rate * sel.slots,
            billboardId: b.id,
            slots: sel.slots,
          });
        }
      } else {
        if (sel.sideA) {
          newItems.push({
            description: `${b.name} — ${b.location}, ${b.town} (Side A)`,
            amount: b.sideARate || 0,
            billboardId: b.id,
            side: "A",
          });
        }
        if (sel.sideB) {
          newItems.push({
            description: `${b.name} — ${b.location}, ${b.town} (Side B)`,
            amount: b.sideBRate || 0,
            billboardId: b.id,
            side: "B",
          });
        }
      }
    });
    if (newItems.length > 0) {
      setFormData({
        ...formData,
        items: [...(formData.items || []), ...newItems],
      });
      setBillboardSelections({});
      setBillboardSearch("");
    }
  };
  const updateItem = (
    index: number,
    field: keyof InvoiceLineItem,
    value: string | number,
  ) => {
    const updatedItems = [...(formData.items || [])];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === "amount" ? Number(value) || 0 : String(value),
    };
    setFormData({ ...formData, items: updatedItems });
  };
  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: (formData.items || []).filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
  };
  // Item amounts are VAT-inclusive (gross). VAT is extracted from the total, not added.
  const grossItems =
    formData.items?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const rawDiscountAmount =
    discountType === "percentage"
      ? grossItems * (discountValue / 100)
      : discountValue;
  const discountAmount = Math.min(
    grossItems,
    Math.max(0, rawDiscountAmount || 0),
  );
  const grossAfterDiscount = Math.max(0, grossItems - discountAmount);
  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const { subtotal: taxableSubtotal, vat: vatAmount } = hasVat
    ? splitInclusiveVat(grossAfterDiscount, vatRate)
    : { subtotal: grossAfterDiscount, vat: 0 };
  const subtotal = taxableSubtotal;
  const total = grossAfterDiscount;
  const receiptIsLinkedToInvoice =
    activeTab === "Receipts" && !!selectedInvoiceToPay;
  const isSubmittingRef = useRef(false);
  const dueDateProvenanceRef = useRef<DueDateProvenance>("initial");
  const convertingToInvoiceRef = useRef(false);
  const convertingToContractRef = useRef(false);
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    // A double-click on submit would create the document twice
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      let proof = editingInvoice?.proofPaymentUrl
        ? {
            url: editingInvoice.proofPaymentUrl,
            originalName: editingInvoice.proofOriginalName || "Existing proof",
            mimeType: editingInvoice.proofMimeType || "application/pdf",
            uploadedAt:
              editingInvoice.proofUploadedAt || new Date().toISOString(),
          }
        : null;
      if (activeTab === "Receipts") {
        if (!String(formData.receivedBy || "").trim()) {
          notify("Who received the payment is required.");
          return;
        }
        if (!String(formData.paymentReference || "").trim()) {
          notify("Payment reference is required.");
          return;
        }
        if (
          isBankPaymentMethod(formData.paymentMethod) &&
          !String(formData.receivingAccount || "").trim()
        ) {
          notify("Receiving bank account is required for bank payments.");
          return;
        }
        if (paymentProofFile) {
          setProofUploading(true);
          try {
            proof = await uploadPaymentProof(paymentProofFile);
          } finally {
            setProofUploading(false);
          }
        }
        if (isBankPaymentMethod(formData.paymentMethod) && !proof) {
          notify("Attach proof of payment before posting a bank payment.");
          return;
        }
      }
      if (editingInvoice) {
        // Edit mode: update existing invoice
        const updatedDoc: Invoice = {
          ...editingInvoice,
          clientId: formData.clientId!,
          date: formData.date!,
          dueDate:
            editingInvoice.type === "Invoice"
              ? dueDateProvenanceRef.current === "manual-cleared"
                ? (null as any)
                : formData.dueDate || undefined
              : undefined,
          items: formData.items || [],
          subtotal,
          discountAmount,
          discountDescription:
            discountAmount > 0
              ? discountDescription.trim() || undefined
              : undefined,
          vatAmount,
          total,
          status:
            editingInvoice.type === "Receipt"
              ? "Paid"
              : formData.status || editingInvoice.status,
          contractId: formData.contractId,
          paymentMethod:
            editingInvoice.type === "Receipt"
              ? formData.paymentMethod
              : undefined,
          paymentReference:
            editingInvoice.type === "Receipt"
              ? formData.paymentReference
              : undefined,
          receivedBy:
            editingInvoice.type === "Receipt" ? formData.receivedBy : undefined,
          receivingAccount:
            editingInvoice.type === "Receipt"
              ? formData.receivingAccount
              : undefined,
          proofPaymentUrl: proof?.url,
          proofOriginalName: proof?.originalName,
          proofMimeType: proof?.mimeType,
          proofUploadedAt: proof?.uploadedAt,
          expiryDate:
            editingInvoice.type === "Quotation"
              ? expiryDate || undefined
              : undefined,
          terms:
            editingInvoice.type === "Quotation"
              ? terms || undefined
              : undefined,
          notes:
            editingInvoice.type === "Quotation"
              ? notes || undefined
              : undefined,
        };
        try {
          await updateInvoice(updatedDoc);
        } catch (err: any) {
          notify(`Failed: ${err?.message || "Server error. Please try again."}`);
          return;
        }
        setInvoices(getInvoices());
        setIsModalOpen(false);
        setEditingInvoice(null);
        setFormData(getEmptyFormData());
        setPaymentProofFile(null);
        setHasVat(false);
        setDiscountType("amount");
        setDiscountValue(0);
        setDiscountDescription("");
        setShowAdvancedFields(false);
        setNewItem({ description: "", amount: 0 });
        setBillboardSelections({});
        setBillboardSearch("");
        resetQuoteFields();
        notify(`${editingInvoice.type} Updated Successfully!`);
      } else {
        const isQuote = (activeTab as string) === "Quotations";
        const newDoc: Invoice = {
          clientId: formData.clientId!,
          date: formData.date!,
          dueDate:
            activeTab === "Invoices"
              ? dueDateProvenanceRef.current === "manual-cleared"
                ? (null as any)
                : formData.dueDate || undefined
              : undefined,
          items: formData.items || [],
          subtotal,
          discountAmount,
          discountDescription:
            discountAmount > 0
              ? discountDescription.trim() || undefined
              : undefined,
          vatAmount,
          total,
          status: activeTab === "Receipts" ? "Paid" : "Pending",
          type:
            activeTab === "Invoices"
              ? "Invoice"
              : (activeTab as string) === "Quotations"
                ? "Quotation"
                : (activeTab as string) === "Proformas"
                  ? "Proforma"
                  : "Receipt",
          contractId: formData.contractId,
          paymentMethod:
            activeTab === "Receipts" ? formData.paymentMethod : undefined,
          paymentReference:
            activeTab === "Receipts" ? formData.paymentReference : undefined,
          receivedBy:
            activeTab === "Receipts" ? formData.receivedBy?.trim() : undefined,
          receivingAccount:
            activeTab === "Receipts"
              ? formData.receivingAccount?.trim()
              : undefined,
          proofPaymentUrl: activeTab === "Receipts" ? proof?.url : undefined,
          proofOriginalName:
            activeTab === "Receipts" ? proof?.originalName : undefined,
          proofMimeType: activeTab === "Receipts" ? proof?.mimeType : undefined,
          proofUploadedAt:
            activeTab === "Receipts" ? proof?.uploadedAt : undefined,
          linkedInvoiceId:
            activeTab === "Receipts" && selectedInvoiceToPay
              ? selectedInvoiceToPay
              : undefined,
          expiryDate: isQuote ? expiryDate || undefined : undefined,
          terms: isQuote ? terms || undefined : undefined,
          notes: isQuote ? notes || undefined : undefined,
          quoteStatus: isQuote ? QuoteStatus.Draft : undefined,
        } as Invoice;
        try {
          await addInvoice(newDoc);
        } catch (err: any) {
          notify(`Failed: ${err?.message || "Server error. Please try again."}`);
          return;
        }
        setInvoices(getInvoices());
        setIsModalOpen(false);
        setFormData(getEmptyFormData());
        setPaymentProofFile(null);
        setSelectedInvoiceToPay("");
        setHasVat(false);
        setDiscountType("amount");
        setDiscountValue(0);
        setDiscountDescription("");
        setShowAdvancedFields(false);
        setNewItem({ description: "", amount: 0 });
        setBillboardSelections({});
        setBillboardSearch("");
        resetQuoteFields();
        notify(`${activeTab.slice(0, -1)} Created Successfully!`);
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };
  const downloadPDF = (doc: Invoice) => {
    const client = allClients.find((c) => c.id === doc.clientId);
    if (client) {
      generateInvoicePDF(doc, client);
    } else {
      notify(
        `Could not generate PDF: Client data missing for ID ${doc.clientId}`,
      );
    }
  };
  const [sendModal, setSendModal] = useState<{
    doc: Invoice;
    client: any;
  } | null>(null);
  const handleSendDoc = (doc: Invoice) => {
    const client = allClients.find((c) => c.id === doc.clientId);
    if (!client) {
      notify("Client not found");
      return;
    }
    setSendModal({ doc, client });
  };

  const buildDocSendDefaults = (doc: Invoice) => {
    const typeLabel = doc.type || "Invoice";
    const brand = "Dreambox Advertising";
    const subject = `${typeLabel} #${doc.id.slice(0, 8)} — $${(doc.total ?? 0).toLocaleString()} | ${brand}`;
    const t = String(typeLabel).toLowerCase();
    const message =
      t === "quotation"
        ? `Please find your quotation from ${brand} below. This quote is valid for 30 days. A PDF copy is attached.`
        : t === "receipt"
          ? `Thank you for your payment. Here is your receipt from ${brand}. A PDF copy is attached.`
          : t === "proforma"
            ? `Please find your proforma invoice from ${brand} below. This is a preliminary invoice for your records. A PDF copy is attached.`
            : `Please find your invoice from ${brand} below. Payment is due at your earliest convenience. A PDF copy is attached.`;
    return { subject, message };
  };
  const initiatePayment = (invoice: Invoice) => {
    setActiveTab("Receipts");
    setIsModalOpen(true);
    setTimeout(() => handleInvoiceSelect(invoice.id), 0);
  };

  const handleEdit = (doc: Invoice) => {
    const client = allClients.find((c) => c.id === doc.clientId);
    setEditingInvoice(doc);
    dueDateProvenanceRef.current = doc.dueDate
      ? "existing"
      : "manual-cleared";
    setFormData({
      clientId: doc.clientId,
      items: [...doc.items],
      date: doc.date,
      dueDate: doc.dueDate || "",
      status: doc.status,
      contractId: doc.contractId || "",
      paymentMethod: doc.paymentMethod || "Bank Transfer",
      paymentReference: doc.paymentReference || "",
      receivedBy: doc.receivedBy || defaultReceiver,
      receivingAccount: doc.receivingAccount || "",
    });
    setHasVat(doc.vatAmount > 0);
    if (doc.discountAmount && doc.discountAmount > 0) {
      setDiscountType("amount");
      setDiscountValue(doc.discountAmount);
      setDiscountDescription(doc.discountDescription || "");
    } else {
      setDiscountType("amount");
      setDiscountValue(0);
      setDiscountDescription("");
    }
    setExpiryDate(doc.expiryDate || "");
    setTerms(doc.terms || "");
    setNotes(doc.notes || "");
    setShowAdvancedFields(
      Boolean(doc.discountAmount || doc.discountDescription || doc.terms || doc.notes),
    );
    setNewItem({ description: "", amount: 0 });
    setBillboardSelections({});
    setBillboardSearch("");
    setIsModalOpen(true);
  };

  const handleDelete = async (doc: Invoice) => {
    const reason = window.prompt(
      `Void ${doc.type} #${doc.id}? The original record will be preserved. Enter the audit reason:`,
    );
    if (reason) {
      try {
        await deleteInvoice(doc.id, reason);
        setInvoices(getInvoices());
      } catch (err: any) {
        notify(`Failed: ${err?.message || "Server error. Please try again."}`);
      }
    }
  };

  // Guards converting a quotation to a contract: a converted quotation must
  // never become a second contract (double-click or stale modal included).
  const openConvertToContract = (doc: Invoice) => {
    if (doc.quoteStatus === "Converted" || doc.convertedToContractId) {
      notify(
        `Quotation ${doc.quoteNumber || doc.id} has already been converted.`,
      );
      return;
    }
    setConvertingQuotation(doc);
    setConvertForm({ billboardId: "", startDate: "", endDate: "" });
  };

  const handleConvertToContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !convertingQuotation ||
      !convertForm.billboardId ||
      !convertForm.startDate ||
      !convertForm.endDate
    )
      return;
    // Re-check at submit against the freshest local copy, not the snapshot
    // frozen when the modal opened (another tab/session may have converted
    // this quotation since).
    const currentQuote =
      getInvoices().find((inv) => inv.id === convertingQuotation.id) ||
      convertingQuotation;
    if (
      currentQuote.quoteStatus === "Converted" ||
      currentQuote.convertedToContractId
    ) {
      notify(
        `Quotation ${currentQuote.quoteNumber || currentQuote.id} has already been converted.`,
      );
      setConvertingQuotation(null);
      return;
    }
    if (convertingToContractRef.current) return;
    if (
      !window.confirm(
        `Create a contract from quotation ${convertingQuotation.quoteNumber || convertingQuotation.id}? The quotation will be preserved and marked Converted.`,
      )
    )
      return;
    convertingToContractRef.current = true;
    const bb = getBillboards().find((b) => b.id === convertForm.billboardId);
    const monthlyRate = convertingQuotation.items[0]?.amount || 0;
    let months: number;
    try {
      months = calculateContractMonths(
        convertForm.startDate,
        convertForm.endDate,
      );
    } catch {
      months = Math.max(
        1,
        Math.ceil(
          (new Date(convertForm.endDate).getTime() -
            new Date(convertForm.startDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ),
      );
    }
    const gross = monthlyRate * months;
    const contract: Contract = {
      id: `C-${generateId()}`,
      clientId: convertingQuotation.clientId,
      billboardId: convertForm.billboardId,
      startDate: convertForm.startDate,
      endDate: convertForm.endDate,
      monthlyRate,
      installationCost: 0,
      printingCost: 0,
      hasVat: convertingQuotation.vatAmount > 0,
      totalContractValue: gross,
      status: "Active",
      details: bb?.type === BillboardType.LED ? "Slot 1" : "Side A",
      createdAt: new Date().toISOString(),
      // Server converts + marks the quotation Converted atomically, rejecting
      // with 409 if it was already converted elsewhere (cross-device guard).
      sourceQuotationId: convertingQuotation.id,
    };
    try {
      try {
        await addContract(contract);
      } catch (err: any) {
        // 409 = the quotation was already converted elsewhere — close the stale modal.
        if (err?.status === 409) setConvertingQuotation(null);
        console.error("Failed to create contract:", err);
        notify(
          `Failed to create contract: ${err?.message || "Server error. Please try again."}`,
        );
        return;
      }
      // The contract is live server-side (and the quotation was flipped there
      // atomically). Syncing the quotation locally cannot fail the conversion —
      // a PUT failure here is only a local-sync warning.
      const updatedQuotation: Invoice = {
        ...convertingQuotation,
        quoteStatus: QuoteStatus.Converted,
        convertedToContractId: contract.id,
        convertedAt: new Date().toISOString(),
      };
      try {
        await updateInvoice(updatedQuotation);
      } catch (err: any) {
        console.warn(
          "[convert-to-contract] Contract created; local quotation sync failed:",
          err,
        );
      }
      setInvoices(getInvoices());
      setConvertingQuotation(null);
      setConvertForm({ billboardId: "", startDate: "", endDate: "" });
      notify(
        `Contract ${contract.id} created from Quotation #${convertingQuotation.id}. The quotation has been preserved.`,
      );
    } finally {
      convertingToContractRef.current = false;
    }
  };

  const invoiceMonths = Array.from(new Set(invoices.map(i => i.date?.slice(0, 7)).filter(Boolean))).sort().reverse();
  const filteredDocs = invoices.filter((i) => {
    if (isConfigured()) return activeTab === 'Statements' ? false : true;
    const iType = String(i.type || "").toLowerCase();
    let matchesType = false;
    if (activeTab === "Invoices") matchesType = iType === "invoice";
    else if (activeTab === "Receipts") matchesType = iType === "receipt";
    const matchesMonth = invoiceMonth === "all" || i.date?.startsWith(invoiceMonth);
    const matchesStatus = invoiceStatus === "all" || String(i.status || '').toLowerCase() === invoiceStatus;
    const searchLower = searchTerm.toLowerCase();
    const clientName = String(
      allClients.find((c) => c.id === i.clientId)?.companyName || "",
    ).toLowerCase();
    const matchesSearch =
      String(i.id || "")
        .toLowerCase()
        .includes(searchLower) ||
      clientName.includes(searchLower) ||
      (i.paymentReference &&
        String(i.paymentReference).toLowerCase().includes(searchLower));
    return matchesType && matchesMonth && matchesStatus && matchesSearch;
  });
  const filteredDocsTotal = filteredDocs.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">
              {activeTab === "Receipts"
                ? "Receipts & Payments"
                : activeTab === "Statements"
                  ? "Client Statements"
                  : "Invoices"}
            </h2>
            <p className="text-slate-900 font-medium">
              {activeTab === "Statements"
                ? "Account balances, outstanding amounts, and statement PDFs per client"
                : activeTab === "Receipts"
                  ? "Payment receipts and collection history"
                  : "Create invoices, manage VAT, and track payment history"}
            </p>
          </div>
          {activeTab !== "Statements" && (
            <div className="flex gap-4 w-full sm:w-auto justify-end">
              <div className="relative group w-full sm:w-64">
                <Search
                  className="absolute left-3 top-3 text-slate-900 group-focus-within:text-slate-800 transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search ID, Client, Ref..."
                  className="min-h-11 w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-full bg-white text-slate-900 placeholder:text-slate-700 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all text-sm"
                />
                <select aria-label="Filter documents by month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} className="min-h-11 w-full sm:w-40 px-3 py-2.5 border border-slate-300 rounded-full bg-white text-slate-900 outline-none focus:border-slate-800 text-sm">
                  <option value="all">All months</option>
                  {invoiceMonths.map(month => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}
                </select>
                <select aria-label="Filter documents by status" value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)} className="min-h-11 w-full sm:w-36 px-3 py-2.5 border border-slate-300 rounded-full bg-white text-slate-900 outline-none focus:border-slate-800 text-sm">
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="rejected">Rejected</option>
                  <option value="voided">Voided</option>
                </select>
              </div>
              {canUserWrite && (
                <button
                  onClick={() => {
                    setSelectedInvoiceToPay("");
                    setFormData(getEmptyFormData());
                    setNewItem({ description: "", amount: 0 });
                    // The configured company VAT rate is the safest default for
                    // a new bill; a rental selection can still override it.
                    setHasVat(activeTab === "Invoices");
                    setDiscountType("amount");
                    setDiscountValue(0);
                    setDiscountDescription("");
                    setShowAdvancedFields(false);
                    setBillboardSelections({});
                    setBillboardSearch("");
                    resetQuoteFields();
                    dueDateProvenanceRef.current = "initial";
                    setIsModalOpen(true);
                  }}
                  className="min-h-11 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-md transition-colors"
                >
                  <Plus size={16} />{" "}
                  <span className="hidden sm:inline">
                    New {activeTab.slice(0, -1)}
                  </span>
                  <span className="sm:hidden">New</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabs — Quotations and Proformas moved to dedicated Quotations page */}
        <div className="border-b border-slate-200 overflow-x-auto no-scrollbar">
          <div className="flex gap-8 min-w-max">
            {(["Invoices", "Receipts", "Statements"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? "text-slate-900" : "text-slate-700 hover:text-slate-900"}`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900" />
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "Statements" &&
          (() => {
            const company = getCompanyProfile();
            const logo = getCompanyLogo();
            // Use React state (invoices) so re-renders trigger on subscribe updates
            // Normalize total to number and type to lowercase for application database compatibility
            const inv = (inv: any) =>
              Number(inv.total) || Number(inv.subtotal) || 0;
            const isInvoiceType = (i: any) =>
              String(i.type || "").toLowerCase() === "invoice";
            const isReceiptType = (i: any) =>
              String(i.type || "").toLowerCase() === "receipt";
            const isOverdueStatus = (i: any) =>
              String(i.status || "").toLowerCase() === "overdue";
            // clientId might come back as client_id from application database depending on schema
            const getClientId = (i: any) => i.clientId || i.client_id || "";

            const allContracts = getContracts();
            const allBillboards = getBillboards();
            const getBillboardName = (id: string) =>
              allBillboards.find((b) => b.id === id)?.name || id;

            // Portfolio totals from React invoices state
            const grandBilled = invoices
              .filter(isInvoiceType)
              .reduce((a, i) => a + inv(i), 0);
            const grandPaid = invoices
              .filter(isReceiptType)
              .reduce((a, i) => a + inv(i), 0);
            const grandOutstanding = grandBilled - grandPaid;

            return (
              <div className="space-y-6 animate-fade-in">
                {/* Company letterhead banner */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 flex items-center justify-between gap-4 shadow-lg">
                  <div className="flex items-center gap-4">
                    {logo && logo.startsWith("data:image") ? (
                      <img
                        src={logo}
                        alt="Logo"
                        className="w-14 h-14 rounded-xl object-contain border-2 border-white/20 shadow-md bg-white p-1.5"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-md border-2 border-white/20">
                        {company.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-white font-black text-xl tracking-tight">
                        {company.name}
                      </p>
                      <p className="text-slate-900 text-xs mt-0.5">
                        {company.address}, {company.city} &bull;{" "}
                        {company.country}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1.5">
                        {company.phone && (
                          <span className="flex items-center gap-1 text-slate-900 text-[10px]">
                            <Phone size={10} /> {company.phone}
                          </span>
                        )}
                        {company.email && (
                          <span className="flex items-center gap-1 text-slate-900 text-[10px]">
                            <Mail size={10} /> {company.email}
                          </span>
                        )}
                        {company.vatNumber && (
                          <span className="flex items-center gap-1 text-slate-900 text-[10px]">
                            <Building2 size={10} /> VAT: {company.vatNumber}
                          </span>
                        )}
                        {company.website && (
                          <span className="flex items-center gap-1 text-slate-900 text-[10px]">
                            <Globe size={10} /> {company.website}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Portfolio totals */}
                  <div className="hidden sm:flex gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-1">
                        Total Billed
                      </p>
                      <p className="text-lg font-black text-white">
                        ${grandBilled.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-1">
                        Collected
                      </p>
                      <p className="text-lg font-black text-emerald-400">
                        ${grandPaid.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-1">
                        Outstanding
                      </p>
                      <p
                        className={`text-lg font-black ${grandOutstanding > 0 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        ${grandOutstanding.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Per-client statement cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {allClients.map((client) => {
                    const clientInvoices = invoices.filter(
                      (i) => getClientId(i) === client.id,
                    );
                    const totalBilled = clientInvoices
                      .filter(isInvoiceType)
                      .reduce((acc, i) => acc + inv(i), 0);
                    const totalPaid = clientInvoices
                      .filter(isReceiptType)
                      .reduce((acc, i) => acc + inv(i), 0);
                    const outstanding = totalBilled - totalPaid;
                    const activeContracts = allContracts.filter(
                      (c) =>
                        (c.clientId || (c as any).client_id) === client.id &&
                        String(c.status || "").toLowerCase() === "active",
                    );
                    const overdueCount =
                      clientInvoices.filter(isOverdueStatus).length;
                    return (
                      <div
                        key={client.id}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col gap-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 text-lg leading-tight">
                              {client.companyName}
                            </p>
                            <p className="text-xs text-slate-900 mt-0.5">
                              {client.contactPerson} &bull; {client.email}
                            </p>
                          </div>
                          {overdueCount > 0 && (
                            <span className="shrink-0 px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-xl animate-pulse">
                              {overdueCount} Overdue
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-1">
                              Billed
                            </p>
                            <p className="text-base font-bold text-slate-800">
                              ${totalBilled.toLocaleString()}
                            </p>
                          </div>
                          <div className="bg-green-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-green-500 mb-1">
                              Paid
                            </p>
                            <p className="text-base font-bold text-green-700">
                              ${totalPaid.toLocaleString()}
                            </p>
                          </div>
                          <div
                            className={`rounded-xl p-3 ${outstanding > 0 ? "bg-red-50" : "bg-emerald-50"}`}
                          >
                            <p
                              className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${outstanding > 0 ? "text-red-400" : "text-emerald-500"}`}
                            >
                              Balance
                            </p>
                            <p
                              className={`text-base font-bold ${outstanding > 0 ? "text-red-600" : "text-emerald-700"}`}
                            >
                              ${outstanding.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {activeContracts.length > 0 && (
                          <p className="text-xs text-indigo-500 font-medium">
                            {activeContracts.length} active rental
                            {activeContracts.length > 1 ? "s" : ""}
                          </p>
                        )}
                        <button
                          onClick={() =>
                            generateStatementPDF(
                              client,
                              clientInvoices,
                              activeContracts,
                              getBillboardName,
                            )
                          }
                          className="mt-auto w-full py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"
                        >
                          <FileText size={14} /> Generate Statement PDF
                        </button>
                      </div>
                    );
                  })}
                  {allClients.length === 0 && (
                    <div className="col-span-3 py-16 text-center text-slate-900 italic">
                      No clients found. Data may still be loading from cloud.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        {activeTab !== "Statements" && (
          <>
            {pageError && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</div>}
            {isLoadingPage && <div className="py-8 text-center text-sm font-medium text-slate-700" role="status">Loading documents…</div>}
            {/* Mobile Cards */}
            <div className="lg:hidden grid grid-cols-1 gap-4">
              {filteredDocs.length > 0 ? (
                filteredDocs.map((doc) => {
                  const client = allClients.find((c) => c.id === doc.clientId);
                  const isQuote = (activeTab as string) === "Quotations";
                  const statusLabel =
                    isQuote && doc.quoteStatus ? doc.quoteStatus : doc.status;
                  const statusColor =
                    isQuote && doc.quoteStatus
                      ? doc.quoteStatus === "Draft"
                        ? "bg-slate-100 text-slate-700"
                        : doc.quoteStatus === "Sent"
                          ? "bg-indigo-100 text-indigo-700"
                          : doc.quoteStatus === "Accepted"
                            ? "bg-green-100 text-green-700"
                            : doc.quoteStatus === "Rejected"
                              ? "bg-red-100 text-red-700"
                              : doc.quoteStatus === "Expired"
                                ? "bg-amber-100 text-amber-700"
                                : doc.quoteStatus === "Converted"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-slate-100 text-slate-900"
                      : String(doc.status || "").toLowerCase() === "paid"
                        ? "bg-green-100 text-green-700"
                        : String(doc.status || "").toLowerCase() === "overdue"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700";
                  return (
                    <div
                      key={doc.id}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-slate-900">
                            {doc.quoteNumber || doc.id}
                          </p>
                          <p className="text-xs text-slate-900">
                            {client?.companyName || "Unknown"}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-900">Date</span>
                        <span className="font-medium">{doc.date}</span>
                      </div>
                      {isQuote && doc.expiryDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-900">Valid Until</span>
                          <span className="font-medium text-amber-600">
                            {doc.expiryDate}
                          </span>
                        </div>
                      )}
                      {activeTab === "Receipts" && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-900">Method</span>
                          <span className="font-medium">
                            {doc.paymentMethod || "-"}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-900">Total</span>
                        <span className="font-bold">
                          ${(doc.total ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          onClick={() => downloadPDF(doc)}
                          className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg"
                          title="Download PDF"
                        >
                          <Download size={15} /><span>Download</span>
                        </button>
                        <button
                          onClick={() => handleSendDoc(doc)}
                          className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
                          title="Send Email"
                        >
                          <Send size={15} /><span>Send</span>
                        </button>
                        {canUserWrite && (
                          <button
                            onClick={() => handleEdit(doc)}
                            className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                            title="Edit"
                          >
                            <Edit size={15} /><span>Edit</span>
                          </button>
                        )}
                        {canUserWrite &&
                          activeTab === "Invoices" &&
                          ["pending", "overdue"].includes(
                            String(doc.status || "").toLowerCase(),
                          ) && (
                            <button
                              onClick={() => initiatePayment(doc)}
                              className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg"
                              title="Record Payment"
                            >
                              <CreditCard size={15} /><span>Pay</span>
                            </button>
                          )}
                        {(activeTab as string) === "Quotations" && (
                          <>
                            {["Sent", "Accepted"].includes(
                              doc.quoteStatus || "",
                            ) && (
                              <button
                                onClick={async () => {
                                  if (convertingToInvoiceRef.current) return;
                                  if (
                                    !window.confirm(
                                      `Convert quotation ${doc.quoteNumber || doc.id} to an invoice? The original quotation will be preserved.`,
                                    )
                                  )
                                    return;
                                  convertingToInvoiceRef.current = true;
                                  try {
                                    const created =
                                      await convertQuotationToInvoice(doc.id);
                                    if (created) {
                                      setInvoices(getInvoices());
                                      notify(
                                        `Converted to Invoice ${created.id}`,
                                      );
                                    }
                                  } catch (err: any) {
                                    notify(
                                      `Failed: ${err?.message || "Server error. Please try again."}`,
                                    );
                                  } finally {
                                    convertingToInvoiceRef.current = false;
                                  }
                                }}
                                className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                                title="Convert to Invoice"
                              >
                                <ArrowRight size={15} /><span>Invoice</span>
                              </button>
                            )}
                            <button
                              onClick={() => openConvertToContract(doc)}
                              className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg"
                              title="Convert to Contract"
                            >
                              <FileText size={15} /><span>Contract</span>
                            </button>
                          </>
                        )}
                        {canDelete(getCurrentUser()) && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 size={15} /><span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-900 italic">
                  No documents found.
                </div>
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-900 min-w-[800px]">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                        Client / Info
                      </th>
                      {activeTab === "Receipts" && (
                        <>
                          <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                            Method
                          </th>
                          <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                            Ref #
                          </th>
                        </>
                      )}
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                        Total
                      </th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">
                        Status
                      </th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocs.length > 0 ? (
                      filteredDocs.map((doc) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 font-bold text-slate-900">
                            {doc.quoteNumber || doc.id}
                          </td>
                          <td className="px-6 py-4">{doc.date}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-700">
                                {allClients.find((c) => c.id === doc.clientId)
                                  ?.companyName || "Unknown Client"}
                              </span>
                              {doc.contractId && (
                                <span className="text-[10px] text-indigo-500 font-medium flex items-center gap-1">
                                  <Link2 size={10} /> Contract {doc.contractId}
                                </span>
                              )}
                              {(activeTab as string) === "Quotations" &&
                                doc.expiryDate && (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    Valid until {doc.expiryDate}
                                  </span>
                                )}
                            </div>
                          </td>
                          {activeTab === "Receipts" && (
                            <>
                              <td className="px-6 py-4 text-xs">
                                {doc.paymentMethod || "-"}
                              </td>
                              <td className="px-6 py-4 text-xs font-mono">
                                {doc.paymentReference || "-"}
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 text-right font-bold text-slate-900">
                            ${(doc.total ?? 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {(activeTab as string) === "Quotations" &&
                            doc.quoteStatus ? (
                              <span
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  doc.quoteStatus === "Draft"
                                    ? "bg-slate-100 text-slate-700"
                                    : doc.quoteStatus === "Sent"
                                      ? "bg-indigo-100 text-indigo-700"
                                      : doc.quoteStatus === "Accepted"
                                        ? "bg-green-100 text-green-700"
                                        : doc.quoteStatus === "Rejected"
                                          ? "bg-red-100 text-red-700"
                                          : doc.quoteStatus === "Expired"
                                            ? "bg-amber-100 text-amber-700"
                                            : doc.quoteStatus === "Converted"
                                              ? "bg-purple-100 text-purple-700"
                                              : "bg-slate-100 text-slate-900"
                                }`}
                              >
                                {doc.quoteStatus}
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${String(doc.status || "").toLowerCase() === "paid" ? "bg-green-100 text-green-700" : String(doc.status || "").toLowerCase() === "overdue" ? "bg-red-100 text-red-700 animate-pulse" : String(doc.status || "").toLowerCase() === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-900"}`}
                              >
                                {doc.status}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap justify-center gap-2">
                            {" "}
                            <button
                              onClick={() => downloadPDF(doc)}
                            className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-900 hover:text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download size={15} /><span>Download</span>
                            </button>
                            <button
                              onClick={() => handleSendDoc(doc)}
                              className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                              title="Send via Email"
                            >
                              <Send size={15} /><span>Send</span>
                            </button>
                            <button
                              onClick={() => handleEdit(doc)}
                              className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit size={15} /><span>Edit</span>
                            </button>
                            {activeTab === "Invoices" &&
                              ["pending", "overdue"].includes(
                                String(doc.status || "").toLowerCase(),
                              ) && (
                                <button
                                  onClick={() => initiatePayment(doc)}
                                  className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                  title="Record Payment"
                                >
                                  <CreditCard size={15} /><span>Pay</span>
                                </button>
                              )}
                            {(activeTab as string) === "Quotations" && (
                              <>
                                {["Sent", "Accepted"].includes(
                                  doc.quoteStatus || "",
                                ) && (
                                  <button
                                    onClick={async () => {
                                      if (convertingToInvoiceRef.current)
                                        return;
                                      if (
                                        !window.confirm(
                                          `Convert quotation ${doc.quoteNumber || doc.id} to an invoice? The original quotation will be preserved.`,
                                        )
                                      )
                                        return;
                                      convertingToInvoiceRef.current = true;
                                      try {
                                        const created =
                                          await convertQuotationToInvoice(
                                            doc.id,
                                          );
                                        if (created) {
                                          setInvoices(getInvoices());
                                          notify(
                                            `Converted to Invoice ${created.id}`,
                                          );
                                        }
                                      } catch (err: any) {
                                        notify(
                                          `Failed: ${err?.message || "Server error. Please try again."}`,
                                        );
                                      } finally {
                                        convertingToInvoiceRef.current = false;
                                      }
                                    }}
                                    className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                    title="Convert to Invoice"
                                  >
                                    <ArrowRight size={15} /><span>Invoice</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => openConvertToContract(doc)}
                                  className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                  title="Convert to Contract"
                                >
                                  <FileText size={15} /><span>Contract</span>
                                </button>
                              </>
                            )}
                            {(activeTab as string) === "Proformas" && (
                              <button
                                onClick={async () => {
                                  try {
                                    await convertInvoiceType(doc.id, "Invoice");
                                    setInvoices(getInvoices());
                                  } catch (err: any) {
                                    notify(
                                      `Failed: ${err?.message || "Server error. Please try again."}`,
                                    );
                                  }
                                }}
                                className="inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                title="Convert to Invoice"
                              >
                                <ArrowRight size={15} /><span>Invoice</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(doc)}
                              className={`inline-flex min-h-10 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ${!canDelete(getCurrentUser()) ? "hidden" : ""}`}
                              title="Delete"
                            >
                              <Trash2 size={15} /><span>Delete</span>
                            </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={activeTab === "Receipts" ? 8 : 6}
                          className="px-6 py-12 text-center text-slate-900 italic"
                        >
                          No documents found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <PaginationControls pagination={pagination} onPageChange={setPage} disabled={isLoadingPage} />
          </>
        )}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all w-full sm:my-8 sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl border border-white/20 max-h-[92vh] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="finance-document-title"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <h3 id="finance-document-title" className="text-xl font-bold text-slate-900">
                  {editingInvoice
                    ? `Edit ${editingInvoice.type}`
                    : `Create New ${activeTab.slice(0, -1)}`}
                </h3>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingInvoice(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  aria-label="Close document form"
                >
                  <X size={20} className="text-slate-900" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-4">
                {activeTab === "Receipts" && (
                  <div className="p-4 bg-green-50 rounded-xl border border-green-100 mb-2">
                    <MinimalSelect
                      label="Link to Pending Invoice"
                      value={selectedInvoiceToPay}
                      onChange={(e: any) => handleInvoiceSelect(e.target.value)}
                      options={[
                        { value: "", label: "Select Invoice to Pay..." },
                        ...getInvoices()
                          .filter(
                            (i) =>
                              String(i.status || "").toLowerCase() ===
                                "pending" &&
                              String(i.type || "").toLowerCase() === "invoice",
                          )
                          .map((i) => ({
                            value: i.id,
                            label: `Inv #${i.id} - $${i.total} (${allClients.find((c) => c.id === i.clientId)?.companyName})`,
                          })),
                      ]}
                    />
                  </div>
                )}
                {activeTab !== "Receipts" && (
                  <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 mb-2">
                    <MinimalSelect
                      label="Link to Active Rental (Optional)"
                      value={formData.contractId}
                      onChange={(e: any) => handleRentalSelect(e.target.value)}
                      options={[
                        { value: "", label: "Select Rental to Auto-fill..." },
                        ...getContracts().map((c) => {
                          const cl = allClients.find(
                            (x) => x.id === c.clientId,
                          );
                          const billboard = getBillboards().find(
                            (b) => b.id === c.billboardId,
                          );
                          return {
                            value: c.id,
                            label: `${cl?.companyName} - ${billboard?.name} (${c.details})`,
                          };
                        }),
                      ]}
                    />
                    <p className="mt-3 text-xs text-slate-700">
                      Select a rental to apply its client, billed line item, and VAT setting.
                    </p>
                  </div>
                )}
                <div
                  className={`grid grid-cols-1 gap-3 sm:gap-4 ${
                    activeTab === "Invoices"
                      ? "sm:grid-cols-3"
                      : "sm:grid-cols-2"
                  }`}
                >
                  <MinimalSelect
                    label="Client"
                    value={formData.clientId}
                    onChange={(e: any) => handleClientSelect(e.target.value)}
                    options={[
                      { value: "", label: "Select Client..." },
                      ...allClients.map((c) => ({
                        value: c.id,
                        label: c.companyName,
                      })),
                    ]}
                  />
                  <MinimalInput
                    label="Date"
                    type="date"
                    value={formData.date}
                    onChange={(e: any) => {
                      const nextDate = e.target.value;
                      setFormData((previous) => {
                        const shouldRefreshDue =
                          activeTab === "Invoices" &&
                          Boolean(previous.clientId) &&
                          dueDateProvenanceRef.current === "auto";
                        return {
                          ...previous,
                          date: nextDate,
                          dueDate: shouldRefreshDue
                            ? getClientDueDate(previous.clientId || "", nextDate)
                            : previous.dueDate,
                        };
                      });
                    }}
                  />
                  {activeTab === "Invoices" && (
                    <MinimalInput
                      label="Payment Due"
                      type="date"
                      value={formData.dueDate || ""}
                      onChange={(e: any) => {
                        dueDateProvenanceRef.current = e.target.value
                          ? "manual-set"
                          : "manual-cleared";
                        setFormData({ ...formData, dueDate: e.target.value });
                      }}
                    />
                  )}
                </div>
                {activeTab === "Invoices" && formData.clientId && (
                  <p className="-mt-1 text-xs text-slate-700">
                    {dueDateProvenanceRef.current === "manual-set"
                      ? "Payment due date was entered manually."
                      : dueDateProvenanceRef.current === "manual-cleared"
                        ? "You chose not to add a payment due date."
                        : dueDateProvenanceRef.current === "existing"
                          ? "Existing payment due date from this invoice."
                        : dueDateProvenanceRef.current === "auto" &&
                            formData.dueDate
                          ? "Payment due date was derived from the client billing profile and can be adjusted."
                          : "If left blank, the standard 30-day payment term will be applied."}
                  </p>
                )}
                {activeTab === "Receipts" && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Payment audit trail
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MinimalSelect
                        label="Payment Method"
                        value={formData.paymentMethod}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            paymentMethod: e.target.value,
                          })
                        }
                        options={[
                          { value: "Bank Transfer", label: "Bank Transfer" },
                          { value: "Cash", label: "Cash" },
                          { value: "EcoCash", label: "EcoCash" },
                          { value: "Other", label: "Other" },
                        ]}
                      />
                      <MinimalInput
                        label="Reference Number *"
                        required
                        value={formData.paymentReference}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            paymentReference: e.target.value,
                          })
                        }
                      />
                      <MinimalInput
                        label="Received By *"
                        required
                        value={formData.receivedBy}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            receivedBy: e.target.value,
                          })
                        }
                      />
                      {isBankPaymentMethod(formData.paymentMethod) && (
                        <MinimalInput
                          label="Receiving Bank Account *"
                          required
                          value={formData.receivingAccount}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              receivingAccount: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                        Proof of Payment{" "}
                        {isBankPaymentMethod(formData.paymentMethod)
                          ? "*"
                          : "(Optional)"}
                      </label>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        required={
                          isBankPaymentMethod(formData.paymentMethod) &&
                          !(editingInvoice?.hasPaymentProof ?? Boolean(editingInvoice?.proofPaymentUrl))
                        }
                        onChange={(e) =>
                          setPaymentProofFile(e.target.files?.[0] || null)
                        }
                        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
                      />
                      <p className="mt-2 text-[10px] text-slate-700">
                        PDF/JPEG/PNG/WebP, maximum 7 MB. The recorder identity
                        and upload time are captured automatically.
                      </p>
                      {(editingInvoice?.hasPaymentProof ?? Boolean(editingInvoice?.proofPaymentUrl)) && (
                        <button
                          type="button"
                          onClick={() => openPaymentProof(editingInvoice.id).catch(error => notify(error.message))}
                          className="mt-2 inline-block text-xs font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          View existing proof
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-3 border border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Line Items
                  </h4>
                  {(() => {
                    const allBillboards = getBillboards();
                    const search = billboardSearch.toLowerCase();
                    const filteredBillboards = search
                      ? allBillboards.filter(
                          (b) =>
                            String(b.name || "")
                              .toLowerCase()
                              .includes(search) ||
                            String(b.location || "")
                              .toLowerCase()
                              .includes(search) ||
                            String(b.town || "")
                              .toLowerCase()
                              .includes(search),
                        )
                      : allBillboards;
                    const hasSelections = Object.values(
                      billboardSelections,
                    ).some(
                      (s) => s.sideA || s.sideB || (s.slots && s.slots > 0),
                    );
                    return (
                      <div className="bg-white rounded-xl p-3 border border-indigo-100 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                            <Building2 size={14} /> Select Billboards
                          </h5>
                          <span className="text-[10px] text-slate-900">
                            Pick one or many
                          </span>
                        </div>
                        <div className="relative">
                          <Search
                            className="absolute left-3 top-2.5 text-slate-900"
                            size={14}
                          />
                          <input
                            type="text"
                            placeholder="Search by name, location, or town..."
                            value={billboardSearch}
                            onChange={(e) => setBillboardSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                          {filteredBillboards.length === 0 ? (
                            <p className="text-center text-xs text-slate-900 italic py-6">
                              No billboards found
                            </p>
                          ) : (
                            filteredBillboards.map((b) => {
                              const sel = billboardSelections[b.id] || {};
                              const isLED = b.type === BillboardType.LED;
                              const availSlots = Math.max(
                                0,
                                (b.totalSlots || 0) - (b.rentedSlots || 0),
                              );
                              return (
                                <div
                                  key={b.id}
                                  className="bg-slate-50 rounded-xl p-2 border border-slate-200"
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate">
                                        {b.name}
                                      </p>
                                      <p className="text-[11px] text-slate-900 truncate">
                                        {b.location}, {b.town}
                                      </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                                      {b.type}
                                    </span>
                                  </div>
                                  {isLED ? (
                                    <div className="flex items-center justify-between gap-3 bg-white rounded-xl p-1.5 border border-slate-200">
                                      <div className="min-w-0">
                                        <p className="text-[10px] text-slate-900 font-bold uppercase tracking-wider">
                                          Slots
                                        </p>
                                        <p className="text-[11px] text-slate-900">
                                          Rate:{" "}
                                          <span className="font-bold text-slate-800">
                                            $
                                            {(
                                              b.ratePerSlot || 0
                                            ).toLocaleString()}
                                          </span>
                                          /slot · {availSlots} of{" "}
                                          {b.totalSlots || 0} available
                                        </p>
                                      </div>
                                      <input
                                        type="number"
                                        min={0}
                                        value={sel.slots || 0}
                                        onChange={(e) =>
                                          setBillboardSlots(
                                            b.id,
                                            Number(e.target.value),
                                          )
                                        }
                                        className="w-20 px-2 py-1.5 text-center text-sm font-bold border border-slate-200 rounded-xl focus:border-slate-800 outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                      <label
                                        className={`flex items-center gap-2 p-1.5 rounded-xl cursor-pointer transition-all border ${sel.sideA ? "border-slate-800 bg-slate-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!!sel.sideA}
                                          onChange={() =>
                                            toggleBillboardSide(b.id, "A")
                                          }
                                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-bold uppercase text-slate-900 tracking-wider">
                                            Side A
                                          </p>
                                          <p className="text-xs font-bold text-slate-800">
                                            $
                                            {(
                                              b.sideARate || 0
                                            ).toLocaleString()}
                                          </p>
                                        </div>
                                        {b.sideAStatus && (
                                          <span
                                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${b.sideAStatus === "Available" ? "bg-green-100 text-green-700" : b.sideAStatus === "Rented" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-900"}`}
                                          >
                                            {b.sideAStatus}
                                          </span>
                                        )}
                                      </label>
                                      <label
                                        className={`flex items-center gap-2 p-1.5 rounded-xl cursor-pointer transition-all border ${sel.sideB ? "border-slate-800 bg-slate-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!!sel.sideB}
                                          onChange={() =>
                                            toggleBillboardSide(b.id, "B")
                                          }
                                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-bold uppercase text-slate-900 tracking-wider">
                                            Side B
                                          </p>
                                          <p className="text-xs font-bold text-slate-800">
                                            $
                                            {(
                                              b.sideBRate || 0
                                            ).toLocaleString()}
                                          </p>
                                        </div>
                                        {b.sideBStatus && (
                                          <span
                                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${b.sideBStatus === "Available" ? "bg-green-100 text-green-700" : b.sideBStatus === "Rented" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-900"}`}
                                          >
                                            {b.sideBStatus}
                                          </span>
                                        )}
                                      </label>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                        {hasSelections && (
                          <button
                            type="button"
                            onClick={addSelectedBillboards}
                            className="w-full bg-slate-900 text-white rounded-xl px-4 py-2.5 hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider transition-all"
                          >
                            <Plus size={16} /> Add Selected to Line Items
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900">
                      Or Add Custom Line
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
                    <div className="flex-1">
                      <MinimalTextarea
                        label="Description / Details"
                        value={newItem.description}
                        onChange={(e: any) =>
                          setNewItem({
                            ...newItem,
                            description: e.target.value,
                          })
                        }
                        rows={2}
                      />
                    </div>
                    <div>
                      <MinimalInput
                        label="Amount ($)"
                        type="number"
                        value={newItem.amount}
                        onChange={(e: any) =>
                          setNewItem({
                            ...newItem,
                            amount: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      className="bg-slate-900 text-white rounded-xl px-4 py-3 hover:bg-slate-800 flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Add
                    </button>
                  </div>
                  {formData.items && formData.items.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {formData.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-xl border border-slate-200 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
                              Line Item {idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-2 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="Remove line item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <MinimalTextarea
                            label="Description / Details"
                            value={item.description}
                            onChange={(e: any) =>
                              updateItem(idx, "description", e.target.value)
                            }
                            rows={2}
                          />
                          <div className="w-full md:w-40">
                            <MinimalInput
                              label="Amount ($)"
                              type="number"
                              value={item.amount}
                              onChange={(e: any) =>
                                updateItem(idx, "amount", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="hasVatCheckbox"
                    type="checkbox"
                    checked={hasVat}
                    disabled={
                      activeTab === "Receipts" && !!selectedInvoiceToPay
                    }
                    onChange={(e) => setHasVat(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                  <label
                    htmlFor="hasVatCheckbox"
                    className="text-sm font-medium text-slate-900 cursor-pointer select-none"
                  >
                    Amounts include VAT ({vatPct})
                  </label>
                </div>
                {(activeTab as string) === "Quotations" && (
                  <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100">
                    <MinimalInput
                      label="Expiry Date"
                      type="date"
                      value={expiryDate}
                      onChange={(e: any) => setExpiryDate(e.target.value)}
                    />
                  </div>
                )}
                <details
                  className="bg-white rounded-2xl border border-slate-100"
                  open={showAdvancedFields}
                  onToggle={(event) => setShowAdvancedFields(event.currentTarget.open)}
                >
                  <summary className="min-h-11 cursor-pointer list-none px-4 sm:px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-inset rounded-2xl">
                    Advanced options
                    <span className="normal-case font-medium tracking-normal text-slate-700">
                      Optional discounts and quotation notes
                    </span>
                  </summary>
                  <div className="border-t border-slate-100 p-4 sm:p-5 space-y-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          Discount
                        </h4>
                        {receiptIsLinkedToInvoice && (
                          <span className="text-[11px] font-medium text-slate-900">
                            Locked for linked invoice receipts
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <MinimalSelect
                          label="Discount Type"
                          value={discountType}
                          disabled={receiptIsLinkedToInvoice}
                          onChange={(e: any) => setDiscountType(e.target.value)}
                          options={[
                            { value: "amount", label: "Fixed Amount" },
                            { value: "percentage", label: "Percentage %" },
                          ]}
                        />
                        <MinimalInput
                          label={
                            discountType === "percentage"
                              ? "Discount %"
                              : "Discount Amount ($)"
                          }
                          type="number"
                          disabled={receiptIsLinkedToInvoice}
                          value={discountValue}
                          onChange={(e: any) =>
                            setDiscountValue(Number(e.target.value))
                          }
                        />
                      </div>
                      <MinimalInput
                        label="Discount Note (Optional)"
                        disabled={receiptIsLinkedToInvoice}
                        value={discountDescription}
                        onChange={(e: any) =>
                          setDiscountDescription(e.target.value)
                        }
                      />
                      {receiptIsLinkedToInvoice && (
                        <p className="text-xs text-slate-900">
                          To keep balances correct, linked receipts use the invoice
                          amount exactly.
                        </p>
                      )}
                    </div>
                    {(activeTab as string) === "Quotations" && (
                      <div className="border-t border-slate-100 pt-5 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          Quotation Notes
                        </h4>
                        <MinimalTextarea
                          label="Terms & Conditions"
                          value={terms}
                          onChange={(e: any) => setTerms(e.target.value)}
                          rows={2}
                        />
                        <MinimalTextarea
                          label="Internal Notes"
                          value={notes}
                          onChange={(e: any) => setNotes(e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </details>
                <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">Subtotal</span>
                    <span className="font-semibold">
                      ${subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">Discount</span>
                    <span className="font-semibold">
                      -${discountAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-200">VAT</span>
                    <span className="font-semibold">
                      ${vatAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider">
                      Total
                    </span>
                    <span className="text-xl font-black">
                      ${total.toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={proofUploading}
                  className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"
                >
                  <Save size={18} />{" "}
                  {proofUploading
                    ? "Uploading proof…"
                    : editingInvoice
                      ? `Update ${editingInvoice.type}`
                      : `Create ${activeTab.slice(0, -1)}`}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {convertingQuotation && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setConvertingQuotation(null)}
          />
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Convert Quotation to Contract
                  </h3>
                  <p className="text-xs text-slate-900 mt-0.5">
                    QT #{convertingQuotation.id} —{" "}
                    {
                      allClients.find(
                        (c) => c.id === convertingQuotation.clientId,
                      )?.companyName
                    }
                  </p>
                </div>
                <button
                  onClick={() => setConvertingQuotation(null)}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} className="text-slate-900" />
                </button>
              </div>
              <form
                onSubmit={handleConvertToContract}
                className="p-6 space-y-4"
              >
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                    From Quotation
                  </p>
                  {convertingQuotation.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-900">{item.description}</span>
                      <span className="font-bold">
                        ${item.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2">
                    <span>Total</span>
                    <span>
                      ${(convertingQuotation.total ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <MinimalSelect
                  label="Billboard"
                  value={convertForm.billboardId}
                  onChange={(e: any) =>
                    setConvertForm({
                      ...convertForm,
                      billboardId: e.target.value,
                    })
                  }
                  options={[
                    { value: "", label: "Select Billboard..." },
                    ...getBillboards().map((b) => ({
                      value: b.id,
                      label: `${b.name} (${b.town})`,
                    })),
                  ]}
                />
                <div className="grid grid-cols-2 gap-4">
                  <MinimalInput
                    label="Start Date"
                    type="date"
                    value={convertForm.startDate}
                    onChange={(e: any) =>
                      setConvertForm({
                        ...convertForm,
                        startDate: e.target.value,
                      })
                    }
                    required
                  />
                  <MinimalInput
                    label="End Date"
                    type="date"
                    value={convertForm.endDate}
                    onChange={(e: any) =>
                      setConvertForm({
                        ...convertForm,
                        endDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-wider hover:bg-slate-800 transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <FileText size={18} /> Create Contract & Archive Quotation
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {sendModal &&
        (() => {
          const { doc, client } = sendModal;
          const docType = (doc.type || "Invoice").toLowerCase() as any;
          const { subject, message } = buildDocSendDefaults(doc);
          const typeLabel = doc.type || "Invoice";
          return (
            <SendDocumentModal
              isOpen={true}
              onClose={() => setSendModal(null)}
              documentType={docType}
              documentId={doc.id}
              documentLabel={`${typeLabel} #${doc.id}`}
              clientName={client.companyName}
              clientEmail={client.email}
              defaultSubject={subject}
              defaultMessage={message}
              onSent={({ to }) => {
                notify(`${typeLabel} sent to ${to}`);
              }}
            />
          );
        })()}
    </>
  );
};
