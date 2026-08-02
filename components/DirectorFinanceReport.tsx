import React, { useEffect, useMemo, useState } from "react";
import autoTable from "jspdf-autotable";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  ChevronRight,
  Download,
  FileSearch,
  Printer,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import {
  getClients,
  getExpenses,
  getInvoices,
  subscribe,
} from "../services/mockData";
import { buildForensicFinanceReport } from "../services/forensicFinance";
import type { Invoice } from "../types";
import { api } from "../services/apiClient";
import { openPaymentProof } from "../services/paymentProof";
import { jsPDF } from "jspdf";
import { useGeistSans } from "../services/pdfFonts";

const fmt = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;

const verificationLabels: Record<string, string> = {
  ORPHAN_PAYMENT: "Orphan payment",
  FALSE_PAID_STATUS: "False-paid invoice",
  EXACT_DUPLICATE: "Exact duplicate invoice candidate",
  EXACT_DUPLICATE_INVOICE: "Exact duplicate invoice candidate",
  PROBABLE_DUPLICATE: "Probable duplicate invoice candidate",
  PROBABLE_DUPLICATE_INVOICE: "Probable duplicate invoice candidate",
  MISSING_RECEIVER: "Missing receiver evidence",
  MISSING_REFERENCE: "Missing payment reference",
  MISSING_BANK_PROOF: "Missing payment proof",
  MISSING_BANK_ACCOUNT: "Missing receiving account",
  PENDING_RECEIPT_REVIEW: "Unverified payment awaiting review",
  REJECTED_RECEIPT: "Rejected payment",
};

const verificationLabel = (code: unknown) => {
  const normalized = String(code || "").toUpperCase();
  return (
    verificationLabels[normalized] ||
    (normalized.includes("DUPLICATE")
      ? `${normalized.startsWith("EXACT") ? "Exact" : "Probable"} duplicate invoice candidate`
      : "Ledger exception requiring verification")
  );
};

const recordIdsForException = (recordId: unknown) =>
  String(recordId || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

type DisplayInvoiceStatus = "Paid" | "Unpaid" | "Overdue";

const displayInvoiceStatus = (row: any, asOf: string): DisplayInvoiceStatus => {
  if (Number(row?.balance || 0) <= 0.01) return "Paid";
  const dueDate = String(row?.invoice?.dueDate || row?.invoice?.date || "");
  return dueDate && dueDate < asOf ? "Overdue" : "Unpaid";
};

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * jspdf-autotable is published in both function and plugin forms depending on
 * the bundler. Keep the export resilient to either shape (the same approach is
 * used by the other PDF exports in this application).
 */
function runAutoTable(doc: jsPDF, options: Record<string, any>) {
  const table = autoTable as any;
  if (typeof table === "function") {
    table(doc, options);
    return;
  }
  if (typeof (doc as any).autoTable === "function") {
    (doc as any).autoTable(options);
    return;
  }
  if (typeof table?.default === "function") {
    table.default(doc, options);
    return;
  }
  throw new Error("PDF table renderer is unavailable.");
}

type DirectorFinancePdfArgs = {
  report: any;
  clients: Array<{
    name: string;
    billed: number;
    paid: number;
    balance: number;
  }>;
  startDate: string;
  endDate: string;
  periodBilled: number;
  periodNet: number;
  periodVat: number;
  periodCollected: number;
};

/**
 * Build and download a self-contained director finance report. The report is
 * intentionally assembled from the already-loaded data; it does not fetch,
 * mutate, or expose payment proof URLs.
 */
async function downloadDirectorFinancePdf({
  report,
  clients,
  startDate,
  endDate,
  periodBilled,
  periodNet,
  periodVat,
  periodCollected,
}: DirectorFinancePdfArgs) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await useGeistSans(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = { left: 12, right: 12, top: 14, bottom: 18 };
  const tableWidth = pageWidth - margin.left - margin.right;
  let cursorY = margin.top;

  const reportGeneratedAt = report?.generatedAt
    ? new Date(report.generatedAt)
    : new Date();
  const generatedLabel = Number.isNaN(reportGeneratedAt.getTime())
    ? String(report?.generatedAt || new Date().toISOString())
    : reportGeneratedAt.toLocaleString();
  const reportId = String(report?.reportId || "Local fallback");
  const reportHash = String(report?.reportHash || "Not available offline");
  const reportAsOf = report?.asOf ? String(report.asOf).slice(0, 10) : endDate;

  const ensureRoom = (minimumHeight = 20) => {
    if (cursorY > pageHeight - margin.bottom - minimumHeight) {
      doc.addPage();
      cursorY = margin.top;
    }
  };

  const sectionHeading = (title: string) => {
    ensureRoom(18);
    doc.setFont("Geist Sans", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin.left, cursorY);
    cursorY += 5;
  };

  const table = (
    head: string[][],
    body: (string | number)[][],
    options: Record<string, any> = {},
  ) => {
    ensureRoom(22);
    runAutoTable(doc, {
      startY: cursorY,
      margin: { left: margin.left, right: margin.right, bottom: margin.bottom },
      tableWidth,
      head,
      body: body.length ? body : [["No records"]],
      theme: "grid",
      styles: {
        font: "Geist Sans",
        fontSize: 7,
        cellPadding: 1.7,
        overflow: "linebreak",
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...options,
    });
    const finalY = Number((doc as any).lastAutoTable?.finalY);
    cursorY = Number.isFinite(finalY) ? finalY + 7 : cursorY + 16;
  };

  // Cover metadata: these fields are also present in the CSV export and are
  // retained here so an offline/local report is explicit about its provenance.
  doc.setFont("Geist Sans", "bold");
  doc.setFontSize(19);
  doc.setTextColor(15, 23, 42);
  doc.text("Director Financial Report", margin.left, cursorY);
  cursorY += 7;
  doc.setFont("Geist Sans", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Reporting period: ${startDate} – ${endDate}`, margin.left, cursorY);
  cursorY += 5;
  doc.text(`Generated: ${generatedLabel}`, margin.left, cursorY);
  cursorY += 5;
  doc.text(`As of: ${reportAsOf}`, margin.left, cursorY);
  cursorY += 5;
  doc.setFont("Geist Sans", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Report ID: ${reportId}`, margin.left, cursorY);
  cursorY += 5;
  doc.setFont("Geist Sans", "normal");
  doc.text(`SHA-256: ${reportHash}`, margin.left, cursorY);
  cursorY += 10;

  sectionHeading("Control totals");
  table(
    [["Metric", "Amount"]],
    [
      ["Gross billed (period)", fmt(periodBilled)],
      ["Net revenue (period)", fmt(periodNet)],
      ["VAT billed (period)", fmt(periodVat)],
      ["Cash collected (period)", fmt(periodCollected)],
      ["Outstanding as of date", fmt(Number(report?.totals?.outstanding || 0))],
      ["Operating expenses", fmt(Number(report?.totals?.expenses || 0))],
      ["Net less expenses", fmt(periodNet - Number(report?.totals?.expenses || 0))],
      ["Exceptions", String(report?.exceptions?.length || 0)],
    ],
    { columnStyles: { 1: { halign: "right", fontStyle: "bold" } } },
  );

  sectionHeading(`Accounts receivable aging (as of ${endDate})`);
  const agingBuckets = ["Current", "1–30", "31–60", "61–90", "90+"];
  table(
    [["Bucket", "Outstanding"]],
    agingBuckets.map((bucket) => [
      bucket,
      fmt(Number(report?.aging?.[bucket] || 0)),
    ]),
    { columnStyles: { 1: { halign: "right", fontStyle: "bold" } } },
  );

  sectionHeading("Forensic exceptions");
  table(
    [["Severity", "Code", "Record", "Finding"]],
    (report?.exceptions || []).map((item: any) => [
      String(item?.severity || "—").toUpperCase(),
      String(item?.code || "—"),
      String(item?.recordId || "—"),
      String(item?.message || "—"),
    ]),
    {
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 38 },
        2: { cellWidth: 46 },
      },
    },
  );

  sectionHeading("Client drill-down");
  table(
    [["Client", "Billed", "Collected", "Balance"]],
    clients.map((client) => [
      client.name,
      fmt(client.billed),
      fmt(client.paid),
      fmt(client.balance),
    ]),
    {
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    },
  );

  sectionHeading("Invoice drill-down");
  table(
    [[
      "Client",
      "Invoice ID",
      "Invoice date",
      "Due date",
      "Gross",
      "Collected",
      "Balance",
      "Aging",
      "Status",
    ]],
    (report?.invoices || []).map((row: any) => [
      String(row?.clientName || "Unknown client"),
      String(row?.invoice?.id || "—"),
      String(row?.invoice?.date || "—"),
      String(row?.invoice?.dueDate || "—"),
      fmt(Number(row?.invoice?.total || 0)),
      fmt(Number(row?.paid || 0)),
      fmt(Number(row?.balance || 0)),
      String(row?.agingBucket || "—"),
      String(row?.invoice?.status || "—"),
    ]),
    {
      columnStyles: {
        0: { cellWidth: 34 },
        1: { cellWidth: 30 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right", fontStyle: "bold" },
      },
    },
  );

  sectionHeading("Payment drill-down");
  const clientByInvoice = new Map<string, string>(
    (report?.invoices || []).map((row: any) => [
      String(row?.invoice?.id || ""),
      String(row?.clientName || "Unknown client"),
    ]),
  );
  table(
    [[
      "Client",
      "Invoice ID",
      "Receipt ID",
      "Payment date",
      "Amount",
      "Method",
      "Reference",
      "Received by",
      "Recorded by",
      "Account",
      "Proof",
    ]],
    (report?.receipts || []).map((receipt: any) => {
      const invoiceId = String(receipt?.linkedInvoiceId || "Unallocated");
      return [
        clientByInvoice.get(invoiceId) || "Unknown client",
        invoiceId,
        String(receipt?.id || "—"),
        String(receipt?.date || "—"),
        fmt(Number(receipt?.total || 0)),
        String(receipt?.paymentMethod || "—"),
        String(receipt?.paymentReference || "MISSING"),
        String(receipt?.receivedBy || "MISSING"),
        String(
          receipt?.receivedByUserId || receipt?.createdBy || "Legacy/unknown",
        ),
        String(receipt?.receivingAccount || "—"),
        (receipt?.hasPaymentProof ?? Boolean(receipt?.proofPaymentUrl)) ? "Attached" : "Missing",
      ];
    }),
    {
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 26 },
        2: { cellWidth: 25 },
        3: { cellWidth: 21 },
        4: { halign: "right" },
      },
    },
  );

  // Add a stable footer after all tables have paginated. No proof URL is ever
  // written to the document; only the evidence status is shown above.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin.left, pageHeight - 12, pageWidth - margin.right, pageHeight - 12);
    doc.setFont("Geist Sans", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Dreambox · Director Financial Report", margin.left, pageHeight - 7);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin.right, pageHeight - 7, {
      align: "right",
    });
  }

  doc.save(`director-finance-${startDate}-to-${endDate}.pdf`);
}

export const DirectorFinanceReport: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(today);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [remoteReport, setRemoteReport] = useState<any>(null);
  const [reportError, setReportError] = useState("");

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    let cancelled = false;
    setReportError("");
    // Never let a report ID/hash from the previous period be exported while
    // the newly requested period is still loading.
    setRemoteReport(null);
    api
      .get("/api/finance-report", { startDate, endDate })
      .then((result) => {
        if (!cancelled) setRemoteReport(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setRemoteReport(null);
          setReportError(
            error?.message ||
              "Server report unavailable; showing synchronized local data.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);
  const data = useMemo(() => {
    void version;
    const throughEnd = (date: string) => date <= endDate;
    const inPeriod = (date: string) => date >= startDate && throughEnd(date);
    const invoices = getInvoices().filter((i) => throughEnd(i.date));
    const report =
      remoteReport ||
      buildForensicFinanceReport(
        invoices,
        getClients(),
        getExpenses().filter((e) => throughEnd(e.date)),
        new Date(`${endDate}T23:59:59Z`),
        { startDate, endDate },
      );
    const periodInvoices = report.invoices.filter((row) =>
      inPeriod(row.invoice.date),
    );
    const periodReceipts = report.receipts.filter((receipt) =>
      inPeriod(receipt.date),
    );
    return { report, periodInvoices, periodReceipts };
  }, [version, startDate, endDate, remoteReport]);

  const verification = useMemo(() => {
    const exceptions = Array.isArray(data.report?.exceptions)
      ? data.report.exceptions
      : [];
    const invoiceRows = Array.isArray(data.report?.invoices)
      ? data.report.invoices
      : [];
    const invoiceIds = new Set(
      invoiceRows.map((row: any) => String(row?.invoice?.id || "")),
    );
    const receiptToInvoice = new Map<string, string>();
    const receiptRows = [
      ...(Array.isArray(data.report?.receipts) ? data.report.receipts : []),
      ...(Array.isArray(data.report?.reviewReceipts)
        ? data.report.reviewReceipts
        : []),
    ];
    receiptRows.forEach((receipt: any) => {
      const receiptId = String(receipt?.id || "");
      const linkedInvoiceId = String(receipt?.linkedInvoiceId || "");
      if (receiptId && linkedInvoiceId) {
        receiptToInvoice.set(receiptId, linkedInvoiceId);
      }
    });
    const invoiceFindings = new Map<string, any[]>();

    const findings = exceptions.map((item: any) => {
      const recordIds = recordIdsForException(item?.recordId);
      const relatedInvoiceIds = [
        ...new Set(
          recordIds.flatMap((recordId) => {
            if (invoiceIds.has(recordId)) return [recordId];
            const linkedInvoiceId = receiptToInvoice.get(recordId);
            return linkedInvoiceId && invoiceIds.has(linkedInvoiceId)
              ? [linkedInvoiceId]
              : [];
          }),
        ),
      ];
      relatedInvoiceIds.forEach((invoiceId) => {
        invoiceFindings.set(invoiceId, [
          ...(invoiceFindings.get(invoiceId) || []),
          item,
        ]);
      });
      return { item, recordIds, relatedInvoiceIds };
    });

    return { findings, invoiceFindings };
  }, [data.report]);

  const invoiceStatusSummary = useMemo(() => {
    const summary = { Paid: 0, Unpaid: 0, Overdue: 0, overdueBalance: 0 };
    for (const row of data.report.invoices || []) {
      const status = displayInvoiceStatus(row, endDate);
      summary[status] += 1;
      if (status === "Overdue") summary.overdueBalance += Number(row.balance || 0);
    }
    return summary;
  }, [data.report.invoices, endDate]);

  const clients = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        billed: number;
        paid: number;
        balance: number;
        invoices: typeof data.report.invoices;
      }
    >();
    for (const row of data.report.invoices) {
      const current = map.get(row.invoice.clientId) || {
        id: row.invoice.clientId,
        name: row.clientName,
        billed: 0,
        paid: 0,
        balance: 0,
        invoices: [],
      };
      current.billed += Number(row.invoice.total);
      current.paid += row.paid;
      current.balance += row.balance;
      current.invoices.push(row);
      map.set(current.id, current);
    }
    return [...map.values()].sort((a, b) => b.balance - a.balance);
  }, [data]);

  const periodBilled = data.periodInvoices.reduce(
    (sum, row) => sum + Number(row.invoice.total),
    0,
  );
  const periodNet = data.periodInvoices.reduce(
    (sum, row) => sum + Number(row.invoice.subtotal),
    0,
  );
  const periodVat = data.periodInvoices.reduce(
    (sum, row) => sum + Number(row.invoice.vatAmount),
    0,
  );
  const periodCollected = data.periodReceipts.reduce(
    (sum, receipt) => sum + Number(receipt.total),
    0,
  );

  const exportReport = () =>
    downloadCsv(`director-finance-${startDate}-to-${endDate}.csv`, [
      [
        "Director Finance Report",
        `${startDate} to ${endDate}`,
        `As of ${data.report.asOf}`,
      ],
      [
        "Report ID",
        data.report.reportId || "Local fallback",
        "SHA-256",
        data.report.reportHash || "Not available offline",
      ],
      [
        "Invoice ID",
        "Client",
        "Invoice Date",
        "Due Date",
        "Gross",
        "VAT",
        "Collected",
        "Balance",
        "Last Payment",
        "Aging",
        "Status",
      ],
      ...data.report.invoices.map((row) => [
        row.invoice.id,
        row.clientName,
        row.invoice.date,
        row.invoice.dueDate || "",
        row.invoice.total,
        row.invoice.vatAmount,
        row.paid,
        row.balance,
        row.lastPaymentDate || "",
        row.agingBucket,
        displayInvoiceStatus(row, endDate),
      ]),
      [],
      ["EXCEPTIONS"],
      ["Severity", "Code", "Record", "Finding"],
      ...data.report.exceptions.map((item) => [
        item.severity,
        item.code,
        item.recordId,
        item.message,
      ]),
    ]);

  return (
    <div className="space-y-6 text-slate-900 print:bg-white">
      {reportError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 print:hidden">
          {reportError}
        </div>
      )}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-[0.2em]">
            <ShieldCheck size={16} /> Forensic ledger view
          </div>
          <h1 className="text-3xl font-black text-slate-900 mt-2">
            Director Financial Report
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cash, accrual, VAT, aging, evidence exceptions and transaction
            drill-downs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end print:hidden">
          <label className="text-[10px] font-bold uppercase text-slate-500">
            From
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setRemoteReport(null);
                setStartDate(e.target.value);
              }}
              className="block mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setRemoteReport(null);
                setEndDate(e.target.value);
              }}
              className="block mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            onClick={exportReport}
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-sm font-bold flex items-center gap-2"
          >
            <Download size={15} /> CSV
          </button>
          <button
            onClick={async () =>
              downloadDirectorFinancePdf({
                report: data.report,
                clients,
                startDate,
                endDate,
                periodBilled,
                periodNet,
                periodVat,
                periodCollected,
              })
            }
            className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-2"
          >
            <Printer size={15} /> Print / PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ["Gross billed", periodBilled, ReceiptText],
          ["Net revenue", periodNet, Banknote],
          ["Cash collected", periodCollected, Banknote],
          [
            "Outstanding as of date",
            data.report.totals.outstanding,
            AlertTriangle,
          ],
        ].map(([label, value, Icon]: any) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-slate-100 p-5"
          >
            <Icon size={18} className="text-indigo-600" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-4">
              {label}
            </p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {fmt(value)}
            </p>
          </div>
        ))}
      </div>

      <div
        aria-label="Outstanding balance methodology"
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600"
      >
        <p>
          <span className="font-black text-slate-800">
            How outstanding is calculated:
          </span>{" "}
          Outstanding is the gross balance on active invoices as of the report
          date. Valid linked receipts reduce that balance; orphan or unverified
          payments are not auto-applied, and duplicate candidates remain
          included until reviewed.
        </p>
      </div>

      <section aria-label="Invoice status alerts" className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900">
          <AlertTriangle size={17} className="text-red-600" aria-hidden="true" />
          Invoice status alerts
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <span className="font-black">{invoiceStatusSummary.Overdue} overdue</span>
            <span className="block mt-1">{fmt(invoiceStatusSummary.overdueBalance)} requires collection or documented correction.</span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-black">{invoiceStatusSummary.Unpaid} unpaid</span>
            <span className="block mt-1">Open balance not yet past its due date.</span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="font-black">{invoiceStatusSummary.Paid} paid</span>
            <span className="block mt-1">Balance is fully settled by valid linked receipts.</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-slate-500">
          Alerts do not delete invoices or change revenue. If an overdue invoice is erroneous, void or correct it with an approved reason so the audit trail remains intact.
        </p>
      </section>

      {verification.findings.length > 0 && (
        <section
          aria-labelledby="director-finance-verification-heading"
          className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden"
        >
          <div className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={18} aria-hidden="true" />
                <h2
                  id="director-finance-verification-heading"
                  className="font-black"
                >
                  Verification required
                </h2>
              </div>
              <p className="text-xs text-amber-900/80 mt-1 max-w-3xl">
                These invoice and payment records need a human check before
                they can be treated as settled or removed as duplicates.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-xs font-black whitespace-nowrap">
              {verification.findings.length} finding
              {verification.findings.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="border-t border-amber-200 divide-y divide-amber-200/70">
            {verification.findings.map(
              ({ item, recordIds, relatedInvoiceIds }: any, index: number) => (
                <div
                  key={`${item?.code || "finding"}-${item?.recordId || index}-${index}`}
                  className="px-5 py-3 text-xs text-slate-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        item?.severity === "critical"
                          ? "font-black uppercase text-red-700"
                          : "font-black uppercase text-amber-800"
                      }
                    >
                      {String(item?.severity || "warning")}
                    </span>
                    <span className="rounded-full bg-white/80 border border-amber-200 px-2 py-0.5 font-bold text-amber-900">
                      {verificationLabel(item?.code)}
                    </span>
                    {relatedInvoiceIds.map((invoiceId: string) => (
                      <span
                        key={invoiceId}
                        className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-amber-900"
                      >
                        Invoice {invoiceId}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1">
                    <b>{recordIds.join(", ") || "Unidentified record"}</b>
                    {item?.message ? ` — ${item.message}` : ""}
                  </p>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex justify-between">
            <h2 className="font-black text-slate-900">
              Accounts Receivable Aging
            </h2>
            <span className="text-xs text-slate-500">As of {endDate}</span>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-5">
            {Object.entries(data.report.aging as Record<string, number>).map(
              ([bucket, value]) => (
                <div
                  key={bucket}
                  className="bg-slate-50 rounded-xl p-3 text-center"
                >
                  <p className="text-[10px] font-bold uppercase text-slate-500">
                    {bucket}
                  </p>
                  <p className="font-black text-slate-900 mt-1">{fmt(value)}</p>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-black text-slate-900">Control totals</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>VAT billed in period</dt>
              <dd className="font-bold">{fmt(periodVat)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Operating expenses</dt>
              <dd className="font-bold">{fmt(data.report.period.expenses)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt>Net less expenses</dt>
              <dd className="font-black">
                {fmt(data.report.period.operatingResult)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Exceptions</dt>
              <dd className="font-black text-red-600">
                {data.report.exceptions.length}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="font-black text-slate-900">
            Client → invoice → payment drill-down
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Every balance ties to the source invoice and its payment evidence.
          </p>
        </div>
        <div className="divide-y">
          {clients.map((client) => (
            <div key={client.id}>
              <button
                onClick={() =>
                  setExpandedClient(
                    expandedClient === client.id ? null : client.id,
                  )
                }
                className="w-full grid grid-cols-[1fr_repeat(3,140px)] gap-3 items-center text-left px-5 py-4 hover:bg-slate-50"
              >
                <span className="font-bold flex items-center gap-2">
                  {expandedClient === client.id ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}{" "}
                  {client.name}
                </span>
                <span className="text-right text-sm">{fmt(client.billed)}</span>
                <span className="text-right text-sm text-emerald-700">
                  {fmt(client.paid)}
                </span>
                <span className="text-right font-black text-red-600">
                  {fmt(client.balance)}
                </span>
              </button>
              {expandedClient === client.id && (
                <div className="bg-slate-50 px-5 py-3 space-y-2">
                  {client.invoices.map((row) => (
                    <div
                      key={row.invoice.id}
                      className={`bg-white border rounded-xl ${
                        verification.invoiceFindings.has(row.invoice.id)
                          ? "border-amber-300 ring-1 ring-amber-200"
                          : ""
                      }`}
                    >
                      <button
                        onClick={() =>
                          setExpandedInvoice(
                            expandedInvoice === row.invoice.id
                              ? null
                              : row.invoice.id,
                          )
                        }
                        className="w-full grid grid-cols-[1fr_repeat(4,120px)] gap-2 p-3 text-left text-xs"
                      >
                        <span className="font-bold flex gap-2 items-center flex-wrap">
                          <FileSearch size={14} />
                          {row.invoice.id}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${displayInvoiceStatus(row, endDate) === "Paid" ? "bg-emerald-100 text-emerald-800" : displayInvoiceStatus(row, endDate) === "Overdue" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                            {displayInvoiceStatus(row, endDate)}
                          </span>
                          {verification.invoiceFindings.has(row.invoice.id) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                              <AlertTriangle size={11} aria-hidden="true" />
                              Verification required
                            </span>
                          )}
                        </span>
                        <span>{row.invoice.date}</span>
                        <span>Due {row.invoice.dueDate || "—"}</span>
                        <span>{fmt(row.paid)} paid</span>
                        <span className="font-black text-right">
                          {fmt(row.balance)} due
                        </span>
                      </button>
                      {expandedInvoice === row.invoice.id && (
                        <InvoiceEvidence
                          invoice={row.invoice}
                          receipts={data.report.receipts.filter(
                            (r) => r.linkedInvoiceId === row.invoice.id,
                          )}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-5 border-b flex justify-between">
          <div>
            <h2 className="font-black text-slate-900">Forensic exceptions</h2>
            <p className="text-xs text-slate-500 mt-1">
              Legacy evidence gaps, false statuses, orphan payments and
              duplicate candidates.
            </p>
          </div>
          <span className="rounded-full bg-red-50 text-red-700 px-3 py-1 h-fit text-xs font-black">
            {data.report.exceptions.length}
          </span>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {data.report.exceptions.map((item, index) => (
            <div
              key={`${item.code}-${index}`}
              className="grid grid-cols-[90px_180px_1fr] gap-3 px-5 py-3 text-xs"
            >
              <span
                className={
                  item.severity === "critical"
                    ? "font-black text-red-600"
                    : "font-black text-amber-600"
                }
              >
                {item.severity.toUpperCase()}
              </span>
              <span className="font-mono">{item.code}</span>
              <span>
                <b>{item.recordId}</b> — {item.message}
              </span>
            </div>
          ))}
          {!data.report.exceptions.length && (
            <p className="p-8 text-center text-emerald-700 font-bold">
              No ledger exceptions detected.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
        <p>
          Generated{" "}
          {data.report.generatedAt
            ? new Date(data.report.generatedAt).toLocaleString()
            : new Date().toLocaleString()}{" "}
          · Reporting period {startDate}–{endDate} · Cash totals use approved receipts;
          revenue uses invoice net amounts excluding VAT.
        </p>
        {data.report.reportId && (
          <p className="font-mono break-all">
            Report ID: {data.report.reportId} · SHA-256:{" "}
            {data.report.reportHash}
          </p>
        )}
      </div>
    </div>
  );
};

const InvoiceEvidence: React.FC<{ invoice: Invoice; receipts: Invoice[] }> = ({
  invoice,
  receipts,
}) => (
  <div className="border-t p-4 grid lg:grid-cols-2 gap-4 text-xs">
    <div>
      <h4 className="font-black uppercase text-slate-500 mb-2">
        Invoice lines
      </h4>
      {invoice.items.map((item, index) => (
        <div key={index} className="flex justify-between py-1">
          <span>{item.description}</span>
          <b>{fmt(item.amount)}</b>
        </div>
      ))}
      <div className="flex justify-between border-t mt-2 pt-2">
        <span>Net / VAT / Gross</span>
        <b>
          {fmt(invoice.subtotal)} / {fmt(invoice.vatAmount)} /{" "}
          {fmt(invoice.total)}
        </b>
      </div>
    </div>
    <div>
      <h4 className="font-black uppercase text-slate-500 mb-2">
        Payment evidence
      </h4>
      {receipts.map((receipt) => (
        <div key={receipt.id} className="border rounded-xl p-3 mb-2">
          <div className="flex justify-between">
            <b>{receipt.id}</b>
            <b>{fmt(receipt.total)}</b>
          </div>
          <p className="mt-1">
            Paid {receipt.date} · {receipt.paymentMethod} · Ref{" "}
            {receipt.paymentReference || "MISSING"}
          </p>
          <p>
            Received by: <b>{receipt.receivedBy || "MISSING"}</b> · Recorded by:{" "}
            {receipt.receivedByUserId || receipt.createdBy || "Legacy/unknown"}
          </p>
          {receipt.receivingAccount && (
            <p>Receiving account: {receipt.receivingAccount}</p>
          )}
          {(receipt.hasPaymentProof ?? Boolean(receipt.proofPaymentUrl)) ? (
            <button
              type="button"
              onClick={() => openPaymentProof(receipt.id).catch(error => alert(error.message))}
              className="inline-block mt-2 font-bold text-indigo-600 hover:text-indigo-800"
            >
              Open proof of payment
            </button>
          ) : (
            <p className="mt-2 font-bold text-red-600">No proof attached</p>
          )}
        </div>
      ))}
      {!receipts.length && (
        <p className="text-red-600 font-bold">No allocated payment records.</p>
      )}
    </div>
  </div>
);

export default DirectorFinanceReport;
