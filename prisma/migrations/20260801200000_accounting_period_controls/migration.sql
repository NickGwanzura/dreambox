CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedBy" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_startDate_endDate_key" ON "accounting_periods"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "accounting_periods_status_startDate_endDate_idx" ON "accounting_periods"("status", "startDate", "endDate");
