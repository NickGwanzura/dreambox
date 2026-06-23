-- Adds address fields to clients table.
-- Safe to run on existing data: new columns default to NULL.
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "streetAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "city"          TEXT,
  ADD COLUMN IF NOT EXISTS "country"       TEXT;
