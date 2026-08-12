# Dreambox production runbook

## Before a deployment

1. Confirm the Dokploy deployment has `DATABASE_URL`, JWT secrets, `CRON_SECRET`, `APP_URL`, and the R2 credentials configured. Keep `JSON_BODY_LIMIT` explicit (the default is `50mb`).
2. Set `TRUST_PROXY=true` only when the service is exclusively behind the configured Cloudflare proxy.
3. Run `npm test`, `npx tsc --noEmit`, `npm run lint:safety`, and `npm run build`.
4. Run `npx prisma migrate deploy` as the Dokploy release step (or one dedicated migration job), then set `MIGRATIONS_ON_BOOT=false` on every web replica. Verify `/health` reports `status: ok`, `db: connected`, `migrations: ready`, and `schema: ready`.

## Rollback

- Keep the previous Dokploy image/build available until the new deployment passes health checks.
- If the new build fails readiness, roll back the application image first; do not manually delete migration records.
- If a migration is destructive, restore the database snapshot to a separate database and validate it before changing production.

## Backup and restore drill

- Run the authenticated `POST /api/cron/backup` endpoint and confirm the object appears in R2.
- Cron jobs use the `cron_job_runs` table for a lease/idempotency record. If a scheduler is interrupted, wait for the 30-minute lease to expire before retrying the same job key.
- Download one application backup and verify its manifest/record count.
- New application backups include a SHA-256 checksum; restore rejects a changed or truncated R2 object before writing data.
- At least monthly, restore into a disposable Postgres database, run the application health/readiness checks, and record the result.
- Treat a backup as failed if any table export is incomplete or the restore cannot reach schema readiness.

## Incident response

- **Database degraded:** check `/health`, Dokploy logs, Postgres connection limits, and the latest migration status.
- **Payment discrepancy:** stop manual edits, review the payment controls queue and audit log, then reconcile before reopening the period.
- **Compromised account:** disable the user, rotate JWT secrets if tokens may be exposed, and review audit logs by user/IP.
- **Failed email/cron:** inspect the endpoint response and retry only after confirming idempotency and the accounting period state.

## Cloudflare/Dokploy checklist

- HTTPS-only origin and redirect enabled.
- Health check points to `/health` on port 3000.
- Cron requests include `x-cron-secret` and are restricted to the scheduler where possible.
- When running more than one app replica, set `CRON_SCHEDULER_ENABLED=true` on exactly one replica and `false` on the others, or use one external scheduler.
- R2 bucket is private; application URLs are signed or proxied through the access-controlled API.
- Payment proofs are stored as private `payment-proofs/...` keys; do not put public URLs into invoice records.
- Alerts are configured for failed health checks, backup failures, and sustained 5xx responses.
