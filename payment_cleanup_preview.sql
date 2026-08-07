-- ============================================================================
-- payment_cleanup_preview.sql  —  READ-ONLY preview (no DML, no DDL)
-- ----------------------------------------------------------------------------
-- Lists the receipts ("payments") in `invoices` that have NO linked invoice so
-- we can decide which to reverse once maintenance lifts.
--
--   Group A  "junk"     4  receipts with no paymentMethod / reference  $2,550.00
--   Group B  "RCT-*"  130  receipts recorded Feb–Jun 2026               $84,726.55
--
-- Every query is a SELECT. Safe to re-run any time.
--
-- How to run (Dokploy Postgres console, or):
--   docker exec -i <postgres-container> psql -U <user> -d dreambox < payment_cleanup_preview.sql
-- ============================================================================

\echo '══════════════════════════════════════════════════════════════════════'
\echo ' 1. GROUP A — junk receipts (no payment method, no reference)'
\echo '══════════════════════════════════════════════════════════════════════'
SELECT
    id,
    date,
    total,
    "paymentMethod",
    "paymentReference",
    "receivingAccount",
    "createdAt",
    "createdBy",
    "assignedTo"
FROM invoices
WHERE type = 'Receipt'
  AND NOT "isVoided"
  AND "paymentMethod" IS NULL
ORDER BY "createdAt";

\echo ''
\echo '══════════════════════════════════════════════════════════════════════'
\echo ' 2. GROUP B — RCT-* receipts (have a method, but no invoice link)'
\echo '══════════════════════════════════════════════════════════════════════'
SELECT
    id,
    date,
    total,
    "paymentMethod",
    "paymentReference",
    "receivingAccount",
    "createdAt",
    "createdBy",
    "assignedTo"
FROM invoices
WHERE type = 'Receipt'
  AND NOT "isVoided"
  AND id LIKE 'RCT-%'
ORDER BY date, id;

\echo ''
\echo '══════════════════════════════════════════════════════════════════════'
\echo ' 3. SUMMARY — counts + totals per group and payment method'
\echo '══════════════════════════════════════════════════════════════════════'
SELECT 'Group A (junk, no method)' AS grp, count(*) AS rows, round(sum(total)::numeric, 2) AS total
FROM invoices WHERE type='Receipt' AND NOT "isVoided" AND "paymentMethod" IS NULL
UNION ALL
SELECT 'Group B (RCT-*)', count(*), round(sum(total)::numeric, 2)
FROM invoices WHERE type='Receipt' AND NOT "isVoided" AND id LIKE 'RCT-%'
UNION ALL
SELECT 'All unlinked receipts', count(*), round(sum(total)::numeric, 2)
FROM invoices WHERE type='Receipt' AND NOT "isVoided"
ORDER BY 1;

\echo ''
\echo 'Breakdown by method (Group B):'
SELECT "paymentMethod", count(*) AS rows, round(sum(total)::numeric, 2) AS total
FROM invoices
WHERE type='Receipt' AND NOT "isVoided" AND id LIKE 'RCT-%'
GROUP BY "paymentMethod" ORDER BY rows DESC;

\echo ''
\echo '══════════════════════════════════════════════════════════════════════'
\echo ' 4. SAFETY CHECKS — do any of these have allocations, links, or proof?'
\echo '══════════════════════════════════════════════════════════════════════'
\echo 'Receipts that appear in payment_allocations (would need reversing first):'
SELECT count(*) AS allocated_receipts
FROM payment_allocations
WHERE "receiptId" IN (
    SELECT id FROM invoices
    WHERE type='Receipt' AND NOT "isVoided"
      AND ("paymentMethod" IS NULL OR id LIKE 'RCT-%')
);

\echo 'Receipts whose linkedInvoiceId actually resolves (should be 0):'
SELECT count(*) AS resolved_links
FROM invoices r
WHERE r.type='Receipt' AND NOT r."isVoided"
  AND r."linkedInvoiceId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = r."linkedInvoiceId");

\echo 'Receipts with an uploaded payment proof (should be 0):'
SELECT count(*) AS with_proof
FROM invoices
WHERE type='Receipt' AND NOT "isVoided"
  AND ("paymentMethod" IS NULL OR id LIKE 'RCT-%')
  AND "proofPaymentUrl" IS NOT NULL;

\echo ''
\echo 'Accounting periods covering these dates (closed periods block reversal):'
SELECT ap.id, ap."startDate", ap."endDate", ap.status
FROM accounting_periods ap
WHERE ap."endDate" >= '2026-02-16' AND ap."startDate" <= '2026-06-09'
ORDER BY ap."startDate";

\echo ''
\echo '══════════════════════════════════════════════════════════════════════'
\echo ' 5. BIG PICTURE — all receipts, live vs voided, with audit events'
\echo '══════════════════════════════════════════════════════════════════════'
SELECT
    count(*) FILTER (WHERE NOT "isVoided") AS live_receipts,
    round(sum(total) FILTER (WHERE NOT "isVoided")::numeric, 2) AS live_total,
    count(*) FILTER (WHERE "isVoided") AS voided_receipts,
    count(*) FILTER (WHERE "linkedInvoiceId" IS NOT NULL) AS linked_receipts
FROM invoices WHERE type='Receipt';

\echo 'Audit events mentioning these receipts (creation/void history):'
SELECT a."createdAt", a.action, a."recordId", a."userEmail", left(a.details, 120) AS details
FROM audit_logs a
WHERE a."recordId" IN (
    SELECT id FROM invoices
    WHERE type='Receipt' AND NOT "isVoided"
      AND ("paymentMethod" IS NULL OR id LIKE 'RCT-%')
)
ORDER BY a."createdAt" DESC
LIMIT 25;

\echo ''
\echo '─── end of read-only preview ───'
