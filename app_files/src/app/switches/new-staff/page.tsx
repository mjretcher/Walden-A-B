import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { StaffSearch, type StaffAssignmentRow } from "@/components/switches/staff-search";

function leaveNote(employmentEnd: Date | null): string | null {
  if (!employmentEnd) return null;
  return `Leaves ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(employmentEnd)}`;
}

export default async function NewStaffSwitchPage({
  searchParams
}: {
  searchParams?: Promise<{ assignmentId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });

  const assignments = session
    ? await prisma.staffAssignment.findMany({
        where: { sessionId: session.id },
        include: {
          staff: { include: { primaryArea: { select: { name: true } } } },
          offering: { include: { activity: true, area: true } }
        },
        orderBy: [{ staff: { lastName: "asc" } }, { staff: { firstName: "asc" } }, { period: "asc" }]
      })
    : [];

  const rows: StaffAssignmentRow[] = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    staffId: assignment.staffId,
    staffName: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
    primaryAreaName: assignment.staff.primaryArea?.name ?? null,
    leaveNote: leaveNote(assignment.staff.employmentEnd),
    period: assignment.period,
    periodLabel: PERIOD_LABEL[assignment.period],
    areaName: assignment.offering.area.name,
    activityName: assignment.offering.activity.name
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="New staff switch"
        eyebrow="Step 1 of 3 · Find the staff member"
        description="Search by staff name, area, or current activity. Select an assignment to review the staff member's schedule before continuing."
      />

      {!session ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          No active session is selected, so staff switches are not available yet.
        </div>
      ) : (
        <StaffSearch assignments={rows} initialAssignmentId={params.assignmentId ?? null} />
      )}
    </AppShell>
  );
}
