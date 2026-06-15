import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

export default async function StaffAssignmentsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const staff = await prisma.staff.findMany({
    where: { active: true },
    include: {
      cabin: true,
      primaryArea: true,
      secondaryAreas: true,
      assignments: {
        where: session ? { sessionId: session.id } : undefined,
        include: { offering: { include: { activity: true, area: true } } },
        orderBy: { period: "asc" }
      },
      offPeriods: { where: session ? { sessionId: session.id } : undefined }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Assignments" eyebrow={session?.name ?? "No active session"} />
      <div className="mb-6 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-800">
        Read-only view of where each active staff member is assigned by period.
      </div>
      {!session ? <EmptyState title="No active session" body="Activate a session before reviewing staff assignments." /> : null}
      {staff.length ? (
        <section className="grid gap-4">
          {staff.map((person) => {
            const assignmentRows = STAFF_PERIODS.map((period) => {
              const assignment = person.assignments.find((item) => item.period === period);
              const offPeriod = person.offPeriods.some((item) => item.period === period);
              return { period, assignment, offPeriod };
            });
            const openCount = assignmentRows.filter((row) => !row.assignment && !row.offPeriod).length;
            return (
              <article key={person.id} className="rounded-lg border border-white bg-white p-4 shadow-soft">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-forest-900">{person.firstName} {person.lastName}</h2>
                    <p className="mt-1 text-sm text-slate-600">Cabin {person.cabin?.name ?? "-"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {person.primaryArea ? <Badge tone="blue">Primary: {person.primaryArea.name}</Badge> : <Badge>No primary area</Badge>}
                      {person.secondaryAreas.map((area) => <Badge key={area.id}>Secondary: {area.name}</Badge>)}
                    </div>
                  </div>
                  <Badge tone={openCount ? "green" : "neutral"}>{openCount} open</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {assignmentRows.map(({ period, assignment, offPeriod }) => (
                    <div key={period} className="rounded-md border border-slate-200 bg-paper p-3 text-sm">
                      <p className="font-bold text-forest-900">{PERIOD_LABEL[period]}</p>
                      {assignment ? (
                        <p className="mt-1 text-slate-700">{assignment.offering.activity.name} ({assignment.offering.area.name})</p>
                      ) : offPeriod ? (
                        <p className="mt-1 font-black text-amber-700">OFF</p>
                      ) : (
                        <p className="mt-1 text-slate-400">Unassigned</p>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState title="No active staff" body="Import or activate staff before reviewing assignments." />
      )}
    </AppShell>
  );
}
