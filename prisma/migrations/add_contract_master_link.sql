ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "masterContractId" TEXT;
CREATE INDEX IF NOT EXISTS "contracts_masterContractId_idx" ON "contracts"("masterContractId");
