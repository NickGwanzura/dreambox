# ERP Hardening Report — Phase 1

Date: 2026-08-12

## Scope

Phase 1 covers shared configuration, data safety, and scale foundations.

## Completed

- Location towns moved from browser `localStorage` to the shared PostgreSQL `company_profile.locationTowns` field.
- Added a real Prisma migration at `prisma/migrations/20260812000000_add_location_towns/migration.sql`.
- Kept an idempotent startup schema guard for older production databases with incomplete migration history.
- Location Settings loads shared towns and falls back to the built-in Zimbabwe list if the database is unavailable.
- Town writes are authenticated and use the existing manager/admin-protected company-profile endpoint.
- Backend pagination is already present for users, clients, contracts, expenses, tasks, printing jobs, and CRM resources through `parsePagination`.
- Monthly filtering is available for expenses, invoices, receipts, quotations, and proformas.

## Verification

- Prisma client generation: passed
- TypeScript: passed
- Test suite: 443 tests passed
- Production build: passed

## Production actions

- Run the migration during the next Dokploy deployment.
- Confirm `/health` reports migrations and schema ready.
- Verify one town added by an admin is visible from a second user account.
- Configure scheduled PostgreSQL dumps to R2 with encryption and retention.

## Residual risk

The application has backup APIs and R2 storage support, but the recurring PostgreSQL dump schedule and restore drill still require Dokploy/R2 operational configuration.
