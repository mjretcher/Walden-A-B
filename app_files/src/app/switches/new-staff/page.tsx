import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { StaffSearch, type StaffAssignmentRow } from "@/components/switches/staff-search";

const STAFF_PERIOD_ORDER = new Map(STAFF_PERIODS.map((period, index) => [period, index]));

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

  // Mike said he was checking the Scream Session board's staffing summary
  // before every staff switch just to see which offerings needed a body —
  // this pulls that same "understaffed" view directly into the switch flow
  // so there's no need to cross-reference a separate screen.
  const staffingOfferings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
        include: { area: true, activity: true, _count: { select: { staffAssignments: true } } },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];
  const understaffed = staffingOfferings
    .map((offering) => ({
      offeringId: offering.id,
      periodLabel: PERIOD_LABEL[offering.period],
      periodOrder: STAFF_PERIOD_ORDER.get(offering.period) ?? 0,
      areaName: offering.area.name,
      activityName: offering.activity.name,
      staffed: offering._count.staffAssignments,
      staffTarget: offering.staffTarget,
      gap: offering.staffTarget - offering._count.staffAssignments
    }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.periodOrder - b.periodOrder || a.areaName.localeCompare(b.areaName));

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

      {session ? (
        <details open className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-black text-amber-900 [&::-webkit-details-marker]:hidden">
            <span>⚠ Needs staff right now ({understaffed.length})</span>
            <span className="text-xs font-semibold text-amber-700">Tap to collapse</span>
          </summary>
          <div className="grid gap-1.5 border-t border-amber-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {understaffed.length ? (
              understaffed.map((row) => (
                <div key={row.offeringId} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                  <p className="font-bold text-forest-900">
                    {row.periodLabel} · {row.areaName}
                  </p>
                  <p className="text-slate-600">{row.activityName}</p>
                  <p className="mt-1 text-xs font-bold text-amber-700">
                    Staffed {row.staffed} of {row.staffTarget}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm font-medium text-amber-800 sm:col-span-2 lg:col-span-3">Nothing understaffed right now — nice.</p>
            )}
          </div>
        </details>
      ) : null}

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
