import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CsvImporter } from "@/components/csv-importer";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const sample = `firstName,lastName,gender,cabin,unit,swimLevel,medicalFlags,session
Maya,Gold,Female,G-4,1,Bluegill,,2025 Session 2
Leo,Stone,Male,B-10,3,Muskie,Peanut allergy,2025 Session 2`;

export default async function CamperImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader title="Camper Import" eyebrow="CSV preview and update" />
      <CsvImporter endpoint="/api/import/campers" sample={sample} title="Paste camper CSV" />
    </AppShell>
  );
}
