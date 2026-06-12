CREATE TABLE IF NOT EXISTS "CamperSessionDesignation" (
  "id" TEXT NOT NULL,
  "camperId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CamperSessionDesignation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CamperFilterGroup" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "weekBlocks" TEXT,
  "sessionDesignations" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CamperFilterGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CamperSessionDesignation_camperId_label_key" ON "CamperSessionDesignation"("camperId", "label");
CREATE INDEX IF NOT EXISTS "CamperSessionDesignation_label_idx" ON "CamperSessionDesignation"("label");

CREATE UNIQUE INDEX IF NOT EXISTS "CamperFilterGroup_sessionId_name_key" ON "CamperFilterGroup"("sessionId", "name");
CREATE INDEX IF NOT EXISTS "CamperFilterGroup_sessionId_active_idx" ON "CamperFilterGroup"("sessionId", "active");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CamperSessionDesignation_camperId_fkey'
  ) THEN
    ALTER TABLE "CamperSessionDesignation"
      ADD CONSTRAINT "CamperSessionDesignation_camperId_fkey"
      FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CamperFilterGroup_sessionId_fkey'
  ) THEN
    ALTER TABLE "CamperFilterGroup"
      ADD CONSTRAINT "CamperFilterGroup_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
