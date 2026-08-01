ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dueDate" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "receivedByUserId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "receivingAccount" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "proofPaymentUrl" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "proofOriginalName" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "proofMimeType" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "proofUploadedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "recordedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "isVoided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "voidedBy" TEXT;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "beforeData" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "afterData" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE TABLE IF NOT EXISTS "payment_allocations" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL,
  "allocatedBy" TEXT NOT NULL,
  "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isReversed" BOOLEAN NOT NULL DEFAULT false,
  "reversedAt" TIMESTAMP(3),
  "reversedBy" TEXT,
  "reason" TEXT,
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_allocations_receiptId_invoiceId_key" ON "payment_allocations"("receiptId", "invoiceId");
CREATE INDEX IF NOT EXISTS "payment_allocations_receiptId_idx" ON "payment_allocations"("receiptId");
CREATE INDEX IF NOT EXISTS "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");
CREATE INDEX IF NOT EXISTS "invoices_isVoided_idx" ON "invoices"("isVoided");
CREATE INDEX IF NOT EXISTS "invoices_paymentReference_idx" ON "invoices"("paymentReference");

ALTER TABLE "invoices"
  ALTER COLUMN "subtotal" TYPE NUMERIC(18,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "discountAmount" TYPE NUMERIC(18,2) USING ROUND("discountAmount"::numeric, 2),
  ALTER COLUMN "vatAmount" TYPE NUMERIC(18,2) USING ROUND("vatAmount"::numeric, 2),
  ALTER COLUMN "total" TYPE NUMERIC(18,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE NUMERIC(18,2) USING ROUND("amount"::numeric, 2);

UPDATE "invoices"
SET "dueDate" = ("date"::date + INTERVAL '30 days')::date::text
WHERE "type" = 'Invoice' AND "dueDate" IS NULL AND "date" ~ '^\d{4}-\d{2}-\d{2}$';

-- Preserve legacy rows but flag gaps for remediation rather than fabricating evidence.
UPDATE "invoices"
SET "recordedAt" = COALESCE("recordedAt", "createdAt"),
    "postedAt" = COALESCE("postedAt", "createdAt")
WHERE "type" = 'Receipt';

INSERT INTO "payment_allocations" ("id", "receiptId", "invoiceId", "amount", "allocatedBy", "allocatedAt")
SELECT gen_random_uuid()::text, r."id", r."linkedInvoiceId", r."total", COALESCE(r."createdBy", 'legacy-migration'), COALESCE(r."createdAt", CURRENT_TIMESTAMP)
FROM "invoices" r
WHERE r."type" = 'Receipt' AND r."linkedInvoiceId" IS NOT NULL AND r."isVoided" = false
ON CONFLICT ("receiptId", "invoiceId") DO NOTHING;
