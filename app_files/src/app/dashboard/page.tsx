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
