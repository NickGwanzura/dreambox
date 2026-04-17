-- ============================================================
-- Company Profile: add banking + email-sender fields
-- Safe to run multiple times (idempotent).
-- ============================================================

ALTER TABLE "company_profile"
  ADD COLUMN IF NOT EXISTS "bankName"          TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountName"   TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranch"        TEXT,
  ADD COLUMN IF NOT EXISTS "bankSwift"         TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTerms"      TEXT,
  ADD COLUMN IF NOT EXISTS "senderEmail"       TEXT,
  ADD COLUMN IF NOT EXISTS "senderName"        TEXT,
  ADD COLUMN IF NOT EXISTS "emailSignature"    TEXT;
