-- Additive operational metadata for 2026 real staff/camper imports, day calendar, and outages.

CREATE TYPE "WeekBlock" AS ENUM ('WK1_2', 'WK3_4', 'WK5_6', 'WK7');
CREATE TYPE "SessionDayType" AS ENUM ('A', 'B', 'S', 'ARRIVAL', 'REGISTRATION', 'DEPARTURE', 'SPECIAL', 'NO_CLASSES');
CREATE TYPE "OutageSubjectType" AS ENUM ('CAMPER', 'STAFF', 'CABIN', 'MANUAL_TRIP');
CREATE TYPE "OutageReason" AS ENUM ('TRIP', 'INFIRMARY', 'SICK', 'OFF_CAMP', 'VACATION_AWAY', 'CUSTOM');
CREATE TYPE "OutageStatus" AS ENUM ('ACTIVE', 'RESOLVED');

ALTER TABLE "Camper"
  ADD COLUMN IF NOT EXISTS "genderIdentity" TEXT,
  ADD COLUMN IF NOT EXISTS "age" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "campGrade" TEXT;

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "age" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "position" TEXT,
  ADD COLUMN IF NOT EXISTS "position2" TEXT,
  ADD COLUMN IF NOT EXISTS "employmentStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "employmentEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "screamEligible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "CamperWeekEnrollment" (
  "id" TEXT NOT NULL,
  "camperId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "weekBlock" "WeekBlock" NOT NULL,
  "cabinId" TEXT,
  "cabinName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CamperWeekEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionCalendarDay" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "dayType" "SessionDayType" NOT NULL,
  "notes" TEXT,
  "events" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SessionCalendarDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Outage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "subjectType" "OutageSubjectType" NOT NULL,
  "reason" "OutageReason" NOT NULL,
  "status" "OutageStatus" NOT NULL DEFAULT 'ACTIVE',
  "camperId" TEXT,
  "staffId" TEXT,
  "cabinId" TEXT,
  "manualTitle" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "fullDay" BOOLEAN NOT NULL DEFAULT true,
  "periods" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Outage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CamperWeekEnrollment_camperId_sessionId_weekBlock_key" ON "CamperWeekEnrollment"("camperId", "sessionId", "weekBlock");
CREATE INDEX "CamperWeekEnrollment_sessionId_weekBlock_cabinId_idx" ON "CamperWeekEnrollment"("sessionId", "weekBlock", "cabinId");

CREATE UNIQUE INDEX "SessionCalendarDay_sessionId_date_key" ON "SessionCalendarDay"("sessionId", "date");
CREATE INDEX "SessionCalendarDay_date_dayType_idx" ON "SessionCalendarDay"("date", "dayType");

CREATE INDEX "Outage_sessionId_status_startDate_endDate_idx" ON "Outage"("sessionId", "status", "startDate", "endDate");
CREATE INDEX "Outage_camperId_idx" ON "Outage"("camperId");
CREATE INDEX "Outage_staffId_idx" ON "Outage"("staffId");
CREATE INDEX "Outage_cabinId_idx" ON "Outage"("cabinId");

ALTER TABLE "CamperWeekEnrollment" ADD CONSTRAINT "CamperWeekEnrollment_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CamperWeekEnrollment" ADD CONSTRAINT "CamperWeekEnrollment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CamperWeekEnrollment" ADD CONSTRAINT "CamperWeekEnrollment_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionCalendarDay" ADD CONSTRAINT "SessionCalendarDay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Outage" ADD CONSTRAINT "Outage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
