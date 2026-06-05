import { RegistrationStatus, SwitchStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, Panel, SectionHeader, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CamperQuickSearch } from "./camper-quick-search";

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
      include: { cabin: true, registrations: { where: { status: { in: activeRegistration } }, select: { id: true, period: true, registrationWindow: true } } },
      orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.registration.findMany({ where: { sessionId: session.id, status: { in: activeRegistration } }, distinct: ["camperId"], select: { camperId: true } }),
    prisma.staff.count({ where: { active: true } }),
    prisma.switchRequest.count({ where: { sessionId: session.id, status: SwitchStatus.PENDING } }),
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
      include: { area: true, activity: true, _count: { select: { registrations: { where: { status: { in: activeRegistration } } }, staffAssignments: true } } },
      orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
    })
  ]);

  const fullOfferings = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations >= offering.rosterLimit);
  const overCapacity = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations > offering.rosterLimit);
  const emptyOfferings = offerings.filter((offering) => offering._count.registrations === 0);
  const approvalOnlyOfferings = offerings.filter((offering) => !offering.rosterLimit);
  const noStaffOfferings = offerings.filter((offering) => offering._count.staffAssignments === 0);
  const activityHealthIssues = emptyOfferings.length + approvalOnlyOfferings.length + overCapacity.length + noStaffOfferings.length;
  const staffingIncomplete = offerings.filter((offering) => offering._count.staffAssignments < offering.staffTarget);
  const missingCabinCampers = campers.filter((camper) => !camper.cabinId);
  const noRegistrationCampers = campers.filter((camper) => !camper.registrations.length);
  const partialScheduleCampers = campers.filter((camper) => camper.registrations.length > 0 && camper.registrations.length < 8);
  const medicalFlagCampers = campers.filter((camper) => camper.medicalFlags?.trim());
  const camperHealthIssues = missingCabinCampers.length + noRegistrationCampers.length + partialScheduleCampers.length + medicalFlagCampers.length;
  const actionCount = overCapacity.length + staffingIncomplete.length + pendingSwitches + camperHealthIssues + activityHealthIssues;
  const scheduleReadyCampers = totalCampers - noRegistrationCampers.length - partialScheduleCampers.length;
  const scheduleReadyPercent = totalCampers ? Math.round((scheduleReadyCampers / totalCampers) * 100) : 100;
  const staffedOfferings = offerings.length - noStaffOfferings.length;
  const staffedPercent = offerings.length ? Math.round((staffedOfferings / offerings.length) * 100) : 100;
  const priorityActions = [
    ...(overCapacity.length ? [{ label: "Fix over-capacity offerings", count: overCapacity.length, href: "/area-dashboard", tone: "bg-red-50 text-red-900 border-red-200", detail: "Move campers or raise limits before rosters are printed." }] : []),
    ...(staffingIncomplete.length ? [{ label: "Close staffing gaps", count: staffingIncomplete.length, href: "/area-dashboard", tone: "bg-amber-50 text-amber-900 border-amber-200", detail: "Assign staff where targets are not met." }] : []),
    ...(pendingSwitches ? [{ label: "Review pending switches", count: pendingSwitches, href: "/switches", tone: "bg-blue-50 text-blue-900 border-blue-200", detail: "Approve or deny camper and staff movement requests." }] : []),
    ...(missingCabinCampers.length ? [{ label: "Assign missing cabins", count: missingCabinCampers.length, href: "/admin/campers?cabin=__NO_CABIN__", tone: "bg-purple-50 text-purple-900 border-purple-200", detail: "Place campers before daily operations begin." }] : []),
    ...(noRegistrationCampers.length ? [{ label: "Place unregistered campers", count: noRegistrationCampers.length, href: "/admin/campers", tone: "bg-orange-50 text-orange-900 border-orange-200", detail: "Campers with no active activity registrations." }] : []),
    ...(partialScheduleCampers.length ? [{ label: "Complete partial schedules", count: partialScheduleCampers.length, href: "/admin/campers", tone: "bg-yellow-50 text-yellow-900 border-yellow-200", detail: "Campers with fewer than 8 active registrations." }] : []),
    ...(medicalFlagCampers.length ? [{ label: "Review medical placement notes", count: medicalFlagCampers.length, href: "/admin/campers", tone: "bg-rose-50 text-rose-900 border-rose-200", detail: "Check notes before assigning or moving campers." }] : []),
    ...(emptyOfferings.length ? [{ label: "Review empty offerings", count: emptyOfferings.length, href: "/area-dashboard", tone: "bg-slate-50 text-slate-900 border-slate-200", detail: "Decide whether to promote, staff, or close empty activities." }] : []),
    ...(noStaffOfferings.length ? [{ label: "Assign zero-staff offerings", count: noStaffOfferings.length, href: "/area-dashboard", tone: "bg-indigo-50 text-indigo-900 border-indigo-200", detail: "Active offerings currently have no assigned staff." }] : [])
  ].slice(0, 6);
  const topCapacityRisks = overCapacity.slice(0, 5);
  const topStaffingRisks = staffingIncomplete.slice(0, 5);

  return (
    <AppShell user={user}>
      <PageHeader title="Admin Dashboard" eyebrow={session.name}><Badge tone="blue">Live camp operations</Badge></PageHeader>
      {actionCount ? <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">Action needed: {overCapacity.length} over-capacity offering(s), {staffingIncomplete.length} staffing gap(s), {pendingSwitches} pending switch request(s), {camperHealthIssues} camper health item(s), and {activityHealthIssues} activity health item(s).</section> : null}

      <Panel className="mb-8 border-lake-200 bg-lake-50/60">
        <SectionHeader title="Find Camper Now" eyebrow="Immediate lookup" description="Search by first name, last name, full name, or cabin and open Camper Management filtered to that camper.">
          <Badge tone="blue">Fast search</Badge>
        </SectionHeader>
        <CamperQuickSearch
          campers={campers.map((camper) => ({
            id: camper.id,
            name: `${camper.firstName} ${camper.lastName}`,
            cabinName: camper.cabin?.name ?? "No cabin",
            registrationCount: camper.registrations.length
          }))}
        />
      </Panel>

      <Panel className="mb-8 border-forest-200 bg-white">
        <SectionHeader title="Operations Command Center" eyebrow="Highest-priority next actions" description="A live triage board built from campers, registrations, switches, capacity, and staffing.">
          <Badge tone={actionCount ? "amber" : "green"}>{actionCount ? `${actionCount} open issue(s)` : "All clear"}</Badge>
        </SectionHeader>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Readiness</p>
            <div className="mt-4 grid gap-3">
              <div>
                <div className="flex justify-between text-sm font-bold text-forest-900"><span>Camper schedules</span><span>{scheduleReadyPercent}%</span></div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-forest-700" style={{ width: `${scheduleReadyPercent}%` }} /></div>
                <p className="mt-1 text-xs font-medium text-slate-500">{scheduleReadyCampers} of {totalCampers} campers are fully or mostly ready.</p>
              </div>
              <div>
                <div className="flex justify-between text-sm font-bold text-forest-900"><span>Offering staffing</span><span>{staffedPercent}%</span></div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-lake-700" style={{ width: `${staffedPercent}%` }} /></div>
                <p className="mt-1 text-xs font-medium text-slate-500">{staffedOfferings} of {offerings.length} offerings have at least one assigned staff member.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Priority queue</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {priorityActions.length ? priorityActions.map((action) => (
                <a className={`rounded-xl border p-3 transition hover:shadow-soft ${action.tone}`} href={action.href} key={action.label}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-black">{action.label}</p>
                    <span className="rounded-full bg-white/80 px-2 py-1 text-sm font-black">{action.count}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium opacity-80">{action.detail}</p>
                </a>
              )) : <p className="rounded-xl border border-green-200 bg-green-50 p-4 font-bold text-green-900">No critical operational issues detected.</p>}
            </div>
          </div>
        </div>

        {(topCapacityRisks.length || topStaffingRisks.length) ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
              <p className="font-black text-red-950">Top capacity risks</p>
              <div className="mt-3 grid gap-2">
                {topCapacityRisks.length ? topCapacityRisks.map((offering) => (
                  <a className="rounded-xl bg-white p-3 text-sm font-semibold text-red-950 hover:shadow-soft" href="/area-dashboard" key={offering.id}>
                    {offering.activity.name} · {offering.area.name} · {offering.period}: {offering._count.registrations}/{offering.rosterLimit}
                  </a>
                )) : <p className="text-sm font-medium text-slate-500">No offerings are over capacity.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
              <p className="font-black text-amber-950">Top staffing risks</p>
              <div className="mt-3 grid gap-2">
                {topStaffingRisks.length ? topStaffingRisks.map((offering) => (
                  <a className="rounded-xl bg-white p-3 text-sm font-semibold text-amber-950 hover:shadow-soft" href="/area-dashboard" key={offering.id}>
                    {offering.activity.name} · {offering.area.name} · {offering.period}: {offering._count.staffAssignments}/{offering.staffTarget} staff
                  </a>
                )) : <p className="text-sm font-medium text-slate-500">All offerings meet staffing targets.</p>}
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

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

      <Panel className="mt-8"><SectionHeader title="Camper Health" eyebrow="Operational readiness" description="Campers who may need attention before activity periods run."><Badge tone={camperHealthIssues ? "amber" : "green"}>{camperHealthIssues} item(s)</Badge></SectionHeader><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><a className="rounded-xl border border-slate-200 bg-white p-4" href="/admin/campers?cabin=__NO_CABIN__"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Missing cabin</p><p className="mt-1 text-3xl font-black text-forest-900">{missingCabinCampers.length}</p><p className="mt-2 text-sm text-slate-500">Active campers without a cabin assignment.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/admin/campers"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">No registrations</p><p className="mt-1 text-3xl font-black text-forest-900">{noRegistrationCampers.length}</p><p className="mt-2 text-sm text-slate-500">Campers not yet placed in any active activity.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/admin/campers"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Partial schedules</p><p className="mt-1 text-3xl font-black text-forest-900">{partialScheduleCampers.length}</p><p className="mt-2 text-sm text-slate-500">Campers with fewer than 8 active registrations.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/admin/campers"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Medical flags</p><p className="mt-1 text-3xl font-black text-forest-900">{medicalFlagCampers.length}</p><p className="mt-2 text-sm text-slate-500">Campers with placement notes.</p></a></div></Panel>
      <Panel className="mt-8"><SectionHeader title="Activity Health" eyebrow="Program readiness" description="Offerings that may need setup, staffing, or capacity review."><Badge tone={activityHealthIssues ? "amber" : "green"}>{activityHealthIssues} item(s)</Badge></SectionHeader><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><a className="rounded-xl border border-slate-200 bg-white p-4" href="/area-dashboard"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Empty offerings</p><p className="mt-1 text-3xl font-black text-forest-900">{emptyOfferings.length}</p><p className="mt-2 text-sm text-slate-500">Active activities with no campers.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/area-dashboard"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Approval-only</p><p className="mt-1 text-3xl font-black text-forest-900">{approvalOnlyOfferings.length}</p><p className="mt-2 text-sm text-slate-500">Offerings without standard capacity.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/area-dashboard"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">No staff</p><p className="mt-1 text-3xl font-black text-forest-900">{noStaffOfferings.length}</p><p className="mt-2 text-sm text-slate-500">Offerings with zero staff assigned.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/area-dashboard"><p className="text-sm font-bold uppercase tracking-wide text-slate-400">Over capacity</p><p className="mt-1 text-3xl font-black text-forest-900">{overCapacity.length}</p><p className="mt-2 text-sm text-slate-500">Offerings above roster limit.</p></a></div></Panel>
      <Panel className="mt-8"><SectionHeader title="Operations Hub" eyebrow="Quick launch" description="Jump directly into the highest-use camp operations workflows."><Badge tone="blue">One-tap workflows</Badge></SectionHeader><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><a className="rounded-xl border border-slate-200 bg-white p-4" href="/admin/campers"><p className="font-bold text-forest-900">Camper Management</p><p className="mt-1 text-sm text-slate-500">Search campers, adjust cabins, view registrations, and manage swim levels.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/registration"><p className="font-bold text-forest-900">Registration</p><p className="mt-1 text-sm text-slate-500">Add campers to activities.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/attendance"><p className="font-bold text-forest-900">Attendance</p><p className="mt-1 text-sm text-slate-500">Load rosters and mark attendance.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/switches"><p className="font-bold text-forest-900">Switches</p><p className="mt-1 text-sm text-slate-500">Review camper and staff changes.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/area-dashboard"><p className="font-bold text-forest-900">Area Dashboard</p><p className="mt-1 text-sm text-slate-500">Review A/B periods and assignments.</p></a><a className="rounded-xl border border-slate-200 bg-white p-4" href="/rosters"><p className="font-bold text-forest-900">Rosters</p><p className="mt-1 text-sm text-slate-500">Print roster sheets.</p></a></div></Panel>
    </AppShell>
  );
}
