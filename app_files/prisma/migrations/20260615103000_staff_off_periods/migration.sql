-- Persist explicit A/B off periods for Scream Session staff scheduling.

CREATE TABLE "StaffOffPeriod" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "period" "Period" NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffOffPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffOffPeriod_staffId_sessionId_period_key" ON "StaffOffPeriod"("staffId", "sessionId", "period");
CREATE INDEX "StaffOffPeriod_sessionId_period_idx" ON "StaffOffPeriod"("sessionId", "period");

ALTER TABLE "StaffOffPeriod" ADD CONSTRAINT "StaffOffPeriod_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffOffPeriod" ADD CONSTRAINT "StaffOffPeriod_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
