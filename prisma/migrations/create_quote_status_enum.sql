-- Migration: Create native PostgreSQL enum for QuoteStatus
-- Prisma expects native enum types, but previous migration used TEXT + CHECK constraint.
-- This migration converts the column to use the native enum.

-- Create the enum type
DO $$ BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drop the CHECK constraint if it exists
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_quoteStatus_check";

-- Alter the column to use the native enum type
ALTER TABLE "invoices"
  ALTER COLUMN "quoteStatus" TYPE "QuoteStatus"
  USING ("quoteStatus"::text)::"QuoteStatus";

-- Reset the default
ALTER TABLE "invoices"
  ALTER COLUMN "quoteStatus" SET DEFAULT 'Draft';
