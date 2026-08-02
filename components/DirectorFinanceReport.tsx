import React, { useEffect, useMemo, useState } from "react";
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

const fmt = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;

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
        getExpenses().filter((e) => inPeriod(e.date)),
        new Date(`${endDate}T23:59:59Z`),
      );
    const periodInvoices = report.invoices.filter((row) =>
      inPeriod(row.invoice.date),
    );
    const periodReceipts = report.receipts.filter((receipt) =>
      inPeriod(receipt.date),
    );
    return { report, periodInvoices, periodReceipts };
  }, [version, startDate, endDate, remoteReport]);

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
        row.invoice.status,
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
              onChange={(e) => setStartDate(e.target.value)}
              className="block mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
            onClick={() => window.print()}
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
              <dd className="font-bold">{fmt(data.report.totals.expenses)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt>Net less expenses</dt>
              <dd className="font-black">
                {fmt(periodNet - data.report.totals.expenses)}
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
                      className="bg-white border rounded-xl"
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
                        <span className="font-bold flex gap-2 items-center">
                          <FileSearch size={14} />
                          {row.invoice.id}
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
          · Reporting period {startDate}–{endDate} · Cash totals use receipts;
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
          {receipt.proofPaymentUrl ? (
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
