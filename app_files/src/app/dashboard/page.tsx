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

  const [totalCampers, campers, registeredCampers, totalStaff, pendingSwitches, offerings] = await Promise.all([
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      include: {
        cabin: true,
        registrations: {
          where: { status: { in: activeRegistration } },
          select: { id: true, period: true, registrationWindow: true }
        }
      },
      orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }]
    }),
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
  const staffingTriage = [...staffingIncomplete]
    .sort((left, right) => {
      const leftMissing = left.staffTarget - left._count.staffAssignments;
      const rightMissing = right.staffTarget - right._count.staffAssignments;
      const leftCampers = left._count.registrations;
      const rightCampers = right._count.registrations;
      return rightMissing - leftMissing || rightCampers - leftCampers || left.activity.name.localeCompare(right.activity.name);
    })
    .slice(0, 10);
  const missingCabinCampers = campers.filter((camper) => !camper.cabinId);
  const noRegistrationCampers = campers.filter((camper) => !camper.registrations.length);
  const partialScheduleCampers = campers.filter((camper) => camper.registrations.length > 0 && camper.registrations.length < 8);
  const medicalFlagCampers = campers.filter((camper) => camper.medicalFlags?.trim());
  const camperHealthIssues = missingCabinCampers.length + noRegistrationCampers.length + partialScheduleCampers.length + medicalFlagCampers.length;
  const actionCount = overCapacity.length + staffingIncomplete.length + pendingSwitches + camperHealthIssues;
  const urgentOfferings = [...overCapacity, ...staffingTriage.filter((offering) => !overCapacity.some((over) => over.id === offering.id))].slice(0, 8);

  return (
    <AppShell user={user}>
      <PageHeader title="Admin Dashboard" eyebrow={session.name}>
        <Badge tone="blue">Live camp operations</Badge>
      </PageHeader>

      {actionCount ? (
        <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          Action needed: {overCapacity.length} over-capacity offering(s), {staffingIncomplete.length} staffing gap(s), {pendingSwitches} pending switch request(s), and {camperHealthIssues} camper health item(s).
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

      <Panel className="mt-8">
        <SectionHeader title="Camper Health" eyebrow="Operational readiness" description="Campers who may need attention before activity periods run.">
          <Badge tone={camperHealthIssues ? "amber" : "green"}>{camperHealthIssues} item(s)</Badge>
        </SectionHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/admin/campers?cabin=__NO_CABIN__">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Missing cabin</p>
            <p className="mt-1 text-3xl font-black text-forest-900">{missingCabinCampers.length}</p>
            <p className="mt-2 text-sm text-slate-500">Active campers without a cabin assignment.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/admin/campers">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">No registrations</p>
            <p className="mt-1 text-3xl font-black text-forest-900">{noRegistrationCampers.length}</p>
            <p className="mt-2 text-sm text-slate-500">Campers not yet placed in any active activity.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/admin/campers">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Partial schedules</p>
            <p className="mt-1 text-3xl font-black text-forest-900">{partialScheduleCampers.length}</p>
            <p className="mt-2 text-sm text-slate-500">Campers with fewer than 8 active A/B registrations.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/admin/campers">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Medical flags</p>
            <p className="mt-1 text-3xl font-black text-forest-900">{medicalFlagCampers.length}</p>
            <p className="mt-2 text-sm text-slate-500">Campers with notes that may affect activity placement.</p>
          </a>
        </div>
      </Panel>

      <Panel className="mt-8">
        <SectionHeader title="Operations Hub" eyebrow="Quick launch" description="Jump directly into the highest-use camp operations workflows.">
          <Badge tone="blue">One-tap workflows</Badge>
        </SectionHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/admin/campers">
            <p className="font-bold text-forest-900">Camper Management</p>
            <p className="mt-1 text-sm text-slate-500">Search campers, adjust cabins, view registrations, and manage swim levels.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/registration">
            <p className="font-bold text-forest-900">Registration</p>
            <p className="mt-1 text-sm text-slate-500">Add campers to activities with capacity and approval visibility.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/attendance">
            <p className="font-bold text-forest-900">Attendance</p>
            <p className="mt-1 text-sm text-slate-500">Load rosters, mark attendance, and track missing campers.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/switches">
            <p className="font-bold text-forest-900">Switches</p>
            <p className="mt-1 text-sm text-slate-500">Create, review, approve, or deny camper and staff schedule changes.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/area-dashboard">
            <p className="font-bold text-forest-900">Area Dashboard</p>
            <p className="mt-1 text-sm text-slate-500">Review A/B day periods, staffing, capacity, and area assignments.</p>
          </a>
          <a className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/rosters">
            <p className="font-bold text-forest-900">Rosters</p>
            <p className="mt-1 text-sm text-slate-500">Print activity rosters and attendance-ready class sheets.</p>
          </a>
        </div>
      </Panel>

      <Panel className="mt-8">
        <SectionHeader title="Operations Command Center" eyebrow="Today&apos;s priorities" description="The highest-impact items to resolve before camp activities run.">
          <Badge tone={urgentOfferings.length || pendingSwitches ? "amber" : "green"}>{urgentOfferings.length + pendingSwitches} open item(s)</Badge>
        </SectionHeader>
        <div className="grid gap-3 xl:grid-cols-2">
          {pendingSwitches ? (
            <a className="rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:bg-amber-100" href="/switches">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-800">Switch approvals</p>
                  <p className="mt-1 text-2xl font-black text-forest-900">{pendingSwitches}</p>
                </div>
                <Badge tone="amber">Review now</Badge>
              </div>
              <p className="mt-2 text-sm text-amber-900">Pending camper or staff schedule changes need a decision.</p>
            </a>
          ) : null}

          {urgentOfferings.map((offering) => {
            const missing = Math.max(offering.staffTarget - offering._count.staffAssignments, 0);
            const over = Boolean(offering.rosterLimit && offering._count.registrations > offering.rosterLimit);
            return (
              <a key={offering.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href="/area-dashboard">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-forest-900">{offering.activity.name}</p>
                    <p className="text-sm text-slate-500">{PERIOD_LABEL[offering.period]} - {offering.area.name}</p>
                  </div>
                  <Badge tone={over ? "red" : missing >= 3 ? "red" : "amber"}>{over ? "Over capacity" : `${missing} staff missing`}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">Campers: {offering._count.registrations}{offering.rosterLimit ? ` / ${offering.rosterLimit}` : " / approval"} · Staff: {offering._count.staffAssignments} / {offering.staffTarget}</p>
              </a>
            );
          })}

          {!urgentOfferings.length && !pendingSwitches ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">No urgent capacity, staffing, or switch approval items right now.</p>
          ) : null}
        </div>
      </Panel>

      <Panel className="mt-8">
        <SectionHeader title="Smart Staffing Triage" eyebrow="Ranked by urgency" description="Staffing gaps are sorted by missing staff count, then camper load.">
          <Badge tone={staffingTriage.length ? "amber" : "green"}>{staffingIncomplete.length} total gap(s)</Badge>
        </SectionHeader>
        <div className="grid gap-3 lg:grid-cols-2">
          {staffingTriage.map((offering, index) => {
            const missing = Math.max(offering.staffTarget - offering._count.staffAssignments, 0);
            return (
              <a key={offering.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-300 hover:bg-amber-50/50" href="/area-dashboard">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Priority #{index + 1}</p>
                    <p className="mt-1 font-bold text-forest-900">{offering.activity.name}</p>
                    <p className="text-sm text-slate-500">{PERIOD_LABEL[offering.period]} - {offering.area.name}</p>
                  </div>
                  <Badge tone={missing >= 3 ? "red" : "amber"}>{missing} missing</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">Staff: {offering._count.staffAssignments} / {offering.staffTarget} · Campers: {offering._count.registrations}{offering.rosterLimit ? ` / ${offering.rosterLimit}` : " / approval"}</p>
              </a>
            );
          })}
          {!staffingTriage.length ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">All active offerings meet their staff targets.</p> : null}
        </div>
      </Panel>

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
