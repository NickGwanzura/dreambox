-- Migration: Add linkedInvoiceId to invoices — durable receipt→invoice link
-- (replaces parsing "Invoice #<id>" out of the line-item description)
-- Date: 2026-07-06
--
-- Apply this BEFORE deploying code that adds linkedInvoiceId to
-- prisma/schema.prisma, e.g.:
--   npx prisma db execute --file prisma/migrations/add_linked_invoice_id.sql --schema prisma/schema.prisma
-- or run the ALTER below directly in the active PostgreSQL console.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "linkedInvoiceId" TEXT;

CREATE INDEX IF NOT EXISTS "invoices_linkedInvoiceId_idx" ON "invoices"("linkedInvoiceId");
