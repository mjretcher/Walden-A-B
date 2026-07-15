import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { Q3CabinImportClient } from "./client";

export default async function Q3CabinImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Q3 Camper Import"
        eyebrow="One-time bulk update"
        description="Generate a preview of camper/cabin/session-designation changes from the latest Q3 (Second Session) camper list, then apply them in a single transaction."
      />
      <Q3CabinImportClient />
    </AppShell>
  );
}
