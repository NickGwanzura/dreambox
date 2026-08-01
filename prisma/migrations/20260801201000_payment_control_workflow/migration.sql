ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'NotRequired';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT;
CREATE INDEX IF NOT EXISTS "invoices_approvalStatus_idx" ON "invoices"("approvalStatus");

CREATE TABLE IF NOT EXISTS "payment_reviews" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "assignedTo" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_reviews_receiptId_key" ON "payment_reviews"("receiptId");
CREATE INDEX IF NOT EXISTS "payment_reviews_status_createdAt_idx" ON "payment_reviews"("status", "createdAt");

-- Create the race-proof uniqueness guard only when legacy references are clean.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "invoices"
    WHERE "type" = 'Receipt' AND "isVoided" = false AND "paymentReference" IS NOT NULL
    GROUP BY LOWER(BTRIM("paymentMethod")), LOWER(BTRIM("paymentReference")) HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "invoices_active_payment_reference_key"
      ON "invoices" (LOWER(BTRIM("paymentMethod")), LOWER(BTRIM("paymentReference")))
      WHERE "type" = 'Receipt' AND "isVoided" = false AND "paymentReference" IS NOT NULL;
  END IF;
END $$;
