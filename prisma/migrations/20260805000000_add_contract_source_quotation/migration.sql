-- Link contracts to the quotation they were converted from (reverse link of
-- invoices.convertedToContractId). Idempotent so it is safe on partial histories.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "sourceQuotationId" TEXT;
CREATE INDEX IF NOT EXISTS "contracts_sourceQuotationId_idx" ON "contracts"("sourceQuotationId");
