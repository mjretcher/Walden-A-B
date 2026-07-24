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
          // Real cabin/bunk staff assignment lives entirely in
          // CabinStaffAssignment now (see /bunk-management/board) --
          // Staff.cabinId is legacy and no longer written to for this
          // purpose, so counting the old `staff` relation here would
          // show stale numbers the moment the board is used at all.
          cabinStaffAssignments: { where: session ? { sessionId: session.id, staff: { active: true } } : { staff: { active: true } } }
        }
      }
    }
  });

  const rows = cabins.map((cabin) => ({
    id: cabin.id,
    name: cabin.name,
    unit: cabin.unit,
    gender: cabin.gender,
    beds: cabin.beds,
    camperCount: cabin._count.campers,
    staffCount: cabin._count.cabinStaffAssignments
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Cabin Admin"
        eyebrow="Manage cabin metadata"
        description="Rename cabins, change which unit they're in, flip their gender for this session, or set the bed count. Unit changes auto-cascade to every camper currently in the cabin."
      />
      <CabinsAdminClient
        cabins={rows}
        units={Object.values(Unit)}
        genders={Object.values(Gender)}
      />
    </AppShell>
  );
}
