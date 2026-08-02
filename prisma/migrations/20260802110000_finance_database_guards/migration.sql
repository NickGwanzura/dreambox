-- Database-level finance guards.  These triggers complement the API checks and
-- protect direct SQL/import paths without rewriting legacy financial records.
--
-- All trigger installation is conditional because some restored/legacy databases
-- may be missing one of the columns introduced by earlier migrations.  A normal
-- Prisma deployment has those columns, installs every guard below, and can safely
-- re-run this file because functions are replaced and triggers are dropped first.

-- Durable, non-destructive queue for legacy duplicate payment references.  It
-- stores a snapshot of each duplicate group and never alters invoice/receipt rows.
CREATE TABLE IF NOT EXISTS "payment_reference_duplicate_queue" (
  "id" TEXT NOT NULL,
  "normalizedPaymentMethod" TEXT NOT NULL,
  "normalizedPaymentReference" TEXT NOT NULL,
  "receiptIds" JSONB NOT NULL,
  "duplicateCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reference_duplicate_queue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_reference_duplicate_queue_key"
  ON "payment_reference_duplicate_queue" ("normalizedPaymentMethod", "normalizedPaymentReference");
CREATE INDEX IF NOT EXISTS "payment_reference_duplicate_queue_status_idx"
  ON "payment_reference_duplicate_queue" ("status", "lastDetectedAt");

-- Closed accounting period checks are intentionally attached only to the financial
-- tables.  The accounting_periods table remains writable so the authenticated
-- accounting-period API can explicitly reopen a period before correcting data.
DO $$
BEGIN
  IF to_regclass('accounting_periods') IS NOT NULL
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'accounting_periods'
            AND column_name IN ('startDate', 'endDate', 'status')) = 3 THEN
    EXECUTE $period_function$
      CREATE OR REPLACE FUNCTION dreambox_assert_accounting_date_open(p_date TEXT, p_record_type TEXT)
      RETURNS VOID
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        -- Financial dates are stored as text.  Only canonical ISO dates can be
        -- compared safely; API validation rejects malformed values before writes.
        IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RETURN;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "accounting_periods" p
          WHERE LOWER(BTRIM(COALESCE(p."status", ''))) = 'closed'
            AND p."startDate" ~ '^\d{4}-\d{2}-\d{2}$'
            AND p."endDate" ~ '^\d{4}-\d{2}-\d{2}$'
            AND p."startDate" <= p_date
            AND p."endDate" >= p_date
        ) THEN
          RAISE EXCEPTION 'Accounting period is closed for % record dated %', p_record_type, p_date
            USING ERRCODE = '23514';
        END IF;
      END;
      $fn$;
    $period_function$;

    EXECUTE $period_range_function$
      CREATE OR REPLACE FUNCTION dreambox_assert_accounting_range_open(p_start_date TEXT, p_end_date TEXT, p_record_type TEXT)
      RETURNS VOID
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF p_start_date ~ '^\d{4}-\d{2}-\d{2}$'
           AND p_end_date ~ '^\d{4}-\d{2}-\d{2}$'
           AND p_start_date <= p_end_date THEN
          IF EXISTS (
            SELECT 1
            FROM "accounting_periods" p
            WHERE LOWER(BTRIM(COALESCE(p."status", ''))) = 'closed'
              AND p."startDate" ~ '^\d{4}-\d{2}-\d{2}$'
              AND p."endDate" ~ '^\d{4}-\d{2}-\d{2}$'
              AND p."startDate" <= p_end_date
              AND p."endDate" >= p_start_date
          ) THEN
            RAISE EXCEPTION 'Accounting period is closed for % record dated between % and %', p_record_type, p_start_date, p_end_date
              USING ERRCODE = '23514';
          END IF;
        ELSE
          PERFORM dreambox_assert_accounting_date_open(p_start_date, p_record_type);
          PERFORM dreambox_assert_accounting_date_open(p_end_date, p_record_type);
        END IF;
      END;
      $fn$;
    $period_range_function$;

    EXECUTE $financial_trigger_function$
      CREATE OR REPLACE FUNCTION dreambox_guard_closed_financial_period()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        -- On an update protect both the booked date and a proposed moved date;
        -- otherwise a direct write could move a closed-period record out first.
        IF TG_OP = 'UPDATE' THEN
          PERFORM dreambox_assert_accounting_date_open(OLD."date", TG_TABLE_NAME);
        END IF;
        PERFORM dreambox_assert_accounting_date_open(NEW."date", TG_TABLE_NAME);
        RETURN NEW;
      END;
      $fn$;
    $financial_trigger_function$;

    EXECUTE $outsourced_trigger_function$
      CREATE OR REPLACE FUNCTION dreambox_guard_closed_outsourced_period()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        -- Outsourced payout records cover a contract range.  Reject a write when
        -- either its old or proposed range overlaps any closed period.
        IF TG_OP = 'UPDATE' THEN
          PERFORM dreambox_assert_accounting_range_open(OLD."contractStart", OLD."contractEnd", TG_TABLE_NAME);
        END IF;
        PERFORM dreambox_assert_accounting_range_open(NEW."contractStart", NEW."contractEnd", TG_TABLE_NAME);
        RETURN NEW;
      END;
      $fn$;
    $outsourced_trigger_function$;

    IF to_regclass('invoices') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = ANY (current_schemas(false))
                     AND table_name = 'invoices' AND column_name = 'date') THEN
      EXECUTE 'DROP TRIGGER IF EXISTS invoices_closed_accounting_period_guard ON "invoices"';
      EXECUTE 'CREATE TRIGGER invoices_closed_accounting_period_guard BEFORE INSERT OR UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_closed_financial_period()';
    END IF;

    IF to_regclass('expenses') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = ANY (current_schemas(false))
                     AND table_name = 'expenses' AND column_name = 'date') THEN
      EXECUTE 'DROP TRIGGER IF EXISTS expenses_closed_accounting_period_guard ON "expenses"';
      EXECUTE 'CREATE TRIGGER expenses_closed_accounting_period_guard BEFORE INSERT OR UPDATE ON "expenses" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_closed_financial_period()';
    END IF;

    IF to_regclass('printing_jobs') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = ANY (current_schemas(false))
                     AND table_name = 'printing_jobs' AND column_name = 'date') THEN
      EXECUTE 'DROP TRIGGER IF EXISTS printing_jobs_closed_accounting_period_guard ON "printing_jobs"';
      EXECUTE 'CREATE TRIGGER printing_jobs_closed_accounting_period_guard BEFORE INSERT OR UPDATE ON "printing_jobs" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_closed_financial_period()';
    END IF;

    IF to_regclass('outsourced_billboards') IS NOT NULL
       AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
            WHERE table_schema = ANY (current_schemas(false))
              AND table_name = 'outsourced_billboards'
              AND column_name IN ('contractStart', 'contractEnd')) = 2 THEN
      EXECUTE 'DROP TRIGGER IF EXISTS outsourced_billboards_closed_accounting_period_guard ON "outsourced_billboards"';
      EXECUTE 'CREATE TRIGGER outsourced_billboards_closed_accounting_period_guard BEFORE INSERT OR UPDATE ON "outsourced_billboards" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_closed_outsourced_period()';
    END IF;
  END IF;
END $$;

-- Payment-allocation guards are installed only after the ledger columns exist.
-- Advisory locks serialize a receipt/invoice state transition with an allocation
-- write even when direct SQL is used outside the application's serializable flow.
DO $$
BEGIN
  IF to_regclass('invoices') IS NOT NULL
     AND to_regclass('payment_allocations') IS NOT NULL
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'invoices'
            AND column_name IN ('id', 'type', 'isVoided', 'approvalStatus', 'total')) = 5
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'payment_allocations'
            AND column_name IN ('id', 'receiptId', 'invoiceId', 'amount', 'isReversed')) = 5 THEN
    EXECUTE $allocation_function$
      CREATE OR REPLACE FUNCTION dreambox_guard_active_payment_allocation()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        receipt_row RECORD;
        invoice_row RECORD;
        effective_allocated_total NUMERIC;
      BEGIN
        -- Reversals must remain possible after a receipt is rejected or a
        -- document is voided.  Only active allocations are constrained.
        IF COALESCE(NEW."isReversed", FALSE) THEN
          RETURN NEW;
        END IF;
        IF NEW."receiptId" IS NULL OR NEW."invoiceId" IS NULL OR NEW."amount" IS NULL OR NEW."amount" <= 0 THEN
          RAISE EXCEPTION 'An active payment allocation needs a receipt, an invoice, and a positive amount'
            USING ERRCODE = '23514';
        END IF;
        IF NEW."receiptId" = NEW."invoiceId" THEN
          RAISE EXCEPTION 'A payment allocation cannot use the same document as receipt and invoice'
            USING ERRCODE = '23514';
        END IF;

        -- Lock in a stable order to avoid deadlocks between cross-document writes.
        IF NEW."receiptId" < NEW."invoiceId" THEN
          PERFORM pg_advisory_xact_lock(hashtext('dreambox-payment-document:' || NEW."receiptId"));
          PERFORM pg_advisory_xact_lock(hashtext('dreambox-payment-document:' || NEW."invoiceId"));
          PERFORM 1 FROM "invoices" WHERE "id" = NEW."receiptId" FOR UPDATE;
          PERFORM 1 FROM "invoices" WHERE "id" = NEW."invoiceId" FOR UPDATE;
        ELSE
          PERFORM pg_advisory_xact_lock(hashtext('dreambox-payment-document:' || NEW."invoiceId"));
          PERFORM pg_advisory_xact_lock(hashtext('dreambox-payment-document:' || NEW."receiptId"));
          PERFORM 1 FROM "invoices" WHERE "id" = NEW."invoiceId" FOR UPDATE;
          PERFORM 1 FROM "invoices" WHERE "id" = NEW."receiptId" FOR UPDATE;
        END IF;

        SELECT * INTO receipt_row FROM "invoices" WHERE "id" = NEW."receiptId";
        IF NOT FOUND OR receipt_row."type" IS DISTINCT FROM 'Receipt' THEN
          RAISE EXCEPTION 'Only receipt documents may fund payment allocations' USING ERRCODE = '23514';
        END IF;
        IF COALESCE(receipt_row."isVoided", FALSE)
           OR COALESCE(receipt_row."approvalStatus", 'NotRequired') NOT IN ('Approved', 'NotRequired') THEN
          RAISE EXCEPTION 'Pending, rejected, or voided receipts cannot have active payment allocations'
            USING ERRCODE = '23514';
        END IF;

        SELECT * INTO invoice_row FROM "invoices" WHERE "id" = NEW."invoiceId";
        IF NOT FOUND OR invoice_row."type" IS DISTINCT FROM 'Invoice' THEN
          RAISE EXCEPTION 'Only invoice documents may receive payment allocations' USING ERRCODE = '23514';
        END IF;
        IF COALESCE(invoice_row."isVoided", FALSE) THEN
          RAISE EXCEPTION 'Voided invoices cannot receive active payment allocations' USING ERRCODE = '23514';
        END IF;

        -- Count only effective allocations: reversed rows and allocations funded
        -- by an ineffective legacy receipt do not reduce the invoice balance.
        SELECT COALESCE(SUM(a."amount"), 0) INTO effective_allocated_total
        FROM "payment_allocations" a
        JOIN "invoices" r ON r."id" = a."receiptId"
        WHERE a."invoiceId" = NEW."invoiceId"
          AND a."isReversed" = FALSE
          AND a."id" IS DISTINCT FROM NEW."id"
          AND r."type" = 'Receipt'
          AND COALESCE(r."isVoided", FALSE) = FALSE
          AND COALESCE(r."approvalStatus", 'NotRequired') IN ('Approved', 'NotRequired');

        IF effective_allocated_total + NEW."amount" > invoice_row."total" + 0.005 THEN
          RAISE EXCEPTION 'Payment allocations exceed the invoice total after effective allocations'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $fn$;
    $allocation_function$;

    EXECUTE $document_state_function$
      CREATE OR REPLACE FUNCTION dreambox_guard_document_allocation_state()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        effective_allocated_total NUMERIC;
      BEGIN
        -- Use the same lock key as the allocation trigger.  This prevents an
        -- approval/rejection/void transition from racing a direct allocation.
        PERFORM pg_advisory_xact_lock(hashtext('dreambox-payment-document:' || NEW."id"));

        IF NEW."type" IS DISTINCT FROM 'Receipt'
           AND EXISTS (SELECT 1 FROM "payment_allocations" WHERE "receiptId" = NEW."id" AND "isReversed" = FALSE) THEN
          RAISE EXCEPTION 'A document with active allocations cannot stop being a receipt' USING ERRCODE = '23514';
        END IF;
        IF NEW."type" IS DISTINCT FROM 'Invoice'
           AND EXISTS (SELECT 1 FROM "payment_allocations" WHERE "invoiceId" = NEW."id" AND "isReversed" = FALSE) THEN
          RAISE EXCEPTION 'A document with active allocations cannot stop being an invoice' USING ERRCODE = '23514';
        END IF;

        IF NEW."type" = 'Receipt'
           AND (COALESCE(NEW."isVoided", FALSE)
                OR COALESCE(NEW."approvalStatus", 'NotRequired') IN ('Pending', 'Rejected'))
           AND EXISTS (SELECT 1 FROM "payment_allocations" WHERE "receiptId" = NEW."id" AND "isReversed" = FALSE) THEN
          RAISE EXCEPTION 'Reverse active allocations before rejecting or voiding a receipt' USING ERRCODE = '23514';
        END IF;

        IF NEW."type" = 'Invoice' THEN
          IF COALESCE(NEW."isVoided", FALSE)
             AND EXISTS (SELECT 1 FROM "payment_allocations" WHERE "invoiceId" = NEW."id" AND "isReversed" = FALSE) THEN
            RAISE EXCEPTION 'Reverse active allocations before voiding an invoice' USING ERRCODE = '23514';
          END IF;

          SELECT COALESCE(SUM(a."amount"), 0) INTO effective_allocated_total
          FROM "payment_allocations" a
          JOIN "invoices" r ON r."id" = a."receiptId"
          WHERE a."invoiceId" = NEW."id"
            AND a."isReversed" = FALSE
            AND r."type" = 'Receipt'
            AND COALESCE(r."isVoided", FALSE) = FALSE
            AND COALESCE(r."approvalStatus", 'NotRequired') IN ('Approved', 'NotRequired');

          IF NOT COALESCE(NEW."isVoided", FALSE)
             AND effective_allocated_total > NEW."total" + 0.005 THEN
            RAISE EXCEPTION 'Invoice total cannot be reduced below effective payment allocations' USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $fn$;
    $document_state_function$;

    EXECUTE 'DROP TRIGGER IF EXISTS payment_allocations_active_guard ON "payment_allocations"';
    EXECUTE 'CREATE TRIGGER payment_allocations_active_guard BEFORE INSERT OR UPDATE ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_active_payment_allocation()';
    EXECUTE 'DROP TRIGGER IF EXISTS invoices_payment_allocation_state_guard ON "invoices"';
    EXECUTE 'CREATE TRIGGER invoices_payment_allocation_state_guard BEFORE UPDATE OF "type", "isVoided", "approvalStatus", "total" ON "invoices" FOR EACH ROW EXECUTE FUNCTION dreambox_guard_document_allocation_state()';
  END IF;
END $$;

-- Capture the current legacy duplicate groups only when all lookup columns exist.
-- Existing financial rows remain unchanged; an already queued group is refreshed.
DO $$
BEGIN
  IF to_regclass('invoices') IS NOT NULL
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'invoices'
            AND column_name IN ('id', 'type', 'isVoided', 'paymentMethod', 'paymentReference', 'createdAt')) = 6 THEN
    EXECUTE $queue_refresh$
      INSERT INTO "payment_reference_duplicate_queue" (
        "id", "normalizedPaymentMethod", "normalizedPaymentReference", "receiptIds", "duplicateCount", "firstDetectedAt", "lastDetectedAt", "createdAt", "updatedAt"
      )
      SELECT
        md5(LOWER(BTRIM("paymentMethod")) || chr(31) || LOWER(BTRIM("paymentReference"))),
        LOWER(BTRIM("paymentMethod")),
        LOWER(BTRIM("paymentReference")),
        jsonb_agg("id" ORDER BY "createdAt", "id"),
        COUNT(*)::INTEGER,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM "invoices"
      WHERE "type" = 'Receipt'
        AND COALESCE("isVoided", FALSE) = FALSE
        AND NULLIF(BTRIM("paymentMethod"), '') IS NOT NULL
        AND NULLIF(BTRIM("paymentReference"), '') IS NOT NULL
      GROUP BY LOWER(BTRIM("paymentMethod")), LOWER(BTRIM("paymentReference"))
      HAVING COUNT(*) > 1
      ON CONFLICT ("normalizedPaymentMethod", "normalizedPaymentReference") DO UPDATE
      SET "receiptIds" = EXCLUDED."receiptIds",
          "duplicateCount" = EXCLUDED."duplicateCount",
          "lastDetectedAt" = EXCLUDED."lastDetectedAt",
          "updatedAt" = EXCLUDED."updatedAt";
    $queue_refresh$;
  END IF;
END $$;

-- Apply-safe unique-index path.  This helper returns false while a duplicate
-- remains, so operators can call it after reviewing/resolving the durable queue:
--   SELECT dreambox_apply_active_payment_reference_unique_index();
-- It intentionally never deletes, voids, or rewrites a financial record.
DO $$
BEGIN
  IF to_regclass('invoices') IS NOT NULL
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'invoices'
            AND column_name IN ('type', 'isVoided', 'paymentMethod', 'paymentReference')) = 4 THEN
    EXECUTE $unique_index_function$
      CREATE OR REPLACE FUNCTION dreambox_apply_active_payment_reference_unique_index()
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF to_regclass('invoices_active_payment_reference_key') IS NOT NULL THEN
          RETURN TRUE;
        END IF;
        IF EXISTS (
          SELECT 1
          FROM "invoices"
          WHERE "type" = 'Receipt'
            AND COALESCE("isVoided", FALSE) = FALSE
            AND NULLIF(BTRIM("paymentMethod"), '') IS NOT NULL
            AND NULLIF(BTRIM("paymentReference"), '') IS NOT NULL
          GROUP BY LOWER(BTRIM("paymentMethod")), LOWER(BTRIM("paymentReference"))
          HAVING COUNT(*) > 1
        ) THEN
          RETURN FALSE;
        END IF;

        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "invoices_active_payment_reference_key" ON "invoices" (LOWER(BTRIM("paymentMethod")), LOWER(BTRIM("paymentReference"))) WHERE "type" = ''Receipt'' AND COALESCE("isVoided", FALSE) = FALSE AND NULLIF(BTRIM("paymentMethod"), '''') IS NOT NULL AND NULLIF(BTRIM("paymentReference"), '''') IS NOT NULL';
        RETURN TRUE;
      END;
      $fn$;
    $unique_index_function$;

    -- Safe on clean databases; returns false without error when legacy duplicates
    -- are present, leaving the queue as the explicit remediation worklist.
    PERFORM dreambox_apply_active_payment_reference_unique_index();
  END IF;
END $$;
