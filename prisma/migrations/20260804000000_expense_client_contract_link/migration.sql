-- Expenses can now be tied to a client and/or contract for attribution.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "contractId" TEXT;

CREATE INDEX IF NOT EXISTS "expenses_clientId_idx" ON "expenses"("clientId");
CREATE INDEX IF NOT EXISTS "expenses_contractId_idx" ON "expenses"("contractId");
