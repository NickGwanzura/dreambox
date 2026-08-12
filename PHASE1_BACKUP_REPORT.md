# Backup Priority Report

## Implemented

- Application data backups are exported to R2 through the protected `/api/cron/backup` endpoint.
- Backup manifests track creation time, creator, record count, tables, size, and now a SHA-256 checksum.
- Restore verifies the checksum before parsing or writing any records.
- R2 keys are constrained to the configured backup prefix for database snapshot downloads.
- Backup mutations use a PostgreSQL advisory lock to serialize manifest updates across replicas.

## Required Dokploy/R2 configuration

- Configure `CRON_SECRET`.
- Configure the external scheduler to call `POST /api/cron/backup` with `x-cron-secret`.
- Keep the R2 bucket private and enable retention/versioning according to the chosen policy.
- Confirm the existing Dokploy PostgreSQL snapshot job writes to the configured `DATABASE_BACKUP_PREFIX`.

## Restore drill

1. Create one application backup through the cron endpoint.
2. Confirm the object and checksum-backed manifest entry exist in R2.
3. Download the backup and validate the JSON manifest.
4. Restore into a disposable PostgreSQL database, never directly into production.
5. Run migrations and `/health`; record the restore timestamp, checksum, row counts, and result.

## Status

Code-level backup integrity: complete.
Production scheduler and recurring PostgreSQL dump verification: requires Dokploy/R2 operational confirmation.
