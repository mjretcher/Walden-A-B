import { Gender, Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CabinsAdminClient } from "./client";

export default async function CabinsAdminPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });

  const cabins = await prisma.cabin.findMany({
    orderBy: [{ unit: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          campers: { where: { active: true, ...(session ? { sessionId: session.id } : {}) } },
          staff: { where: { active: true } }
        }
      }
    }
  });

  const rows = cabins.map((cabin) => ({
    id: cabin.id,
    name: cabin.name,
    unit: cabin.unit,
    gender: cabin.gender,
    camperCount: cabin._count.campers,
    staffCount: cabin._count.staff
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Cabin Admin"
        eyebrow="Manage cabin metadata"
        description="Rename cabins, change which unit they're in, or flip their gender for this session. Unit changes auto-cascade to every camper currently in the cabin."
      />
      <CabinsAdminClient
        cabins={rows}
        units={Object.values(Unit)}
        genders={Object.values(Gender)}
      />
    </AppShell>
  );
}
