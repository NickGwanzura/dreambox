-- ============================================================
-- User Management Enhancement Migration
-- Run this against your Neon/PostgreSQL database
-- ============================================================

-- 1. Add Inactive to UserStatus enum
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'Inactive';

-- 2. Add new fields to users table
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginIp"         TEXT,
  ADD COLUMN IF NOT EXISTS "permissions"         JSONB;

-- 3. Create login_history table
CREATE TABLE IF NOT EXISTS "login_history" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT NOT NULL,
  "ip"        TEXT,
  "userAgent" TEXT,
  "success"   BOOLEAN NOT NULL,
  "reason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "login_history_userId_idx" ON "login_history"("userId");

ALTER TABLE "login_history"
  ADD CONSTRAINT "login_history_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create rate_limits table
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key"       TEXT NOT NULL,
  "attempts"  INTEGER NOT NULL DEFAULT 1,
  "resetAt"   TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_key_key" ON "rate_limits"("key");
