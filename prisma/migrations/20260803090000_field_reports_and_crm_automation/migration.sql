-- Field operations are additive: existing CRM tasks and core records remain valid.
ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "automationKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "crm_tasks_automationKey_key" ON "crm_tasks"("automationKey");

DO $$
BEGIN
  CREATE TYPE "FieldReportType" AS ENUM ('CheckIn', 'CampaignProof', 'Issue');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FieldReportStatus" AS ENUM ('Pending', 'Submitted', 'Resolved');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "field_reports" (
  "id" TEXT NOT NULL,
  "type" "FieldReportType" NOT NULL,
  "billboardId" TEXT NOT NULL,
  "contractId" TEXT,
  "note" TEXT,
  "photoUrl" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "status" "FieldReportStatus" NOT NULL DEFAULT 'Submitted',
  "reportedBy" TEXT NOT NULL,
  "reportedByEmail" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "field_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "field_reports_billboardId_idx" ON "field_reports"("billboardId");
CREATE INDEX IF NOT EXISTS "field_reports_contractId_idx" ON "field_reports"("contractId");
CREATE INDEX IF NOT EXISTS "field_reports_status_idx" ON "field_reports"("status");
CREATE INDEX IF NOT EXISTS "field_reports_capturedAt_idx" ON "field_reports"("capturedAt");
