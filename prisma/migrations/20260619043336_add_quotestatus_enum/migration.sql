-- Prisma generated migration: add QuoteStatus enum
-- This file is tracked by Prisma Migrate so `prisma migrate deploy` applies it.
-- The bootstrap in server.ts is kept as a fallback for existing deployments.

-- Create the QuoteStatus enum type
DO $$ BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drop the old check constraint if it exists
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_quoteStatus_check";

-- Drop old default before converting column type
ALTER TABLE "invoices" ALTER COLUMN "quoteStatus" DROP DEFAULT;

-- Convert the column from TEXT to the native enum
ALTER TABLE "invoices"
  ALTER COLUMN "quoteStatus" TYPE "QuoteStatus"
  USING ("quoteStatus"::text)::"QuoteStatus";

-- Set the default back with proper cast
ALTER TABLE "invoices" ALTER COLUMN "quoteStatus" SET DEFAULT 'Draft'::"QuoteStatus";

-- Ensure Proforma is in the InvoiceType enum
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'Proforma';
