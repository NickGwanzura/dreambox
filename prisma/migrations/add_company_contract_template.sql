-- Adds contractTemplate to company_profile.
-- Nullable; the app falls back to the hard-coded default template when unset.
ALTER TABLE "company_profile"
  ADD COLUMN IF NOT EXISTS "contractTemplate" TEXT;
