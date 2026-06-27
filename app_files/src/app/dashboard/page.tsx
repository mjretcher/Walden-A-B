import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, FileText, Megaphone, Puzzle, RefreshCw, Repeat2, Users, UserRound, AlertTriangle } from "lucide-react";
import { Period, RegistrationRole, RegistrationStatus, SwitchStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAMPER_PERIODS, PERIOD_LABEL } from "@/lib/periods";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

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

  const [totalCampers, registeredCampers, activeStaff, pendingSwitches, offerings, areaStats] = await Promise.all([
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.registration.findMany({ where: { sessionId: session.id, status: { in: activeRegistration } }, distinct: ["camperId"], select: { camperId: true } }),
    prisma.staff.count({ where: { active: true } }),
    prisma.switchRequest.count({ where: { sessionId: session.id, status: SwitchStatus.PENDING } }),
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
      include: {
        staffAssignments: true,
        _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
      }
    }),
    prisma.registration.findMany({
      where: { sessionId: session.id, status: { in: activeRegistration }, registrationRole: RegistrationRole.CAMPER, offering: { active: true, area: { active: true }, visibleForCamperRegistration: true } },
      select: { period: true, offering: { select: { area: { select: { id: true, name: true } } } } }
    })
  ]);

  const fullOfferings = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations >= offering.rosterLimit);
  const overCapacity = offerings.filter((offering) => offering.rosterLimit && offering._count.registrations > offering.rosterLimit);
  const staffingIncomplete = offerings.filter((offering) => offering.staffAssignments.length < offering.staffTarget);
  const openOfferings = offerings.length - fullOfferings.length;
  const registeredPercent = totalCampers ? Math.round((registeredCampers.length / totalCampers) * 1000) / 10 : 0;

  // Build area × period grid: area name → period → camper count
  const areaPeriodMap = new Map<string, { areaId: string; areaName: string; counts: Map<Period, number> }>();
  for (const reg of areaStats) {
    const areaId = reg.offering.area.id;
    const areaName = reg.offering.area.name;
    const period = reg.period as Period;
    if (!areaPeriodMap.has(areaId)) areaPeriodMap.set(areaId, { areaId, areaName, counts: new Map() });
    const entry = areaPeriodMap.get(areaId)!;
    entry.counts.set(period, (entry.counts.get(period) ?? 0) + 1);
  }
  const areaRows = Array.from(areaPeriodMap.values()).sort((a, b) => a.areaName.localeCompare(b.areaName));

  return (
    <AppShell user={user}>
      <div className="-mx-4 -mt-32 mb-8 border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:-mx-8 md:-mt-7 md:px-8 xl:-mx-9 xl:px-9">
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
        <Metric icon={<Users />} value={totalCampers} label="Active Campers" detail={`${session.name}`} tone="green" />
        <Metric icon={<CheckCircle2 />} value={registeredCampers.length} label="Registered" detail={`${registeredPercent}% of active campers`} tone="green" />
        <Metric icon={<UserRound />} value={activeStaff} label="Active Staff" detail="Currently active" tone="blue" />
        <Metric icon={<Repeat2 />} value={pendingSwitches} label="Pending Switches" detail="Camper and staff" tone="amber" />
        <Metric icon={<BookOpen />} value={openOfferings} label="Open Offerings" detail="Offerings with openings" tone="blue" />
        <Metric icon={<Users />} value={fullOfferings.length} label="Full Offerings" detail="At or above limit" tone="amber" />
        <Metric icon={<AlertTriangle />} value={overCapacity.length} label="Over Capacity" detail="Above roster limit" tone="red" />
        <Metric icon={<Users />} value={staffingIncomplete.length} label="Staffing Incomplete" detail="Below staff target" tone="amber" />
      </section>

      {/* Area × Period grid */}
      {areaRows.length > 0 && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 text-xl font-black text-forest-900"><Users className="h-6 w-6 text-forest-700" />Campers by Area &amp; Period</h2>
            <span className="text-xs font-semibold text-slate-400">Active registrations · {session.name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-2.5 text-left text-xs font-black uppercase tracking-wide text-slate-500">Area</th>
                  {CAMPER_PERIODS.map((p) => (
                    <th key={p} className="px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-slate-500">{PERIOD_LABEL[p]}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Compute global max once so shading is relative to the whole table */}
                {(() => {
                  const globalMax = Math.max(...areaRows.flatMap((row) => Array.from(row.counts.values())), 1);
                  return areaRows.map((row, i) => {
                    const rowTotal = Array.from(row.counts.values()).reduce((s, n) => s + n, 0);
                    return (
                      <tr key={row.areaId} className={`border-b border-slate-100 last:border-0 ${i % 2 === 1 ? "bg-slate-50/50" : ""}`}>
                        <td className="px-5 py-2.5 font-black text-forest-900">{row.areaName}</td>
                        {CAMPER_PERIODS.map((p) => {
                          const count = row.counts.get(p) ?? 0;
                          const ratio = count / globalMax;
                          const cellBg = count === 0 ? "" : ratio < 0.2 ? "bg-forest-50" : ratio < 0.4 ? "bg-forest-100" : ratio < 0.6 ? "bg-forest-200" : ratio < 0.8 ? "bg-forest-400" : "bg-forest-600";
                          const cellText = ratio >= 0.6 ? "text-white font-black" : ratio >= 0.4 ? "text-forest-900 font-black" : ratio > 0 ? "text-forest-800 font-semibold" : "text-slate-300";
                          return (
                            <td key={p} className={`px-3 py-2.5 text-center ${cellBg} ${cellText}`}>
                              {count > 0 ? count : "—"}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center font-black text-slate-700">{rowTotal}</td>
                      </tr>
                    );
                  });
                })()}
                {/* Column totals row */}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-500">Total</td>
                  {CAMPER_PERIODS.map((p) => {
                    const colTotal = areaRows.reduce((sum, row) => sum + (row.counts.get(p) ?? 0), 0);
                    return (
                      <td key={p} className="px-3 py-2.5 text-center font-black text-slate-700">
                        {colTotal > 0 ? colTotal : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-black text-forest-900">
                    {areaRows.reduce((sum, row) => sum + Array.from(row.counts.values()).reduce((s, n) => s + n, 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

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
