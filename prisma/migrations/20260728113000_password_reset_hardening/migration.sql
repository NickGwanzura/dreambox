-- Revoke all sessions issued before session-version checking was introduced.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Existing values are raw, database-readable reset secrets. They cannot be
-- converted safely to hashes, so invalidate them during this security rollout.
UPDATE "password_reset_tokens" SET "used" = true WHERE "used" = false;
