-- Add contract_amendments table for tracking contract extensions, reductions, and rate changes
CREATE TABLE IF NOT EXISTS "contract_amendments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "oldStartDate" TEXT NOT NULL,
    "oldEndDate" TEXT NOT NULL,
    "newStartDate" TEXT NOT NULL,
    "newEndDate" TEXT NOT NULL,
    "oldMonthlyRate" DOUBLE PRECISION NOT NULL,
    "newMonthlyRate" DOUBLE PRECISION NOT NULL,
    "oldTotalValue" DOUBLE PRECISION NOT NULL,
    "newTotalValue" DOUBLE PRECISION NOT NULL,
    "monthsChanged" DOUBLE PRECISION NOT NULL,
    "financialImpact" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "invoiceImpactNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_amendments_contractId_idx" ON "contract_amendments"("contractId");
