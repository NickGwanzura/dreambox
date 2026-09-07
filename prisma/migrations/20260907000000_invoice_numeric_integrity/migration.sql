-- Prevent non-finite PostgreSQL numeric values from entering the financial
-- ledger. `NOT VALID` keeps legacy rows available for controlled remediation
-- while enforcing the invariant on every new or changed row.
DO $$
BEGIN
  IF to_regclass('invoices') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_finite_amounts_chk') THEN
      ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_finite_amounts_chk"
        CHECK (
          "subtotal" <> 'NaN'::numeric
          AND "subtotal" >= 0
          AND "vatAmount" <> 'NaN'::numeric
          AND "vatAmount" >= 0
          AND "total" <> 'NaN'::numeric
          AND "total" >= 0
          AND ("discountAmount" IS NULL OR ("discountAmount" <> 'NaN'::numeric AND "discountAmount" >= 0))
        ) NOT VALID;
    END IF;
    CREATE INDEX IF NOT EXISTS "invoices_monthly_contract_month_idx"
      ON "invoices" ("contractId", left("date", 7))
      WHERE "type" = 'Invoice' AND COALESCE("isVoided", false) = false AND "contractId" IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('expenses') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_finite_amount_chk') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_finite_amount_chk"
      CHECK ("amount" <> 'NaN'::numeric AND "amount" >= 0) NOT VALID;
  END IF;
END $$;
