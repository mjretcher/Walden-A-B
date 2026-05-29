import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CsvImporter } from "@/components/csv-importer";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const sample = `firstName,lastName,primaryArea,secondaryAreas,skills,certifications,cabinAssignment,availabilityNotes,sessionAvailability
Nora,Lake,Waterfront,Athletics,"Ski; Tube","LG; WSI",B-10,Prioritize waterfront,S2
Ben,Cedar,Arts & Crafts,Media & Tech,"Clay; Video",M,,Available all cycle,S2`;

export default async function StaffImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Import" eyebrow="CSV preview and update" />
      <CsvImporter endpoint="/api/import/staff" sample={sample} title="Paste staff CSV" />
    </AppShell>
  );
}
