-- ============================================================
-- Company Profile: add configurable VAT rate
-- Safe to run multiple times (idempotent).
-- ============================================================

ALTER TABLE "company_profile"
  ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION;
