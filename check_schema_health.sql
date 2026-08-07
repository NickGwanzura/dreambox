-- ============================================================================
-- Dreambox production schema health check — READ-ONLY (no DDL/DML anywhere).
--
-- Run this against the Dokploy Postgres database to see exactly which schema
-- objects the boot-time self-heal guards in server.ts will (re)create, and
-- which are already in place. Output: one row per object with OK / MISSING,
-- plus a summary line.
--
-- How to run:
--   Option A — Dokploy dashboard → Postgres service → Terminal/Console, paste.
--   Option B — from the host:
--       docker exec -i <postgres-container> psql -U <user> -d <dbname> < check_schema_health.sql
--
-- Nothing here modifies the database. It is safe to run repeatedly.
-- ============================================================================

WITH
present_col AS (
  SELECT table_name || '.' || column_name AS obj
  FROM information_schema.columns
  WHERE table_schema = current_schema()
),
present_tbl AS (
  SELECT tablename AS obj
  FROM pg_tables
  WHERE schemaname = current_schema()
),
present_idx AS (
  SELECT indexname AS obj
  FROM pg_indexes
  WHERE schemaname = current_schema()
),
present_trg AS (
  SELECT tgname AS obj
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgrelid IN (
      SELECT c.oid FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
    )
),
present_fn AS (
  SELECT proname AS obj
  FROM pg_proc
  WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
    AND proname NOT LIKE 'pg_%'
),
present_type AS (
  SELECT typname AS obj
  FROM pg_type
  WHERE typtype = 'e'  -- enum types only
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
),
wanted(obj, kind) AS (
  VALUES
    -- ── columns (boot self-heal targets) ───────────────────────────────────
    ('users.sessionVersion',                      'column'),
    ('invoices.dueDate',                          'column'),
    ('invoices.receivedBy',                       'column'),
    ('invoices.receivedByUserId',                 'column'),
    ('invoices.receivingAccount',                 'column'),
    ('invoices.proofPaymentUrl',                  'column'),
    ('invoices.proofOriginalName',                'column'),
    ('invoices.proofMimeType',                    'column'),
    ('invoices.proofUploadedAt',                  'column'),
    ('invoices.recordedAt',                       'column'),
    ('invoices.postedAt',                         'column'),
    ('invoices.approvalStatus',                   'column'),
    ('invoices.approvedBy',                       'column'),
    ('invoices.approvedAt',                       'column'),
    ('invoices.approvalNote',                     'column'),
    ('invoices.isVoided',                         'column'),
    ('invoices.voidReason',                       'column'),
    ('invoices.voidedAt',                         'column'),
    ('invoices.voidedBy',                         'column'),
    ('invoices.linkedInvoiceId',                  'column'),
    ('contracts.sourceQuotationId',               'column'),
    ('company_profile.campaignGallery',           'column'),
    ('expenses.clientId',                         'column'),
    ('expenses.contractId',                       'column'),
    ('audit_logs.beforeData',                     'column'),
    ('audit_logs.afterData',                      'column'),
    ('audit_logs.requestId',                      'column'),
    ('audit_logs.ipAddress',                      'column'),
    ('audit_logs.userAgent',                      'column'),
    ('audit_logs.source',                         'column'),
    ('audit_logs.previousHash',                   'column'),
    ('audit_logs.eventHash',                      'column'),
    ('crm_tasks.automationKey',                   'column'),
    -- ── tables ──────────────────────────────────────────────────────────────
    ('accounting_periods',                        'table'),
    ('payment_allocations',                       'table'),
    ('payment_reviews',                           'table'),
    ('payment_reference_duplicate_queue',         'table'),
    ('field_reports',                             'table'),
    -- ── enum types ──────────────────────────────────────────────────────────
    ('FieldReportType',                           'enum'),
    ('FieldReportStatus',                         'enum'),
    ('QuoteStatus',                               'enum'),
    ('InvoiceType',                               'enum'),
    -- ── indexes ─────────────────────────────────────────────────────────────
    ('expenses_clientId_idx',                     'index'),
    ('expenses_contractId_idx',                   'index'),
    ('crm_tasks_automationKey_key',               'index'),
    ('contracts_sourceQuotationId_idx',           'index'),
    ('invoices_approvalStatus_idx',               'index'),
    ('invoices_isVoided_idx',                     'index'),
    ('invoices_paymentReference_idx',             'index'),
    ('audit_logs_source_idx',                     'index'),
    ('accounting_periods_startDate_endDate_key',  'index'),
    ('accounting_periods_status_startDate_endDate_idx', 'index'),
    ('payment_allocations_receiptId_invoiceId_key', 'index'),
    ('payment_allocations_receiptId_idx',         'index'),
    ('payment_allocations_invoiceId_idx',         'index'),
    ('payment_reviews_receiptId_key',             'index'),
    ('payment_reviews_status_createdAt_idx',      'index'),
    ('payment_reference_duplicate_queue_key',     'index'),
    ('payment_reference_duplicate_queue_status_idx', 'index'),
    ('invoices_active_payment_reference_key',     'index'),
    ('field_reports_billboardId_idx',             'index'),
    ('field_reports_contractId_idx',              'index'),
    ('field_reports_status_idx',                  'index'),
    ('field_reports_capturedAt_idx',              'index'),
    -- ── triggers (finance + audit guards) ───────────────────────────────────
    ('invoices_closed_accounting_period_guard',   'trigger'),
    ('expenses_closed_accounting_period_guard',   'trigger'),
    ('printing_jobs_closed_accounting_period_guard', 'trigger'),
    ('outsourced_billboards_closed_accounting_period_guard', 'trigger'),
    ('payment_allocations_active_guard',          'trigger'),
    ('invoices_payment_allocation_state_guard',   'trigger'),
    ('audit_logs_prepare_event',                  'trigger'),
    ('audit_logs_append_only',                    'trigger'),
    -- ── functions (finance + audit guards) ──────────────────────────────────
    ('dreambox_assert_accounting_date_open',      'function'),
    ('dreambox_assert_accounting_range_open',     'function'),
    ('dreambox_guard_closed_financial_period',    'function'),
    ('dreambox_guard_closed_outsourced_period',   'function'),
    ('dreambox_guard_active_payment_allocation',  'function'),
    ('dreambox_guard_document_allocation_state',  'function'),
    ('dreambox_apply_active_payment_reference_unique_index', 'function'),
    ('dreambox_prepare_audit_event',              'function'),
    ('dreambox_prevent_audit_mutation',           'function')
),
checks(obj, kind, present) AS (
  SELECT w.obj, w.kind,
         CASE w.kind
           WHEN 'column'   THEN EXISTS (SELECT 1 FROM present_col c WHERE c.obj = w.obj)
           WHEN 'table'    THEN EXISTS (SELECT 1 FROM present_tbl t WHERE t.obj = w.obj)
           WHEN 'index'    THEN EXISTS (SELECT 1 FROM present_idx i WHERE i.obj = w.obj)
           WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM present_trg g WHERE g.obj = w.obj)
           WHEN 'function' THEN EXISTS (SELECT 1 FROM present_fn f WHERE f.obj = w.obj)
           WHEN 'enum'     THEN EXISTS (SELECT 1 FROM present_type t WHERE t.obj = w.obj)
           ELSE FALSE
         END AS present
  FROM wanted w
)
SELECT obj,
       kind,
       CASE WHEN present THEN 'OK      ' ELSE 'MISSING ' END AS status
FROM checks
UNION ALL
-- Special check: the InvoiceType enum must contain the 'Proforma' value.
SELECT 'InvoiceType.Proforma' AS obj,
       'enum-value' AS kind,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'InvoiceType' AND e.enumlabel = 'Proforma'
       ) THEN 'OK      ' ELSE 'MISSING ' END AS status
UNION ALL
-- Summary row (self-contained so the script stays a single statement).
SELECT 'SUMMARY' AS obj,
       'totals' AS kind,
       (SELECT COUNT(*) FILTER (WHERE NOT present)::text || ' MISSING / ' || COUNT(*)::text || ' checked'
        FROM (
          SELECT present FROM checks
          UNION ALL
          SELECT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'InvoiceType' AND e.enumlabel = 'Proforma'
          )
        ) s) AS status
ORDER BY kind, obj;
