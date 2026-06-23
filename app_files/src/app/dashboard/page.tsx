import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, FileText, Megaphone, Puzzle, RefreshCw, Repeat2, Users, UserRound, AlertTriangle } from "lucide-react";
import { RegistrationRole, RegistrationStatus, SwitchStatus, UserRole } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui";
import { GlobalSearchTypeahead } from "@/components/global-search-typeahead";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

function dateLabel(date?: Date | null) {
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : "Dates TBD";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });

  if (!session) {
    return (
      <AppShell user={user}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 font-bold text-amber-900">Create or activate a session before running A/B operations.</div>
      </AppShell>
    );
  }

  const [totalCampers, registeredCampers, totalStaff, activeStaff, pendingSwitches, offerings, nextStaff] = await Promise.all([
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.registration.findMany({ where: { sessionId: session.id, status: { in: activeRegistration } }, distinct: ["camperId"], select: { camperId: true } }),
    prisma.staff.count(),
    prisma.staff.count({ where: { active: true } }),
    prisma.switchRequest.count({ where: { sessionId: session.id, status: SwitchStatus.PENDING } }),
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
      include: {
        area: true,
        activity: true,
        staffAssignments: { include: { staff: true } },
        _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
      },
      orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
    }),
    prisma.staff.findFirst({
      where: { active: true },
      include: { primaryArea: true, skills: true, certifications: true, assignments: { where: { sessionId: session.id } }, offPeriods: { where: { sessionId: session.id } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);

  const fullOfferings = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations >= offering.rosterLimit);
  const overCapacity = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations > offering.rosterLimit);
  const staffingIncomplete = offerings.filter((offering) => offering.staffAssignments.length < offering.staffTarget);
  const openOfferings = offerings.length - fullOfferings.length;
  const registeredPercent = totalCampers ? Math.round((registeredCampers.length / totalCampers) * 1000) / 10 : 0;
  const healthRows = [...overCapacity, ...staffingIncomplete, ...offerings].filter((offering, index, list) => list.findIndex((item) => item.id === offering.id) === index).slice(0, 5);

  return (
    <AppShell user={user}>
      <div className="-mx-4 -mt-24 mb-8 border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:-mx-8 md:-mt-7 md:px-8 xl:-mx-9 xl:px-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm font-black">
            <span>{session.name}</span>
            <span className="text-slate-300">•</span>
            <span>Summer {session.year}</span>
            <Badge tone="green">Active</Badge>
            <Link className="text-lake-700 underline underline-offset-4" href="/admin/structure">Edit session</Link>
            <span className="inline-flex items-center gap-2 text-slate-700">
              <CalendarDays className="h-4 w-4" />
              {dateLabel(session.startsAt)} - {dateLabel(session.endsAt)}
            </span>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <GlobalSearchTypeahead compact />
          </div>
        </div>
      </div>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-forest-900">Admin Dashboard</h1>
          <p className="mt-1 text-base text-slate-600">Welcome back, {user.name.split(" ")[0]}. Here&apos;s what&apos;s happening at Camp Walden.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />All stats update in real time</span>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black shadow-sm hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</Link>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-4">
        <QuickCard href="/registration" icon={<CalendarDays />} title="Registration" body="Open offerings & add campers" tone="forest" />
        <QuickCard href="/scream-session" icon={<Megaphone />} title="Scream Session" body="Assign staff to periods" tone="lake" />
        <QuickCard href="/admin/campers" icon={<Users />} title="Camper Mgmt" body="Search, filter & update campers" tone="forest" />
        <QuickCard href="/admin/menu-builder" icon={<Puzzle />} title="Menu Builder" body="Create & edit offerings" tone="lake" />
        <QuickCard href="/outages" icon={<AlertTriangle />} title="Outages" body="Trips, infirmary & off-camp" tone="forest" />
        {user.role === UserRole.EXECUTIVE_ADMIN ? (
          <QuickCard href="/reports/registration-assignments" icon={<FileText />} title="Reg Assignments" body="Print registration-day staff tables" tone="lake" />
        ) : null}
      </section>

      <section className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users />} value={totalCampers} label="Total Campers" detail="Active session" tone="green" />
        <Metric icon={<CheckCircle2 />} value={registeredCampers.length} label="Registered (All)" detail={`${registeredPercent}% registered`} tone="green" />
        <Metric icon={<UserRound />} value={totalStaff} label="Total Staff" detail={`${activeStaff} active`} tone="blue" />
        <Metric icon={<Repeat2 />} value={pendingSwitches} label="Pending Switches" detail="Camper and staff" tone="amber" />
        <Metric icon={<BookOpen />} value={openOfferings} label="Open Offerings" detail="Offerings with openings" tone="blue" />
        <Metric icon={<Users />} value={fullOfferings.length} label="Full Offerings" detail="At or above limit" tone="amber" />
        <Metric icon={<AlertTriangle />} value={overCapacity.length} label="Over Capacity" detail="Above roster limit" tone="red" />
        <Metric icon={<Users />} value={staffingIncomplete.length} label="Staffing Incomplete" detail="Below staff target" tone="amber" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.92fr]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 text-xl font-black text-forest-900"><BookOpen className="h-6 w-6 text-forest-700" />Offerings Health</h2>
            <Link className="text-sm font-black text-forest-800" href="/area-dashboard">View all</Link>
          </div>
          <div className="grid grid-cols-[1.5fr_0.55fr_0.55fr_0.55fr_0.75fr] border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
            <span>Offering</span><span>Period</span><span>Campers</span><span>Staff</span><span>Status</span>
          </div>
          {healthRows.map((offering) => {
            const campers = offering._count.registrations;
            const staff = offering.staffAssignments.length;
            const over = Boolean(offering.rosterLimit && campers > offering.rosterLimit);
            const needsStaff = staff < offering.staffTarget;
            const status = over ? "Over Capacity" : needsStaff ? "Needs Staff" : "Good";
            return (
              <Link href="/area-dashboard" key={offering.id} className="grid grid-cols-[1.5fr_0.55fr_0.55fr_0.55fr_0.75fr] items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm last:border-b-0 hover:bg-slate-50">
                <span className="flex min-w-0 items-center gap-3">
                  <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-black">{offering.activity.name}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500">{offering.area.name}</span>
                  </span>
                </span>
                <Badge tone="blue">{PERIOD_LABEL[offering.period]}</Badge>
                <span className={over ? "font-black text-red-600" : "font-black"}>{campers}</span>
                <span className={needsStaff ? "font-black text-orange-600" : "font-black text-forest-700"}>{staff} / {offering.staffTarget}</span>
                <Badge tone={over ? "red" : needsStaff ? "amber" : "green"}>{status}</Badge>
              </Link>
            );
          })}
          <div className="p-4">
            <Link href="/area-dashboard" className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-black hover:bg-slate-50">
              View all offerings <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 text-xl font-black text-forest-900"><Megaphone className="h-6 w-6 text-lake-700" />Scream Session Focus</h2>
            <Link className="text-sm font-black text-forest-800" href="/scream-session">View board</Link>
          </div>
          {nextStaff ? (
            <div className="p-5">
              <p className="text-sm font-semibold text-slate-500">Next up in alphabetical order</p>
              <div className="mt-4 rounded-xl border border-slate-200 p-5">
                <div className="flex gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-forest-700 text-xl font-black text-white">{nextStaff.firstName[0]}{nextStaff.lastName[0]}</div>
                  <div>
                    <h3 className="text-lg font-black">{nextStaff.firstName} {nextStaff.lastName}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-600">Primary Area: {nextStaff.primaryArea?.name ?? "Unassigned"}</p>
                    <p className="mt-2 text-sm text-slate-600">Skills: {nextStaff.skills.slice(0, 4).map((skill) => skill.name).join(", ") || "No skills listed"}</p>
                    <p className="mt-1 text-sm text-slate-600">Certs: {nextStaff.certifications.slice(0, 4).map((cert) => cert.name).join(", ") || "No certs listed"}</p>
                    {nextStaff.availabilityNotes ? <Badge tone="amber">Note: {nextStaff.availabilityNotes}</Badge> : null}
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-sm font-black">Assignment Progress</p>
                  <div className="mt-3 grid grid-cols-5 gap-2 lg:grid-cols-10">
                    {STAFF_PERIODS.map((period) => {
                      const assigned = nextStaff.assignments.some((assignment) => assignment.period === period);
                      const offPeriod = nextStaff.offPeriods.some((item) => item.period === period);
                      return <div key={period} className={`rounded-lg border p-2 text-center text-sm font-black ${assigned ? "border-green-200 bg-green-50 text-green-800" : offPeriod ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-500"}`}>{PERIOD_LABEL[period]}<br />{assigned ? "✓" : offPeriod ? "OFF" : "–"}</div>;
                    })}
                  </div>
                </div>
              </div>
              <Link href="/scream-session" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-forest-900 text-sm font-black text-white hover:bg-forest-800">
                Open Scream Session Board <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <p className="p-5 text-sm font-semibold text-slate-500">No active staff found.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function QuickCard({ href, icon, title, body, tone }: { href: string; icon: React.ReactNode; title: string; body: string; tone: "forest" | "lake" }) {
  return (
    <Link href={href} className="group flex min-h-[105px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-panel">
      <span className={`grid h-16 w-16 place-items-center rounded-lg text-white ${tone === "forest" ? "bg-forest-800" : "bg-lake-700"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-black">{title}</span>
        <span className="mt-1 block text-sm font-medium text-slate-600">{body}</span>
      </span>
      <ArrowRight className="h-5 w-5 text-slate-500 transition group-hover:translate-x-1" />
    </Link>
  );
}

function Metric({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: number; label: string; detail: string; tone: "green" | "blue" | "amber" | "red" }) {
  const tones = {
    green: "bg-green-100 text-green-800",
    blue: "bg-lake-100 text-lake-700",
    amber: "bg-orange-100 text-orange-700",
    red: "bg-red-100 text-red-700"
  };
  return (
    <div className="flex min-h-[105px] items-center gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className={`grid h-14 w-14 place-items-center rounded-full ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-3xl font-black leading-none">{value}</p>
        <p className="mt-1 font-black">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">{detail}</p>
      </div>
    </div>
  );
}
