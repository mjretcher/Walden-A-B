CREATE TABLE "RegistrationAssignmentReport" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "registrationLabel" TEXT NOT NULL,
    "registrationDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationAssignmentReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationAssignmentRow" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "staffId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationAssignmentRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationAssignmentReport_sessionId_updatedAt_idx" ON "RegistrationAssignmentReport"("sessionId", "updatedAt");
CREATE INDEX "RegistrationAssignmentRow_reportId_section_sortOrder_idx" ON "RegistrationAssignmentRow"("reportId", "section", "sortOrder");
CREATE INDEX "RegistrationAssignmentRow_staffId_idx" ON "RegistrationAssignmentRow"("staffId");

ALTER TABLE "RegistrationAssignmentReport"
ADD CONSTRAINT "RegistrationAssignmentReport_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegistrationAssignmentRow"
ADD CONSTRAINT "RegistrationAssignmentRow_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "RegistrationAssignmentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationAssignmentRow"
ADD CONSTRAINT "RegistrationAssignmentRow_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
