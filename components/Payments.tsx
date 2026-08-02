import React, { useState, useEffect } from "react";
import {
  getClients,
  getInvoices,
  getClientFinancials,
  getTransactions,
  getContracts,
  getBillboards,
  addInvoice,
  getUpcomingBillings,
  deleteInvoice,
  logAction,
} from "../services/mockData";
import {
  generateStatementPDF,
  generatePaymentSchedulePDF,
} from "../services/pdfGenerator";
import { sendDocumentEmail } from "../services/documentEmail";
import { SendDocumentModal } from "./SendDocumentModal";
import { Client, Invoice, Contract } from "../types";
import { splitInclusiveVat } from "../services/constants";
import {
  Download,
  CheckCircle,
  AlertCircle,
  Search,
  CreditCard,
  X,
  Check,
  Hash,
  Wallet,
  Clock,
  Calendar,
  Trash2,
  ReceiptText,
  Send,
} from "lucide-react";
import { getCurrentUser } from "../services/authServiceSecure";
import { canDelete } from "../utils/settingsAccess";
import {
  uploadPaymentProof,
  isBankPaymentMethod,
  openPaymentProof,
} from "../services/paymentProof";

const MinimalInput = ({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
  icon: Icon,
}: any) => (
  <div className="group relative pt-6">
    <div className="absolute top-9 left-0 text-slate-900">
      {Icon && <Icon size={18} />}
    </div>
    <input
      type={type}
      required={required}
      value={value}
      onChange={onChange}
      placeholder={placeholder || " "}
      className={`peer w-full py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent focus:placeholder-slate-300 ${Icon ? "pl-8" : "px-0"}`}
    />
    <label
      className={`absolute left-0 top-1 text-xs text-slate-900 font-medium transition-all uppercase tracking-wide peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-9 peer-focus:top-1 peer-focus:text-xs peer-focus:text-slate-800 pointer-events-none ${Icon ? "peer-placeholder-shown:left-8 peer-focus:left-0" : ""}`}
    >
      {label}
    </label>
  </div>
);
const MinimalSelect = ({
  label,
  value,
  onChange,
  options,
  icon: Icon,
}: any) => (
  <div className="group relative pt-6">
    <div className="absolute top-9 left-0 text-slate-900 pointer-events-none z-10">
      {Icon && <Icon size={18} />}
    </div>
    <select
      value={value}
      onChange={onChange}
      className={`peer w-full py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer ${Icon ? "pl-8" : "px-0"}`}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <label
      className={`absolute left-0 top-1 text-xs text-slate-900 font-medium uppercase tracking-wide transition-all ${Icon ? "left-0" : ""}`}
    >
      {label}
    </label>
  </div>
);

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const Payments: React.FC = () => {
  const currentUser = getCurrentUser();
  const canUserDelete = canDelete(currentUser);
  const defaultReceiver = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const [activeTab, setActiveTab] = useState<
    "Monthly" | "Invoices" | "History" | "Statements" | "Schedule"
  >("Monthly");
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allReceipts, setAllReceipts] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Paid" | "Pending" | "Overdue"
  >("All");

  // Existing invoice payment modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentDetails, setPaymentDetails] = useState({
    method: "Bank Transfer",
    reference: "",
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    receivedBy: defaultReceiver,
    receivingAccount: "",
  });
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [monthlyProofFile, setMonthlyProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);

  // Monthly payment modal
  const [monthlyContract, setMonthlyContract] = useState<Contract | null>(null);
  const today = new Date();
  const [monthlyForm, setMonthlyForm] = useState({
    month: today.getMonth(),
    year: today.getFullYear(),
    amount: 0,
    date: today.toISOString().split("T")[0],
    method: "Bank Transfer",
    reference: "",
    receivedBy: defaultReceiver,
    receivingAccount: "",
  });

  const clients = getClients();
  const upcomingBillings = getUpcomingBillings();
  const activeContracts = getContracts().filter(
    (c) => String(c.status || "").toLowerCase() === "active",
  );

  const getBillboardName = (id: string) =>
    getBillboards().find((b) => b.id === id)?.name || "Unknown";

  const refreshInvoices = () => {
    const allDocs = getInvoices();
    setAllInvoices(
      allDocs.filter((i) => String(i.type || "").toLowerCase() === "invoice"),
    );
    setAllReceipts(
      allDocs.filter((i) => String(i.type || "").toLowerCase() === "receipt"),
    );
  };

  const outstandingAmount = (invoice: Invoice) => {
    const paid = allReceipts
      .filter((r) => !r.isVoided && r.linkedInvoiceId === invoice.id)
      .reduce((sum, r) => sum + Number(r.total || 0), 0);
    return Math.max(
      0,
      Math.round((Number(invoice.total || 0) - paid) * 100) / 100,
    );
  };

  useEffect(() => {
    refreshInvoices();
  }, [activeTab, selectedInvoice, monthlyContract]);

  const getClientName = (id: string) =>
    clients.find((c) => c.id === id)?.companyName || "Unknown";

  const [sendModal, setSendModal] = useState<{
    invoice: Invoice;
    client: Client;
  } | null>(null);
  const handleSendInvoice = (invoice: Invoice) => {
    const client = clients.find((c) => c.id === invoice.clientId);
    if (!client) {
      alert("Client not found");
      return;
    }
    setSendModal({ invoice, client });
  };

  const buildSendDefaults = (invoice: Invoice, client: Client) => {
    const typeLabel = invoice.type || "Invoice";
    const brand = "Dreambox Advertising";
    const subject = `${typeLabel} #${invoice.id.slice(0, 8)} — $${(invoice.total ?? 0).toLocaleString()} | ${brand}`;
    const message =
      String(typeLabel).toLowerCase() === "quotation"
        ? `Please find your quotation from ${brand} below. This quote is valid for 30 days. A PDF copy is attached.`
        : String(typeLabel).toLowerCase() === "receipt"
          ? `Thank you for your payment. Here is your receipt from ${brand}. A PDF copy is attached.`
          : `Please find your invoice from ${brand} below. Payment is due at your earliest convenience. A PDF copy is attached.`;
    return { subject, message };
  };

  // Check if a monthly payment has already been logged for a contract+month+year
  const isMonthPaid = (contractId: string, month: number, year: number) => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return (
      allInvoices.some(
        (i) =>
          i.contractId === contractId &&
          i.date.startsWith(prefix) &&
          String(i.status || "").toLowerCase() === "paid",
      ) ||
      allReceipts.some(
        (i) => i.contractId === contractId && i.date.startsWith(prefix),
      )
    );
  };

  const openMonthlyModal = (contract: Contract) => {
    const monthlyTotal = contract.monthlyRate;
    setMonthlyForm({
      month: today.getMonth(),
      year: today.getFullYear(),
      amount: Math.round(monthlyTotal * 100) / 100,
      date: today.toISOString().split("T")[0],
      method: "Bank Transfer",
      reference: "",
      receivedBy: defaultReceiver,
      receivingAccount: "",
    });
    setMonthlyProofFile(null);
    setMonthlyContract(contract);
  };

  const confirmMonthlyPayment = async () => {
    if (!monthlyContract) return;
    const {
      month,
      year,
      amount,
      date,
      method,
      reference,
      receivedBy,
      receivingAccount,
    } = monthlyForm;
    if (!receivedBy.trim()) {
      alert("Who received the payment is required.");
      return;
    }
    if (!reference.trim()) {
      alert("Payment reference is required.");
      return;
    }
    if (isBankPaymentMethod(method) && !receivingAccount.trim()) {
      alert("Receiving bank account is required for bank payments.");
      return;
    }
    if (isBankPaymentMethod(method) && !monthlyProofFile) {
      alert("Attach proof of payment before posting a bank payment.");
      return;
    }
    let proof = null;
    if (monthlyProofFile) {
      setProofUploading(true);
      try {
        proof = await uploadPaymentProof(monthlyProofFile);
      } catch (e: any) {
        alert(e?.message || "Proof upload failed.");
        return;
      } finally {
        setProofUploading(false);
      }
    }
    const monthStr = String(month + 1).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}`;
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;
    const clientName = getClientName(monthlyContract.clientId);

    // Create invoice (billed) + receipt (paid) in one step
    const invoiceId = `INV-${monthlyContract.id}-${datePrefix}`;
    const receiptId = `RCT-${Date.now()}`;

    // Only create invoice if one doesn't exist for this month yet
    const invoiceExists = allInvoices.some((i) => i.id === invoiceId);
    let invoiceForPayment = allInvoices.find((i) => i.id === invoiceId);
    if (!invoiceExists) {
      // monthlyRate / amount is VAT-inclusive; split it into net + VAT.
      const { subtotal, vat: vatAmount } = monthlyContract.hasVat
        ? splitInclusiveVat(amount)
        : { subtotal: amount, vat: 0 };
      const invoice: Invoice = {
        id: invoiceId,
        contractId: monthlyContract.id,
        clientId: monthlyContract.clientId,
        date: date,
        items: [
          {
            description: `Monthly Rental — ${monthLabel} (${monthlyContract.details || getBillboardName(monthlyContract.billboardId)})`,
            amount,
          },
        ],
        subtotal,
        vatAmount,
        total: amount,
        status: "Pending",
        type: "Invoice",
      };
      try {
        invoiceForPayment = await addInvoice(invoice);
      } catch (err: any) {
        alert(`Failed: ${err?.message || "Server error. Please try again."}`);
        return;
      }
    }

    const receipt: Invoice = {
      id: receiptId,
      contractId: monthlyContract.id,
      clientId: monthlyContract.clientId,
      date,
      items: [
        { description: `Payment — ${monthLabel} (${clientName})`, amount },
      ],
      subtotal: amount,
      vatAmount: 0,
      total: amount,
      status: "Paid",
      type: "Receipt",
      linkedInvoiceId: invoiceForPayment?.id,
      paymentMethod: method as any,
      paymentReference: reference || undefined,
      receivedBy,
      receivingAccount: receivingAccount || undefined,
      proofPaymentUrl: proof?.url,
      proofOriginalName: proof?.originalName,
      proofMimeType: proof?.mimeType,
      proofUploadedAt: proof?.uploadedAt,
    };
    try {
      await addInvoice(receipt);
    } catch (err: any) {
      alert(`Failed: ${err?.message || "Server error. Please try again."}`);
      return;
    }
    logAction(
      "Payment",
      `Monthly payment of $${amount.toLocaleString()} received from ${clientName} for ${monthLabel} — ${reference ? `Ref: ${reference}` : method}`,
    );
    setMonthlyContract(null);
    setMonthlyProofFile(null);
    refreshInvoices();
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentProofFile(null);
    setPaymentDetails({
      method: "Bank Transfer",
      reference: "",
      date: new Date().toISOString().split("T")[0],
      amount: outstandingAmount(invoice),
      receivedBy: defaultReceiver,
      receivingAccount: "",
    });
  };
  const confirmPayment = async () => {
    if (selectedInvoice) {
      if (!paymentDetails.receivedBy.trim()) {
        alert("Who received the payment is required.");
        return;
      }
      const outstanding = outstandingAmount(selectedInvoice);
      const amount = Math.round(Number(paymentDetails.amount || 0) * 100) / 100;
      if (amount <= 0) {
        alert("Enter a valid payment amount.");
        return;
      }
      if (amount - outstanding > 0.01) {
        alert(
          `Payment exceeds the outstanding balance of $${outstanding.toFixed(2)}.`,
        );
        return;
      }
      if (!paymentDetails.reference.trim()) {
        alert("Payment reference is required.");
        return;
      }
      if (
        isBankPaymentMethod(paymentDetails.method) &&
        !paymentDetails.receivingAccount.trim()
      ) {
        alert("Receiving bank account is required for bank payments.");
        return;
      }
      if (isBankPaymentMethod(paymentDetails.method) && !paymentProofFile) {
        alert("Attach proof of payment before posting a bank payment.");
        return;
      }
      let proof = null;
      if (paymentProofFile) {
        setProofUploading(true);
        try {
          proof = await uploadPaymentProof(paymentProofFile);
        } catch (e: any) {
          alert(e?.message || "Proof upload failed.");
          return;
        } finally {
          setProofUploading(false);
        }
      }
      const clientName = getClientName(selectedInvoice.clientId);
      const receipt: Invoice = {
        id: `RCT-${Date.now()}`,
        clientId: selectedInvoice.clientId,
        date: paymentDetails.date,
        items: [
          { description: `Payment for Invoice #${selectedInvoice.id}`, amount },
        ],
        linkedInvoiceId: selectedInvoice.id,
        subtotal: amount,
        vatAmount: 0,
        total: amount,
        status: "Paid",
        type: "Receipt",
        contractId: selectedInvoice.contractId,
        paymentMethod: paymentDetails.method as any,
        paymentReference: paymentDetails.reference,
        receivedBy: paymentDetails.receivedBy,
        receivingAccount: paymentDetails.receivingAccount || undefined,
        proofPaymentUrl: proof?.url,
        proofOriginalName: proof?.originalName,
        proofMimeType: proof?.mimeType,
        proofUploadedAt: proof?.uploadedAt,
      };
      try {
        await addInvoice(receipt);
      } catch (err: any) {
        alert(`Failed: ${err?.message || "Server error. Please try again."}`);
        return;
      }
      logAction(
        "Payment",
        `Invoice #${selectedInvoice.id} payment — $${amount.toLocaleString()} from ${clientName} via ${paymentDetails.method} (Ref: ${paymentDetails.reference})`,
      );
      refreshInvoices();
      setSelectedInvoice(null);
      setPaymentProofFile(null);
      setPaymentDetails({
        method: "Bank Transfer",
        reference: "",
        date: new Date().toISOString().split("T")[0],
        amount: 0,
        receivedBy: defaultReceiver,
        receivingAccount: "",
      });
    }
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    const reason = window.prompt(
      `Void Invoice #${invoice.id}? Enter the audit reason:`,
    );
    if (reason) {
      try {
        await deleteInvoice(invoice.id, reason);
        refreshInvoices();
      } catch (err: any) {
        alert(`Failed: ${err?.message || "Server error. Please try again."}`);
      }
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    const reason = window.prompt(
      "Reverse this payment? The original receipt and proof will be preserved. Enter the audit reason:",
    );
    if (reason) {
      try {
        await deleteInvoice(receiptId, reason);
        refreshInvoices();
      } catch (err: any) {
        alert(`Failed: ${err?.message || "Server error. Please try again."}`);
      }
    }
  };

  const filteredInvoices = allInvoices.filter((inv) => {
    const matchesStatus =
      statusFilter === "All"
        ? true
        : String(inv.status || "").toLowerCase() === statusFilter.toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    const clientName = String(getClientName(inv.clientId) || "").toLowerCase();
    const matchesSearch =
      String(inv.id || "")
        .toLowerCase()
        .includes(searchLower) || clientName.includes(searchLower);
    return matchesStatus && matchesSearch;
  });
  const filteredReceipts = allReceipts.filter((r) => {
    const searchLower = searchTerm.toLowerCase();
    const clientName = String(getClientName(r.clientId) || "").toLowerCase();
    return (
      String(r.id || "")
        .toLowerCase()
        .includes(searchLower) ||
      clientName.includes(searchLower) ||
      (r.paymentReference &&
        String(r.paymentReference).toLowerCase().includes(searchLower))
    );
  });

  // Build year options (current year ± 2)
  const yearOptions = Array.from(
    { length: 5 },
    (_, i) => today.getFullYear() - 2 + i,
  ).map((y) => ({ value: String(y), label: String(y) }));
  const monthOptions = MONTH_NAMES.map((m, i) => ({
    value: String(i),
    label: m,
  }));

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">
              Payments & Statements
            </h2>
            <p className="text-slate-900 font-medium">
              Track outstanding balances and process transactions
            </p>
          </div>
          <div className="flex bg-slate-100 rounded-full p-1 border border-slate-200 overflow-x-auto max-w-full">
            {(
              [
                "Monthly",
                "Invoices",
                "History",
                "Statements",
                "Schedule",
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab ? "bg-white shadow-sm text-slate-900" : "text-slate-900 hover:text-slate-900"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Monthly Payments Tab ── */}
        {activeTab === "Monthly" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ReceiptText size={20} className="text-indigo-600" /> Monthly
                Payments
              </h3>
              <p className="text-xs text-slate-900 mt-1">
                Log a monthly payment for any active contract
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900 min-w-[600px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Billboard
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Monthly Rate
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">
                      This Month
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeContracts.map((contract) => {
                    const rate = contract.monthlyRate;
                    const paidThisMonth = isMonthPaid(
                      contract.id,
                      today.getMonth(),
                      today.getFullYear(),
                    );
                    return (
                      <tr
                        key={contract.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4 font-bold text-slate-900">
                          {getClientName(contract.clientId)}
                        </td>
                        <td className="px-6 py-4 text-slate-900">
                          {getBillboardName(contract.billboardId)}
                        </td>
                        <td className="px-6 py-4 text-slate-900 text-xs">
                          {contract.details || "—"}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                          ${Math.round(rate).toLocaleString()}
                          {contract.hasVat && (
                            <span className="text-xs text-slate-900 ml-1">
                              incl. VAT
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {paidThisMonth ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-600 rounded-full text-xs font-bold">
                              <CheckCircle size={12} /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">
                              <AlertCircle size={12} /> Unpaid
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openMonthlyModal(contract)}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center gap-1.5 ml-auto"
                          >
                            <CreditCard size={13} /> Log Payment
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {activeContracts.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-slate-900 italic"
                      >
                        No active contracts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Invoices Tab ── */}
        {activeTab === "Invoices" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
                {(["All", "Pending", "Overdue", "Paid"] as const).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${statusFilter === status ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900 border-slate-200 hover:border-slate-300"}`}
                    >
                      {status}
                    </button>
                  ),
                )}
              </div>
              <div className="relative group w-full sm:w-64">
                <Search
                  className="absolute left-3 top-2.5 text-slate-900 group-focus-within:text-slate-800 transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Client or ID..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:bg-white focus:border-slate-800 transition-all text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg transition-all group flex flex-col justify-between hover:-translate-y-1 duration-300"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-slate-100 transition-colors">
                        {String(invoice.status || "").toLowerCase() ===
                        "paid" ? (
                          <CheckCircle className="text-green-500" size={24} />
                        ) : String(invoice.status || "").toLowerCase() ===
                          "overdue" ? (
                          <AlertCircle className="text-red-500" size={24} />
                        ) : (
                          <AlertCircle className="text-amber-500" size={24} />
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${String(invoice.status || "").toLowerCase() === "paid" ? "bg-green-50 text-green-600" : String(invoice.status || "").toLowerCase() === "overdue" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">
                      {getClientName(invoice.clientId)}
                    </h3>
                    <p className="text-sm text-slate-900 mb-6">
                      Inv #{invoice.id} • {invoice.date}
                    </p>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-900 font-medium">
                          Amount Due
                        </span>
                        <span className="font-bold text-slate-900 text-lg">
                          ${(invoice.total ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {["pending", "overdue"].includes(
                      String(invoice.status || "").toLowerCase(),
                    ) && (
                      <button
                        onClick={() => handleOpenPaymentModal(invoice)}
                        className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2"
                      >
                        <CreditCard size={14} /> Pay
                      </button>
                    )}
                    {String(invoice.status || "").toLowerCase() === "paid" && (
                      <div className="flex-1 py-3 bg-slate-50 text-slate-900 rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 cursor-default border border-slate-100">
                        <Check size={14} /> Paid
                      </div>
                    )}
                    <button
                      onClick={() => handleSendInvoice(invoice)}
                      className="py-3 px-4 border border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2"
                    >
                      <Send size={14} /> Email
                    </button>
                    {canUserDelete && (
                      <button
                        onClick={() => handleDeleteInvoice(invoice)}
                        className={`py-3 px-4 border border-slate-200 text-slate-900 hover:border-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center justify-center ${!canUserDelete ? "hidden" : ""}`}
                        title="Delete invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredInvoices.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-900 italic bg-white rounded-2xl border border-slate-100 border-dashed">
                  No invoices found matching your criteria.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === "History" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Clock size={18} />{" "}
                <span className="text-sm font-bold uppercase tracking-wider">
                  Payment History
                </span>
              </div>
              <div className="relative group w-full sm:w-64">
                <Search
                  className="absolute left-3 top-2.5 text-slate-900 group-focus-within:text-slate-800 transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Ref, ID, Client..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:border-slate-800 transition-all text-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900 min-w-[500px] lg:min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Payment Date
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Receipt ID
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Method
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Received By
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Evidence
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Amount
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((receipt) => (
                    <tr
                      key={receipt.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">
                        {receipt.date}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {receipt.id}
                      </td>
                      <td className="px-6 py-4">
                        {getClientName(receipt.clientId)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold uppercase">
                          {receipt.paymentMethod || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-900">
                        {receipt.paymentReference || "-"}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold">
                        {receipt.receivedBy || (
                          <span className="text-red-600">Missing</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {(receipt.hasPaymentProof ?? Boolean(receipt.proofPaymentUrl)) ? (
                          <button
                            type="button"
                            onClick={() => openPaymentProof(receipt.id).catch(error => alert(error.message))}
                            className="font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            View proof
                          </button>
                        ) : (
                          <span className="text-red-600 font-bold">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">
                        ${(receipt.total ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canUserDelete && (
                          <button
                            onClick={() => handleDeleteReceipt(receipt.id)}
                            className="p-2 text-slate-900 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredReceipts.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-12 text-center text-slate-900 italic"
                      >
                        No payment history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Statements Tab ── */}
        {activeTab === "Statements" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900 min-w-[600px]">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Total Billed
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Total Paid
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Balance
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => {
                    const financials = getClientFinancials(client.id);
                    return (
                      <tr
                        key={client.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">
                            {client.companyName}
                          </div>
                          <div className="text-xs text-slate-900">
                            {client.email}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          ${financials.totalBilled.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right text-green-600">
                          ${financials.totalPaid.toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right font-bold ${financials.balance > 0 ? "text-red-500" : "text-slate-900"}`}
                        >
                          ${financials.balance.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => {
                              const transactions = getTransactions(client.id);
                              const activeRentals = getContracts().filter(
                                (c) =>
                                  c.clientId === client.id &&
                                  String(c.status || "").toLowerCase() ===
                                    "active",
                              );
                              generateStatementPDF(
                                client,
                                transactions,
                                activeRentals,
                                getBillboardName,
                              );
                            }}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                            title="Download Statement"
                          >
                            <Download size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Schedule Tab ── */}
        {activeTab === "Schedule" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Calendar size={20} className="text-indigo-600" /> Payment
                  Schedule
                </h3>
                <p className="text-xs text-slate-900 mt-1">
                  Upcoming billing dates based on active contracts
                </p>
              </div>
              <button
                onClick={() => generatePaymentSchedulePDF(upcomingBillings)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-900 hover:text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all hover:bg-slate-50"
              >
                <Download size={14} /> PDF Schedule
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900 min-w-[500px] lg:min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Billing Cycle Day
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">
                      Next Due Date
                    </th>
                    <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">
                      Est. Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingBillings.map((item, index) => (
                    <tr
                      key={index}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {item.clientName}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold uppercase">
                          {item.day} of month
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {item.date}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        ${item.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {upcomingBillings.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-12 text-center text-slate-900 italic"
                      >
                        No upcoming scheduled payments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Monthly Payment Modal ── */}
      {monthlyContract &&
        (() => {
          const expectedGross = monthlyContract.monthlyRate;
          const { subtotal: expectedNet, vat: expectedVat } =
            monthlyContract.hasVat
              ? splitInclusiveVat(expectedGross)
              : { subtotal: expectedGross, vat: 0 };
          const enteredAmount = monthlyForm.amount || 0;
          const variance = enteredAmount - expectedGross;
          const varianceClass =
            Math.abs(variance) < 0.01
              ? "text-slate-900"
              : variance > 0
                ? "text-emerald-600"
                : "text-amber-600";

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="bg-slate-900 p-6 text-white flex justify-between items-start sticky top-0 z-10">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">
                      Log Monthly Payment
                    </h3>
                    <p className="text-slate-900 text-xs mt-1">
                      {MONTH_NAMES[monthlyForm.month]} {monthlyForm.year}{" "}
                      &middot; Contract {monthlyContract.id}
                    </p>
                  </div>
                  <button
                    onClick={() => setMonthlyContract(null)}
                    className="text-slate-900 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  {/* Context card */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Paying For
                    </p>
                    <p className="font-bold text-slate-900">
                      {getClientName(monthlyContract.clientId)}
                    </p>
                    <p className="text-sm text-slate-900">
                      {getBillboardName(monthlyContract.billboardId)}
                      {monthlyContract.details
                        ? ` • ${monthlyContract.details}`
                        : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 border-t border-slate-100 text-xs text-slate-900">
                      <span>
                        <span className="font-semibold text-slate-700">
                          Monthly rate:
                        </span>{" "}
                        ${expectedGross.toLocaleString()}
                      </span>
                      {monthlyContract.hasVat && (
                        <>
                          <span>Net ${expectedNet.toFixed(2)}</span>
                          <span>VAT ${expectedVat.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Period */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Billing Period
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <MinimalSelect
                        label="Month"
                        value={String(monthlyForm.month)}
                        onChange={(e: any) =>
                          setMonthlyForm((f) => ({
                            ...f,
                            month: Number(e.target.value),
                          }))
                        }
                        options={monthOptions}
                      />
                      <MinimalSelect
                        label="Year"
                        value={String(monthlyForm.year)}
                        onChange={(e: any) =>
                          setMonthlyForm((f) => ({
                            ...f,
                            year: Number(e.target.value),
                          }))
                        }
                        options={yearOptions}
                      />
                    </div>
                  </div>

                  {/* Amount + variance */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Amount Received
                    </p>
                    <MinimalInput
                      label="Amount ($)"
                      type="number"
                      value={monthlyForm.amount}
                      onChange={(e: any) =>
                        setMonthlyForm((f) => ({
                          ...f,
                          amount: Number(e.target.value),
                        }))
                      }
                      required
                    />
                    {enteredAmount > 0 && (
                      <div className={`text-xs font-medium ${varianceClass}`}>
                        {Math.abs(variance) < 0.01
                          ? `Matches expected (${expectedGross.toLocaleString()})`
                          : variance > 0
                            ? `Overpayment of $${variance.toFixed(2)} vs expected $${expectedGross.toLocaleString()}`
                            : `Short by $${Math.abs(variance).toFixed(2)} vs expected $${expectedGross.toLocaleString()}`}
                      </div>
                    )}
                  </div>

                  {/* Payment details */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Payment Details
                    </p>
                    <MinimalInput
                      label="Payment Date"
                      type="date"
                      value={monthlyForm.date}
                      onChange={(e: any) =>
                        setMonthlyForm((f) => ({ ...f, date: e.target.value }))
                      }
                      icon={Calendar}
                      required
                    />
                    <MinimalSelect
                      label="Payment Method"
                      value={monthlyForm.method}
                      onChange={(e: any) =>
                        setMonthlyForm((f) => ({
                          ...f,
                          method: e.target.value,
                        }))
                      }
                      icon={Wallet}
                      options={[
                        { value: "Bank Transfer", label: "Bank Transfer" },
                        { value: "Cash", label: "Cash" },
                        { value: "EcoCash", label: "EcoCash Mobile Money" },
                        { value: "Other", label: "Other" },
                      ]}
                    />
                    <MinimalInput
                      label="Reference Number"
                      value={monthlyForm.reference}
                      onChange={(e: any) =>
                        setMonthlyForm((f) => ({
                          ...f,
                          reference: e.target.value,
                        }))
                      }
                      icon={Hash}
                      placeholder="e.g. POP-12345"
                      required
                    />
                    <MinimalInput
                      label="Received By"
                      value={monthlyForm.receivedBy}
                      onChange={(e: any) =>
                        setMonthlyForm((f) => ({
                          ...f,
                          receivedBy: e.target.value,
                        }))
                      }
                      required
                    />
                    {isBankPaymentMethod(monthlyForm.method) && (
                      <MinimalInput
                        label="Receiving Bank Account"
                        value={monthlyForm.receivingAccount}
                        onChange={(e: any) =>
                          setMonthlyForm((f) => ({
                            ...f,
                            receivingAccount: e.target.value,
                          }))
                        }
                        required
                      />
                    )}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                        Proof of Payment{" "}
                        {isBankPaymentMethod(monthlyForm.method)
                          ? "*"
                          : "(Optional)"}
                      </label>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        required={isBankPaymentMethod(monthlyForm.method)}
                        onChange={(e) =>
                          setMonthlyProofFile(e.target.files?.[0] || null)
                        }
                        className="block w-full text-xs file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:font-bold file:text-white"
                      />
                      <p className="mt-1 text-[10px] text-slate-600">
                        PDF/JPEG/PNG/WebP, up to 7 MB.
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-900">
                      A receipt will be created and the month marked as paid.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setMonthlyContract(null)}
                      className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmMonthlyPayment}
                      disabled={proofUploading}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-bold uppercase tracking-wider text-xs transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                      <Check size={15} />{" "}
                      {proofUploading ? "Uploading…" : "Confirm Payment"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── Invoice Payment Modal ── */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full border border-white/20 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 p-6 text-white flex justify-between items-start sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold tracking-tight">
                  Record Payment
                </h3>
                <p className="text-slate-900 text-xs mt-1">
                  Invoice #{selectedInvoice.id} &middot; {selectedInvoice.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-900 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100">
                <p className="text-xs font-bold uppercase text-slate-900 tracking-wider mb-2">
                  Total Amount Due
                </p>
                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tighter">
                  ${outstandingAmount(selectedInvoice).toLocaleString()}
                </h2>
                <p className="text-sm font-medium text-slate-900 mt-2">
                  {getClientName(selectedInvoice.clientId)}
                </p>
                {selectedInvoice.vatAmount > 0 && (
                  <p className="text-[10px] text-slate-900 mt-2">
                    Net ${Number(selectedInvoice.subtotal).toFixed(2)} + VAT $
                    {Number(selectedInvoice.vatAmount).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Payment Details
                </p>
                <MinimalInput
                  label="Payment Date"
                  type="date"
                  value={paymentDetails.date}
                  onChange={(e: any) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      date: e.target.value,
                    })
                  }
                  icon={Calendar}
                  required
                />
                <MinimalInput
                  label="Amount Received"
                  type="number"
                  value={paymentDetails.amount}
                  onChange={(e: any) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      amount: Number(e.target.value),
                    })
                  }
                  required
                />
                <MinimalSelect
                  label="Payment Method"
                  value={paymentDetails.method}
                  onChange={(e: any) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      method: e.target.value,
                    })
                  }
                  icon={Wallet}
                  options={[
                    { value: "Bank Transfer", label: "Bank Transfer" },
                    { value: "Cash", label: "Cash" },
                    { value: "EcoCash", label: "EcoCash Mobile Money" },
                    { value: "Other", label: "Other" },
                  ]}
                />
                <MinimalInput
                  label="Reference Number"
                  value={paymentDetails.reference}
                  onChange={(e: any) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      reference: e.target.value,
                    })
                  }
                  icon={Hash}
                  placeholder="e.g. POP-12345"
                  required
                />
                <MinimalInput
                  label="Received By"
                  value={paymentDetails.receivedBy}
                  onChange={(e: any) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      receivedBy: e.target.value,
                    })
                  }
                  required
                />
                {isBankPaymentMethod(paymentDetails.method) && (
                  <MinimalInput
                    label="Receiving Bank Account"
                    value={paymentDetails.receivingAccount}
                    onChange={(e: any) =>
                      setPaymentDetails({
                        ...paymentDetails,
                        receivingAccount: e.target.value,
                      })
                    }
                    required
                  />
                )}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Proof of Payment{" "}
                    {isBankPaymentMethod(paymentDetails.method)
                      ? "*"
                      : "(Optional)"}
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    required={isBankPaymentMethod(paymentDetails.method)}
                    onChange={(e) =>
                      setPaymentProofFile(e.target.files?.[0] || null)
                    }
                    className="block w-full text-xs file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:font-bold file:text-white"
                  />
                  <p className="mt-1 text-[10px] text-slate-600">
                    PDF/JPEG/PNG/WebP, up to 7 MB. Recorder and upload time are
                    logged automatically.
                  </p>
                </div>
                <p className="text-[10px] text-slate-900">
                  A receipt will be issued and the invoice marked paid.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPayment}
                  disabled={proofUploading}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-bold uppercase tracking-wider text-xs transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  <Check size={15} />{" "}
                  {proofUploading ? "Uploading…" : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {sendModal &&
        (() => {
          const { invoice, client } = sendModal;
          const docType = (invoice.type || "Invoice").toLowerCase() as any;
          const { subject, message } = buildSendDefaults(invoice, client);
          const typeLabel = invoice.type || "Invoice";
          return (
            <SendDocumentModal
              isOpen={true}
              onClose={() => setSendModal(null)}
              documentType={docType}
              documentId={invoice.id}
              documentLabel={`${typeLabel} #${invoice.id}`}
              clientName={client.companyName}
              clientEmail={client.email}
              defaultSubject={subject}
              defaultMessage={message}
              onSent={({ to }) => {
                alert(`${typeLabel} sent to ${to}`);
              }}
            />
          );
        })()}
    </>
  );
};
