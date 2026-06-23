-- Reorder Period enum so A-day periods sort before B-day periods in all queries.
-- PostgreSQL cannot reorder enum values in-place, so we rename/swap types.

-- Step 1: Create replacement enum with correct A-first order
CREATE TYPE "Period_new" AS ENUM (
  'P1A', 'P2A', 'P3A', 'P4A', 'P5A',
  'P1B', 'P2B', 'P3B', 'P4B', 'P5B'
);

-- Step 2: Migrate every column that uses Period
ALTER TABLE "ActivityOffering"
  ALTER COLUMN "period" TYPE "Period_new"
  USING "period"::text::"Period_new";

ALTER TABLE "Registration"
  ALTER COLUMN "period" TYPE "Period_new"
  USING "period"::text::"Period_new";

ALTER TABLE "StaffAssignment"
  ALTER COLUMN "period" TYPE "Period_new"
  USING "period"::text::"Period_new";

ALTER TABLE "StaffOffPeriod"
  ALTER COLUMN "period" TYPE "Period_new"
  USING "period"::text::"Period_new";

ALTER TABLE "SwitchRequest"
  ALTER COLUMN "period" TYPE "Period_new"
  USING "period"::text::"Period_new";

-- Step 3: Swap the types
DROP TYPE "Period";
ALTER TYPE "Period_new" RENAME TO "Period";
