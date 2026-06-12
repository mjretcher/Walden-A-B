import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CsvImporter } from "@/components/csv-importer";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const sample = `"First Name","Last Name","Employment Start","Employment End","Position","Gender","Age","Position 2"
"Abigail","Griffiths","6/12/2026","8/8/2026","Area Assistant","Female","29.00","Riding"
"Adam","Gross","6/10/2026","8/8/2026","Nurse/CHO","Male","30.10",""`;

export default async function StaffImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Import" eyebrow="2026 CSV preview and update" description="Supports age, position, employment dates, Position 2, and Scream Session eligibility defaults. Use the CLI import for guarded sample replacement." />
      <CsvImporter endpoint="/api/import/staff" sample={sample} title="Paste staff CSV" />
    </AppShell>
  );
}
