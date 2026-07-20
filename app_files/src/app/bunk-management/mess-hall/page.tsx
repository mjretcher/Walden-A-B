import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMessHallSeed } from "@/lib/cabin-roster-export";
import { MessHallBoard } from "./client";

export const dynamic = "force-dynamic";

export default async function MessHallPage() {
  // Editing tool -> Exec Admin only (side heads are read-only elsewhere).
  const user = await requireBunkManagementAccess("write");

  const session = await prisma.session.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader
          title="Mess Hall Seating"
          eyebrow="Bunk Management"
          backHref="/bunk-management"
          backLabel="Back to Bunk Management"
          description="No active session."
        />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          There&rsquo;s no active session right now.
        </p>
      </AppShell>
    );
  }

  const [seed, saved] = await Promise.all([
    buildMessHallSeed(session.id),
    prisma.messHallArrangement.findUnique({ where: { sessionId: session.id }, select: { data: true } })
  ]);

  let initial: { tables: { id: string; name: string; cap: number }[]; assign: Record<string, string>; defCap?: number } | null = null;
  if (saved?.data) {
    try {
      initial = JSON.parse(saved.data);
    } catch {
      initial = null;
    }
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Mess Hall Seating"
        eyebrow="Bunk Management"
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
        description="Drag cabins or individuals onto tables. Reads the live cabin roster; your layout saves for everyone with access."
      />
      <MessHallBoard
        sessionId={session.id}
        sessionLabel={seed.session?.name ?? ""}
        generatedAt={seed.generatedAt}
        people={seed.people}
        cabins={seed.cabins}
        initial={initial}
      />
    </AppShell>
  );
}
