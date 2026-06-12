# 2026 Data Import Runbook

This app stays on PostgreSQL/Neon and Vercel. The import scripts are explicit on purpose: production data should never be replaced during `npm run build`.

## 1. Deploy Schema First

Apply the Prisma migration before importing the 2026 files:

```bash
npx prisma migrate deploy
```

If the Vercel project build command is configured as `prisma generate && prisma db push && next build`, the additive schema changes will be pushed during deploy. Prefer `prisma migrate deploy` for a controlled production database update.

## 2. Preview Real Staff And Camper Files

Preview does not write records:

```bash
npm run import:2026 -- \
  --staff "/Users/mike/Downloads/6_11_2026_13_58_37.csv" \
  --campers "/Users/mike/Downloads/6_11_2026_14_57_43.csv"
```

Review the row counts, skipped rows, scream-session eligibility counts, and sample replacement candidates before committing.

## 3. Commit The Import

This replaces only known sample camper/staff names. It does not delete users or admin login records.

```bash
npm run import:2026 -- \
  --staff "/Users/mike/Downloads/6_11_2026_13_58_37.csv" \
  --campers "/Users/mike/Downloads/6_11_2026_14_57_43.csv" \
  --commit \
  --replace-samples
```

Staff are matched by first and last name because the current schema stores staff globally. Campers are matched by first name, last name, and active session.

## 4. Seed The First-Session Calendar

This seeds the A/B/S/arrival/registration/departure pattern from the provided 2026 block PDF into the active session.

```bash
npm run calendar:2026
```

## 5. What The Import Adds

- Staff: age, position, position 2, employment start/end, and `screamEligible`.
- Area Assistants default to visible in Scream Session.
- Directors, admins, nurse/CHO, social worker, maintenance, kitchen, office, and support-only roles default to hidden from Scream Session.
- Campers: gender identity, age, camp grade, and week/bunk enrollments.
- New Outages page tracks camper, staff, cabin, and manual-trip outages without deleting registrations or staff assignments.
