-- CreateEnum
CREATE TYPE "RegistrationRole" AS ENUM ('CAMPER', 'TEACHING_ASSISTANT');

-- AlterTable
ALTER TABLE "Camper" ADD COLUMN "counselorAssistant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "registrationRole" "RegistrationRole" NOT NULL DEFAULT 'CAMPER';

-- CreateIndex
CREATE INDEX "Camper_counselorAssistant_idx" ON "Camper"("counselorAssistant");

-- CreateIndex
CREATE INDEX "Registration_offeringId_registrationWindow_registrationRole_status_idx" ON "Registration"("offeringId", "registrationWindow", "registrationRole", "status");

