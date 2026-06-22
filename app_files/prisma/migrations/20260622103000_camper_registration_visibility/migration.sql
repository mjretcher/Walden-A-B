ALTER TABLE "ActivityOffering"
ADD COLUMN "visibleForCamperRegistration" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ActivityOffering"
SET "visibleForCamperRegistration" = false
WHERE "period" IN ('P5A', 'P5B');

UPDATE "ActivityOffering" AS offering
SET "visibleForCamperRegistration" = false
FROM "Activity" AS activity
WHERE offering."activityId" = activity."id"
  AND lower(activity."name") IN (
    'rest',
    'lg rest coverage',
    'boys rounds',
    '5th period staff assignment',
    'fifth period staff assignment'
  );

ALTER TABLE "RegistrationAssignmentRow"
ADD COLUMN "customStaffName" TEXT;
