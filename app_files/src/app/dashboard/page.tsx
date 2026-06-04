import { RegistrationStatus, SwitchStatus } from "@prisma/client";
import Link from "next/link";
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
        <PageHeader title="Dashboard" eyebrow="Camp Walden" description="Create or seed a session before running A/B operations." />
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

  return (
    <AppShell user={user}>
      <PageHeader
        title="Admin Dashboard"
        eyebrow={session.name}
        description="Live registration, staffing, and capacity signals for the current A/B cycle."
      >
        <Badge tone="blue">Live camp operations</Badge>
      </PageHeader>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/registration", label: "Run Registration", detail: "Find campers and place activities" },
          { href: "/scream-session", label: "Scream Session", detail: "Assign staff period by period" },
          { href: "/admin/campers", label: "Camper Mgmt", detail: "Bulk swim levels, cabins, schedules" },
          { href: "/admin/menu-builder", label: "Menu Builder", detail: "Edit offerings, limits, and notes" }
        ].map((action) => (
          <Link
            key={action.href}
            className="rounded-lg border border-white/80 bg-white/95 p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-lake-100 hover:bg-lake-50/40"
            href={action.href}
          >
            <span className="block text-sm font-black text-forest-900">{action.label}</span>
            <span className="mt-1 block text-sm leading-5 text-slate-500">{action.detail}</span>
          </Link>
        ))}
      </section>

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
          <SectionHeader title="Offerings Snapshot" detail="Capacity and staffing health across active offerings.">
            <Badge>{offerings.length} active</Badge>
          </SectionHeader>
          <div className="hidden overflow-x-auto md:block">
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
                {offerings.slice(0, 24).map((offering) => {
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
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {offerings.slice(0, 24).map((offering) => {
              const missing = Math.max(offering.staffTarget - offering._count.staffAssignments, 0);
              return (
                <div key={offering.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-forest-900">{offering.activity.name}</p>
                      <p className="text-sm text-slate-500">{offering.area.name} - {PERIOD_LABEL[offering.period]}</p>
                    </div>
                    <CapacityPill count={offering._count.registrations} limit={offering.rosterLimit} limitType={offering.limitType} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-600">Staff {offering._count.staffAssignments} / {offering.staffTarget}</span>
                    {missing ? <Badge tone="amber">Needs {missing}</Badge> : <Badge tone="green">Complete</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
          {offerings.length > 24 ? <p className="mt-3 text-sm font-medium text-slate-500">Showing 24 of {offerings.length} active offerings.</p> : null}
        </Panel>

        <Panel>
          <SectionHeader title="Scream Session Focus" detail="Offerings still below staff target." />
          <div className="mt-4 grid gap-3">
            {staffingIncomplete.slice(0, 8).map((offering) => (
              <div key={offering.id} className="rounded-lg border border-slate-200 bg-white p-3">
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
