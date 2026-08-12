# ERP Hardening Report — Phase 2

Date: 2026-08-12

## Scope

Phase 2 covers security, observability, workflow controls, and release discipline.

## Completed in codebase

- Server-backed authentication and session-version invalidation are active.
- Password resets are rate-limited, single-use, expiry-bound, and invalidate stale sessions.
- User-management mutations validate role, status, and permission payloads.
- User updates and deletes write audit records without storing password hashes or login IPs in snapshots.
- Client-side duplicate billing/maintenance/backup loops were removed; overdue reconciliation remains periodic.
- Blocking browser alerts were replaced with Toast feedback across Clients, Payments, Rentals, Quotations, Financials, Expenses, Maintenance, and Settings.
- Invoice and quotation workflows include month/status/search filtering and filtered totals.

## Recommended next controls

- Add Sentry or equivalent server/client error tracking with alert routing.
- Add a CI job for `tsc`, tests, build, dependency audit, and migration validation.
- Add end-to-end tests for 2FA, payment proof, quotation conversion, booking conflicts, user permissions, and backup restore.
- Add a Dokploy migration step before web rollout and health-gated rollback.
- Configure encrypted PostgreSQL dump uploads to R2 with daily/weekly retention and a scheduled restore verification.
- Finish migrating read-only permission checks from `authServiceSecure.ts` to the server-backed session adapter.

## Release gate

Do not mark the ERP production-ready until the backup restore drill, migration rollout, and end-to-end financial workflows have been executed against a production-like database.
