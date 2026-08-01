CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- New receipts must carry complete evidence. NOT VALID preserves legacy rows
-- for remediation while still enforcing the rule for all new/changed rows.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_receipt_evidence_chk"
  CHECK (
    "type" <> 'Receipt' OR "isVoided" = true OR (
      NULLIF(BTRIM("paymentMethod"), '') IS NOT NULL
      AND NULLIF(BTRIM("paymentReference"), '') IS NOT NULL
      AND NULLIF(BTRIM("receivedBy"), '') IS NOT NULL
      AND NULLIF(BTRIM("receivedByUserId"), '') IS NOT NULL
      AND "recordedAt" IS NOT NULL
      AND "postedAt" IS NOT NULL
      AND (
        "paymentMethod" !~* '(bank|transfer|rtgs|swift|wire)'
        OR (
          NULLIF(BTRIM("receivingAccount"), '') IS NOT NULL
          AND NULLIF(BTRIM("proofPaymentUrl"), '') IS NOT NULL
          AND NULLIF(BTRIM("proofOriginalName"), '') IS NOT NULL
          AND "proofMimeType" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
          AND "proofUploadedAt" IS NOT NULL
        )
      )
    )
  ) NOT VALID;

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_positive_amount_chk" CHECK ("amount" > 0) NOT VALID,
  ADD CONSTRAINT "payment_allocations_distinct_documents_chk" CHECK ("receiptId" <> "invoiceId") NOT VALID,
  ADD CONSTRAINT "payment_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SERVER';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "previousHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "eventHash" TEXT;
CREATE INDEX IF NOT EXISTS "audit_logs_source_idx" ON "audit_logs"("source");

-- Establish a verifiable baseline for legacy rows. New rows form a serial hash
-- chain from the latest baseline/event and cannot be modified or deleted.
UPDATE "audit_logs"
SET "eventHash" = encode(digest(concat_ws('|', "id", "action", "details", COALESCE("userEmail", ''), "createdAt"::text), 'sha256'), 'hex')
WHERE "eventHash" IS NULL;

CREATE OR REPLACE FUNCTION dreambox_prepare_audit_event()
RETURNS trigger AS $$
DECLARE
  prior_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dreambox-audit-chain'));
  SELECT "eventHash" INTO prior_hash
  FROM "audit_logs"
  ORDER BY "createdAt" DESC, "id" DESC
  LIMIT 1;

  NEW."previousHash" := prior_hash;
  NEW."eventHash" := encode(digest(concat_ws('|',
    COALESCE(prior_hash, ''), NEW."id", NEW."action", NEW."details",
    COALESCE(NEW."userId", ''), COALESCE(NEW."userEmail", ''),
    COALESCE(NEW."tableName", ''), COALESCE(NEW."recordId", ''),
    COALESCE(NEW."source", 'SERVER'), NEW."createdAt"::text,
    COALESCE(NEW."beforeData"::text, ''), COALESCE(NEW."afterData"::text, '')
  ), 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dreambox_prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only and cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_logs_prepare_event" ON "audit_logs";
CREATE TRIGGER "audit_logs_prepare_event"
BEFORE INSERT ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION dreambox_prepare_audit_event();

DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION dreambox_prevent_audit_mutation();
