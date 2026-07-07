import { Gender, Unit } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BunkCabinsClient } from "./client";

export default async function BunkManagementCabinsPage() {
  const user = await requireBunkManagementAccess("write");

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });

  const cabins = await prisma.cabin.findMany({
    orderBy: [{ unit: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          campers: { where: { active: true, ...(session ? { sessionId: session.id } : {}) } },
          cabinStaffAssignments: { where: session ? { sessionId: session.id } : undefined }
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
        title="Cabins, Units & Beds"
        eyebrow="Bunk Management"
        description="Real-time editing, grouped by unit. Bed count and unit changes save as soon as you make them — no separate confirm step. Over-capacity is a significant warning, never a block."
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
      />
      <BunkCabinsClient
        cabins={rows}
        units={Object.values(Unit)}
        genders={[Gender.MALE, Gender.FEMALE]}
      />
    </AppShell>
  );
}
