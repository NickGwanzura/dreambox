-- Serialize billboard booking writes and reject overlapping active side/slot
-- bookings even when an import or direct SQL path bypasses the API. Contract
-- dates are legacy YYYY-MM-DD text, so canonical text comparison is deliberate
-- here. Active writes fail closed when their own dates are invalid, while
-- malformed legacy rows remain ignored in conflict scans rather than being
-- rewritten destructively.
DO $$
BEGIN
  IF to_regclass('contracts') IS NOT NULL
     AND (SELECT COUNT(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = ANY (current_schemas(false))
            AND table_name = 'contracts'
            AND column_name IN ('id', 'billboardId', 'startDate', 'endDate', 'status', 'slotNumber', 'side')) = 7 THEN
    EXECUTE $date_function$
      CREATE OR REPLACE FUNCTION dreambox_is_canonical_contract_date(p_date TEXT)
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      IMMUTABLE
      AS $fn$
      BEGIN
        -- Keep the parser behind a shape guard: legacy free-form values must
        -- simply be treated as invalid, never make an overlap query fail.
        IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RETURN FALSE;
        END IF;

        -- to_date normalizes impossible calendar values; the round trip makes
        -- those values (for example 2026-13-01 or 2026-02-31) fail closed.
        -- Some shape-valid values can still be outside PostgreSQL's date
        -- parser range. This helper is also called from conflict scans, so it
        -- must fail closed rather than propagate a parser exception.
        BEGIN
          RETURN to_char(to_date(p_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = p_date;
        EXCEPTION WHEN OTHERS THEN
          RETURN FALSE;
        END;
      END;
      $fn$;
    $date_function$;

    EXECUTE $booking_function$
      CREATE OR REPLACE FUNCTION dreambox_prevent_overlapping_contract_booking()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF NEW."status" IS DISTINCT FROM 'Active' THEN
          RETURN NEW;
        END IF;

        -- Reject bad incoming active ranges before acquiring the booking lock
        -- or examining existing records. The text columns intentionally use
        -- canonical ISO comparison after this format validation.
        IF NEW."startDate" IS NULL
           OR NEW."endDate" IS NULL
           OR NOT dreambox_is_canonical_contract_date(NEW."startDate")
           OR NOT dreambox_is_canonical_contract_date(NEW."endDate") THEN
          RAISE EXCEPTION 'Active contracts require startDate and endDate in YYYY-MM-DD format'
            USING ERRCODE = '22007';
        END IF;

        IF NEW."startDate" > NEW."endDate" THEN
          RAISE EXCEPTION 'Active contract startDate must not be after endDate'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."billboardId" IS NULL THEN
          RETURN NEW;
        END IF;

        -- One transaction-level lock per billboard makes the conflict query and
        -- ensuing write atomic across concurrent sessions.
        PERFORM pg_advisory_xact_lock(hashtext('dreambox-contract-booking:' || NEW."billboardId"));

        IF NEW."slotNumber" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "contracts" existing
          WHERE existing."id" <> NEW."id"
            AND existing."billboardId" = NEW."billboardId"
            AND existing."status" = 'Active'
            AND existing."slotNumber" = NEW."slotNumber"
            AND existing."startDate" ~ '^\d{4}-\d{2}-\d{2}$'
            AND existing."endDate" ~ '^\d{4}-\d{2}-\d{2}$'
            AND dreambox_is_canonical_contract_date(existing."startDate")
            AND dreambox_is_canonical_contract_date(existing."endDate")
            AND existing."startDate" <= existing."endDate"
            AND existing."startDate" <= NEW."endDate"
            AND existing."endDate" >= NEW."startDate"
        ) THEN
          RAISE EXCEPTION 'Slot % is already booked for these dates', NEW."slotNumber"
            USING ERRCODE = '23P01';
        END IF;

        IF NEW."slotNumber" IS NULL
           AND NEW."side" IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM "contracts" existing
             WHERE existing."id" <> NEW."id"
               AND existing."billboardId" = NEW."billboardId"
               AND existing."status" = 'Active'
               AND existing."side" IS NOT NULL
               AND existing."startDate" ~ '^\d{4}-\d{2}-\d{2}$'
               AND existing."endDate" ~ '^\d{4}-\d{2}-\d{2}$'
               AND dreambox_is_canonical_contract_date(existing."startDate")
               AND dreambox_is_canonical_contract_date(existing."endDate")
               AND existing."startDate" <= existing."endDate"
               AND existing."startDate" <= NEW."endDate"
               AND existing."endDate" >= NEW."startDate"
               AND (
                 existing."side" = 'Both'
                 OR NEW."side" = 'Both'
                 OR existing."side" = NEW."side"
               )
           ) THEN
          RAISE EXCEPTION 'Side % is already booked for these dates', NEW."side"
            USING ERRCODE = '23P01';
        END IF;

        RETURN NEW;
      END;
      $fn$;
    $booking_function$;

    EXECUTE 'DROP TRIGGER IF EXISTS contracts_booking_integrity_guard ON "contracts"';
    EXECUTE 'CREATE TRIGGER contracts_booking_integrity_guard BEFORE INSERT OR UPDATE ON "contracts" FOR EACH ROW EXECUTE FUNCTION dreambox_prevent_overlapping_contract_booking()';
  END IF;
END $$;
