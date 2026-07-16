# Robo Silicon Operations Reporting

Automates the GIR plant reporting flow with daily data capture as the source of truth:

1. Capture daily plant reality in a structured form.
2. Save draft records while work is incomplete.
3. Validate mandatory fields, calculations, exceptions and evidence.
4. Submit final records with audit trail.
5. Build a locked weekly/monthly dashboard snapshot.
6. Generate PowerPoint from the locked snapshot.

Excel is now a temporary reconciliation utility only. The operating workflow is daily form -> validation engine -> database -> dashboard snapshot -> PowerPoint/PDF/WhatsApp summary.

## Tech Stack

- Next.js with TypeScript on vinext
- PostgreSQL with Prisma
- `read-excel-file` for temporary workbook reconciliation
- Chart.js for dashboard charts
- PptxGenJS for report generation
- Server-side AI commentary only; numerical metrics are deterministic

## Reference Files Used

- `Gir plant May daily reports 2026.xlsx`
- `GIR_Plant_May2026_Dashboard.html`
- `WRM PRESENTATION APR-26  4th week (2).pptx`

Implementation notes are in `docs/reference-analysis.md`.

## Quick Start

```bash
npm install
npm run db:generate
npm run dev
```

Open `http://localhost:3000/`.

Use the Capture tab for daily entry. Drafts can be saved with incomplete data. Final submission is blocked until validation passes. Use the Reports tab to build a locked snapshot from final records and generate PPT.

When `DATABASE_URL` is not configured, the local dev server keeps records and snapshots in memory for pilot testing. With PostgreSQL configured, records, audit logs and snapshots are stored through Prisma.

The supplied May 2026 workbook currently imports with seven blocking validation errors on `2026-05-31` because machine, electrical, and loader readings are negative in that source row. The dashboard displays those issues and disables PPT generation until the source data is corrected or the row is intentionally excluded in a validated import.

## Database

Set `.env` from `.env.example`, then run:

```bash
npm run db:migrate
```

Core tables:

- `Plant`
- `DailyPlantRecord`
- `AuditLog`
- `ReportSnapshot`
- `ValidationIssue`
- `GeneratedReport`

`DailyPlantRecord.payload` stores the submitted daily form. `AuditLog` stores draft/final/edit actions. `ReportSnapshot.payload` stores the locked JSON snapshot used by both dashboard and PPT generation, keeping historical report versions reproducible.

## Commands

- `npm run dev`: start local app
- `npm run build`: production build
- `npm run lint`: lint TypeScript/React code
- `npm run db:generate`: generate Prisma client
- `npm run db:migrate`: apply PostgreSQL migrations locally
- `npm run sample:extract`: regenerate the preview snapshot from the GIR workbook

## Deployment Notes

Railway runs this app with `railway.json`:

- Build command: `npm run railway:build`
- Start command: `npm run railway:start`
- Database: Railway PostgreSQL service referenced as `DATABASE_URL=${{Postgres.DATABASE_URL}}`

`railway:build` runs `prisma generate` and the vinext production build. `railway:start` runs `prisma migrate deploy` before starting the app so the production database is migrated from the committed `prisma/migrations` files.

For Azure-compatible storage, generated report binaries should use `AZURE_STORAGE_CONNECTION_STRING` and `REPORT_STORAGE_CONTAINER`; the schema already stores immutable `storageKey` and checksum fields for locked report artifacts.
