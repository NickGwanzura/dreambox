-- Migration: Add quotation-specific fields to invoices table
-- Date: 2026-06-10

-- Add new columns to invoices table
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "quoteNumber" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "expiryDate" TEXT,
  ADD COLUMN IF NOT EXISTS "terms" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentTo" TEXT,
  ADD COLUMN IF NOT EXISTS "quoteStatus" TEXT DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS "convertedToInvoiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "convertedToContractId" TEXT,
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS "invoices_quoteStatus_idx" ON "invoices"("quoteStatus");
CREATE INDEX IF NOT EXISTS "invoices_createdBy_idx" ON "invoices"("createdBy");

-- Create QuoteStatus enum (Postgres-style check constraint)
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quoteStatus_check" 
  CHECK ("quoteStatus" IS NULL OR "quoteStatus" IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'));

-- Create product_services table
CREATE TABLE IF NOT EXISTS "product_services" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_services_pkey" PRIMARY KEY ("id")
);

-- Create quotation_events table
CREATE TABLE IF NOT EXISTS "quotation_events" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "quotation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "quotation_events_invoiceId_idx" ON "quotation_events"("invoiceId");
CREATE INDEX IF NOT EXISTS "quotation_events_createdAt_idx" ON "quotation_events"("createdAt");
