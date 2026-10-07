# Dreambox

Business management system for Dreambox Advertising, an out-of-home (billboard) company in Zimbabwe. It covers site inventory, quotations, contracts, invoicing, a CRM, field operations and a public marketing website, in one app.

## Features

- **Inventory:** static billboards (Side A / Side B priced independently) and LED boards (rented by slot), with map coordinates, traffic estimates and maintenance history.
- **Sales:** quotations, contracts, contract amendments, invoices and receipts, with PDF generation and email delivery.
- **CRM:** companies, contacts, opportunity pipeline, lead scoring, call logs, email threads, tasks, CSV import and automation rules.
- **Finance:** expenses, payment links, payment proof upload and review, accounting periods, finance reconciliation, profit analytics and a director finance report.
- **Operations:** today view, tasks, maintenance, printing jobs and field reports with an offline queue.
- **Public site:** live availability and pricing, lead and waitlist forms, and a client portal.
- **Platform:** JWT auth with 2FA, role permissions, audit logs, backup and restore to Cloudflare R2, and scheduled cron jobs (contract expiry, quotation expiry, expense report, health check, backups).
- **AI:** assistant features through a server-side Groq proxy (`api/ai.ts`). The API key never reaches the browser.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite 6, Tailwind CSS 4, Recharts, Leaflet, Lucide, Geist font |
| Backend | Express 5, TypeScript (run with `tsx`), Zod, Helmet |
| Database | PostgreSQL with Prisma 7 |
| Storage | Cloudflare R2 (S3-compatible) |
| Email | Resend |
| AI | Groq |
| PDF | jsPDF, PDFKit |
| Tests | Vitest |
| Deploy | Dokploy / Docker (see `Dockerfile`, `Procfile`, `nixpacks.toml`) |

## Project layout

```
App.tsx, index.tsx   App shell and routing
components/          UI by module (crm/, quotations/, settings/, ui/)
api/                 Route handlers (auth, invoices, contracts, crm, cron, ...)
lib/                 Server helpers (auth, prisma, backup, cron jobs, rate limiter)
services/            Client services (API client, PDFs, sync, analytics)
prisma/              schema.prisma and migrations
server.ts            Express entry point
scripts/             One-off maintenance and admin scripts
tests/               Vitest suites
docs/                Operations runbook
```

## Run locally

**Prerequisites:** Node.js 20+ and a PostgreSQL database.

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env` file from the example and fill in the values:
   ```
   cp .env.example .env
   ```
3. Apply database migrations:
   ```
   npx prisma migrate deploy
   ```
4. Optionally create the first admin user:
   ```
   npx tsx scripts/seed-admin.ts
   ```
5. Start the app. In one terminal run the API server, in another the Vite dev server:
   ```
   npm start
   npm run dev
   ```

## Environment variables

See [.env.example](.env.example) for the full list. The main ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets (64+ random chars) |
| `APP_URL` | Public base URL, used in emails and links |
| `RESEND_API_KEY` | Transactional email |
| `GROQ_API_KEY` | AI features |
| `R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage |
| `CRON_SECRET`, `CRON_SCHEDULER_ENABLED` | Protect and control `/api/cron/*` |
| `MIGRATIONS_ON_BOOT` | Set `false` in production and run `prisma migrate deploy` as a release step |
| `TRUST_PROXY` | Set `true` only behind a trusted proxy such as Cloudflare |

Supabase is no longer used at runtime. The `SUPABASE_*` variables are only needed for `scripts/migrate-from-supabase.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm start` | Run the Express server (`tsx server.ts`) |
| `npm run build` | `prisma generate` and production build |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint:safety` | Check for unsafe optional-chain patterns |
| `npm run finance:reconcile` | Run the finance reconciliation script |

## Deployment

Before deploying, run `npm test`, `npx tsc --noEmit`, `npm run lint:safety` and `npm run build`. Then run `npx prisma migrate deploy` as the release step and confirm `/health` reports `status: ok`.

Rollback, backup and restore drills, and incident response are in [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md).
