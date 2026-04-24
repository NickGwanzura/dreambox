-- Adds productionCost to contracts.
-- Safe to run on existing data: defaults existing rows to 0.
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "productionCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
