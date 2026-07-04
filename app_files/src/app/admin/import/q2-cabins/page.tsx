import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { Q2CabinImportClient } from "./client";

export default async function Q2CabinImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Q2 Cabin Sync"
        eyebrow="One-time bulk update"
        description="Generate a preview of cabin assignment changes from the latest Q2 cabin sheets, then apply them in a single transaction."
      />
      <Q2CabinImportClient />
    </AppShell>
  );
}
