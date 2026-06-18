-- Add menu display controls for standard/master A/B menus.
ALTER TABLE "ActivityOffering" ALTER COLUMN "staffTarget" SET DEFAULT 2;
ALTER TABLE "ActivityOffering" ADD COLUMN "visibleOnMasterMenu" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ActivityOffering" ADD COLUMN "includeInPrint" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "MenuDisplayRow" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "includeInPrint" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuDisplayRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MenuDisplayRow_offeringId_idx" ON "MenuDisplayRow"("offeringId");

ALTER TABLE "MenuDisplayRow" ADD CONSTRAINT "MenuDisplayRow_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ActivityOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MenuDisplayRow" ("id", "offeringId", "label", "visible", "includeInPrint", "sortOrder", "updatedAt")
SELECT
  concat('mrow_', md5(concat(offering."id", ':', unit.value, ':', unit.ordinality))),
  offering."id",
  CASE unit.value
    WHEN 'UNIT1' THEN 'Unit 1'
    WHEN 'UNIT2' THEN 'Unit 2'
    WHEN 'UNIT3' THEN 'Unit 3'
    WHEN 'UNIT4' THEN 'Unit 4'
    ELSE unit.value
  END,
  true,
  true,
  unit.ordinality::integer - 1,
  CURRENT_TIMESTAMP
FROM "ActivityOffering" offering
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN offering."eligibleUnits" ~ '^\s*\[' THEN offering."eligibleUnits"::jsonb
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS unit(value, ordinality);
