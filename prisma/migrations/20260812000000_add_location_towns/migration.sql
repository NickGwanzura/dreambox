-- Shared location configuration for all ERP users.
ALTER TABLE "company_profile"
  ADD COLUMN IF NOT EXISTS "locationTowns" TEXT;
