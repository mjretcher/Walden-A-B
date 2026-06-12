import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CsvImporter } from "@/components/csv-importer";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const sample = `"First Name","Last Name","Gender","Gender Identity","Person Age Today","Camp Grade","Wk1-2B Bunk","Wk1-2G Bunk","Wk3-4B Bunk","Wk3-4G Bunk","Wk5-6B Bunk","Wk5-6G Bunk","Wk7B Bunk","Wk7G Bunk"
"Aaron","Rosen","Male","","11.10","7th","B9","","B9","","B12","","",""`;

export default async function CamperImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader title="Camper Import" eyebrow="2026 CSV preview and update" description="Supports age, camp grade, gender identity, and bunk/week block columns. Use the CLI import for guarded sample replacement." />
      <CsvImporter endpoint="/api/import/campers" sample={sample} title="Paste camper CSV" />
    </AppShell>
  );
}
