import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ImportClient } from "./client";

export default async function BunkManagementImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Import from CampMinder"
        eyebrow="Bunk Management"
        description="Upload the hand-typed cabin sheet (the same format as Q1_Boys_Cabins) for the active session. Campers only — staff and CA names in the file are detected and skipped, since real staff assignment happens on the Assignment Board and CAs already come from the camper profile import."
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
      />
      <ImportClient />
    </AppShell>
  );
}
