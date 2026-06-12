-- CreateTable
CREATE TABLE "AllergyLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllergyLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamperAllergy" (
    "id" TEXT NOT NULL,
    "camperId" TEXT NOT NULL,
    "allergyLabelId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamperAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllergyLabel_name_key" ON "AllergyLabel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CamperAllergy_camperId_allergyLabelId_key" ON "CamperAllergy"("camperId", "allergyLabelId");

-- CreateIndex
CREATE INDEX "CamperAllergy_allergyLabelId_idx" ON "CamperAllergy"("allergyLabelId");

-- AddForeignKey
ALTER TABLE "CamperAllergy" ADD CONSTRAINT "CamperAllergy_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamperAllergy" ADD CONSTRAINT "CamperAllergy_allergyLabelId_fkey" FOREIGN KEY ("allergyLabelId") REFERENCES "AllergyLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

