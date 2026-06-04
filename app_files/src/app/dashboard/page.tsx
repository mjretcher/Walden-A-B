import { RegistrationStatus, SwitchStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, CapacityPill, PageHeader, Panel, SectionHeader, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function DashboardPage() {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Dashboard" eyebrow="Camp Walden" />
        <Panel>Create or seed a session to begin.</Panel>
      </AppShell>
    );
  }

  const [totalCampers, registeredCampers, totalStaff, pendingSwitches, offerings] = await Promise.all([
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.registration.findMany({
      where: { sessionId: session.id, status: { in: activeRegistration } },
      distinct: ["camperId"],
      select: { camperId: true }
    }),
    prisma.staff.count({ where: { active: true } }),
    prisma.switchRequest.count({ where: { sessionId: session.id, status: SwitchStatus.PENDING } }),
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
      include: {
        area: true,
        activity: true,
        _count: {
          select: {
            registrations: { where: { status: { in: activeRegistration } } },
            staffAssignments: true
          }
        }
      },
      orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
    })
  ]);

  const fullOfferings = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations >= offering.rosterLimit);
  const overCapacity = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations > offering.rosterLimit);
  const staffingIncomplete = offerings.filter((offering) => offering._count.staffAssignments < offering.staffTarget);
  const actionCount = overCapacity.length + staffingIncomplete.length + pendingSwitches;

  return (
    <AppShell user={user}>
      <PageHeader title="Admin Dashboard" eyebrow={session.name}>
        <Badge tone="blue">Live camp operations</Badge>
      </PageHeader>

      {actionCount ? (
        <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          Action needed: {overCapacity.length} over-capacity offering(s), {staffingIncomplete.length} staffing gap(s), and {pendingSwitches} pending switch request(s).
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total campers" value={totalCampers} detail="Active in current session" />
        <StatCard label="Registered campers" value={registeredCampers.length} tone="lake" detail="At least one active A/B class" />
        <StatCard label="Total staff" value={totalStaff} tone="bark" detail="Active counseling staff" />
        <StatCard label="Pending switches" value={pendingSwitches} tone={pendingSwitches ? "warning" : "forest"} detail="Camper or staff approvals" />
        <StatCard label="Open offerings" value={offerings.length - fullOfferings.length} tone="forest" />
        <StatCard label="Full offerings" value={fullOfferings.length} tone={fullOfferings.length ? "warning" : "forest"} />
        <StatCard label="Over capacity" value={overCapacity.length} tone={overCapacity.length ? "warning" : "forest"} />
        <StatCard label="Staffing incomplete" value={staffingIncomplete.length} tone={staffingIncomplete.length ? "warning" : "forest"} />
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <SectionHeader title="Offerings Snapshot" description="Current capacity and staffing status across active offerings.">
            <Badge>{offerings.length} active</Badge>
          </SectionHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr className="border-b">
                  <th className="py-3">Period</th>
                  <th>Area</th>
                  <th>Activity</th>
                  <th>Campers</th>
                  <th>Staff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {offerings.length ? offerings.slice(0, 18).map((offering) => {
                  const missing = Math.max(offering.staffTarget - offering._count.staffAssignments, 0);
                  return (
                    <tr key={offering.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold">{PERIOD_LABEL[offering.period]}</td>
                      <td>{offering.area.name}</td>
                      <td>{offering.activity.name}</td>
                      <td><CapacityPill count={offering._count.registrations} limit={offering.rosterLimit} limitType={offering.limitType} /></td>
                      <td>{offering._count.staffAssignments} / {offering.staffTarget}</td>
                      <td>{missing ? <Badge tone="amber">Needs {missing}</Badge> : <Badge tone="green">Complete</Badge>}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="py-6 text-center text-sm font-medium text-slate-500" colSpan={6}>
                      No active offerings are available for the current session yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Scream Session Focus" description="Offerings that still need staff coverage." />
          <div className="grid gap-3">
            {staffingIncomplete.slice(0, 8).map((offering) => (
              <div key={offering.id} className="rounded-xl border border-slate-100 bg-paper/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest-900">{offering.activity.name}</p>
                    <p className="text-sm text-slate-500">{offering.area.name} - {PERIOD_LABEL[offering.period]}</p>
                  </div>
                  <Badge tone="amber">{offering.staffTarget - offering._count.staffAssignments} missing</Badge>
                </div>
              </div>
            ))}
            {!staffingIncomplete.length ? <p className="text-sm text-slate-500">Every active offering has its target staff count.</p> : null}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
