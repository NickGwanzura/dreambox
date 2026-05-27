-- Migration: add_audit_logs
-- Creates a server-side audit log table for tracking permanent deletions and other actions.

DROP TABLE IF EXISTS audit_logs CASCADE;

CREATE TABLE audit_logs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    action      TEXT NOT NULL,
    details     TEXT NOT NULL,
    "userId"    TEXT,
    "userEmail" TEXT,
    "tableName" TEXT,
    "recordId"  TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs ("tableName");
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs ("recordId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs ("createdAt");
