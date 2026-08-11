CREATE TABLE IF NOT EXISTS "cron_job_runs" (
  "id" TEXT NOT NULL,
  "jobKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cron_job_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cron_job_runs_jobKey_key" ON "cron_job_runs" ("jobKey");
CREATE INDEX IF NOT EXISTS "cron_job_runs_status_startedAt_idx" ON "cron_job_runs" ("status", "startedAt");
