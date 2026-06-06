import Link from "next/link";
import { ExternalLink, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { Period, UserRole } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

type SearchParams = {
  areaId?: string | string[];
  day?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const dayPeriods: Record<string, Period[]> = {
  B: [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B],
  A: [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A],
  ALL: STAFF_PERIODS
};

function isLifeguard(certifications: { name: string }[]) {
  return certifications.some((certification) => /\bLG\b|lifeguard/i.test(certification.name));
}

export default async function AreaBlockPlanReport({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });
  const areas = await prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const areaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : firstParam(params.areaId) ?? areas[0]?.id;
  const day = firstParam(params.day) === "A" ? "A" : firstParam(params.day) === "ALL" ? "ALL" : "B";
  const periods = dayPeriods[day];
  const selectedArea = areas.find((area) => area.id === areaId);

  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true, areaId, period: { in: periods } },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: { include: { certifications: true } } }, orderBy: [{ staff: { lastName: "asc" } }, { staff: { firstName: "asc" } }] },
          _count: { select: { registrations: true } }
        },
        orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
      })
    : [];

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Area Block Plan Monitor</h1>
          <p className="mt-1 text-slate-600">Second-monitor view of staff dropping into area activities during Scream Session.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryButtonClass} href="/reports/area-block-plan"><RefreshCw className="h-4 w-4" />Refresh</Link>
          <span className={secondaryButtonClass}><Printer className="h-4 w-4" />Use Browser Print</span>
          <a className={secondaryButtonClass} href={`/api/exports/area-block-plan?format=xlsx&areaId=${areaId}`}><ExternalLink className="h-4 w-4" />XLSX</a>
        </div>
      </div>

      <form className="no-print mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-3" method="get">
        {user.role === UserRole.EXECUTIVE_ADMIN ? (
          <label className="grid gap-1.5 text-sm font-black text-slate-700">
            Area
            <select className="min-h-11 rounded-lg border border-slate-200 px-3" name="areaId" defaultValue={areaId}>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          Day
          <select className="min-h-11 rounded-lg border border-slate-200 px-3" name="day" defaultValue={day}>
            <option value="B">B Day</option>
            <option value="A">A Day</option>
            <option value="ALL">All Staff Periods</option>
          </select>
        </label>
        <div className="flex items-end">
          <button className="min-h-11 rounded-lg bg-forest-900 px-4 text-sm font-black text-white" type="submit">Update View</button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-forest-900">{selectedArea?.name ?? "Area"} • {session?.name ?? "No active session"}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Staff assignments update here after Scream Session saves.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-800">
              <ShieldCheck className="h-4 w-4" />
              Red LG badge = lifeguard present
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[1320px] grid-cols-5 gap-0">
          {periods.map((period) => {
            const periodOfferings = offerings.filter((offering) => offering.period === period);
            return (
              <div key={period} className="min-h-[560px] border-r border-slate-200 bg-slate-50/35 p-4 last:border-r-0">
                <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
                  <h3 className="text-2xl font-black text-forest-900">{PERIOD_LABEL[period]}</h3>
                  <Badge tone="blue">{periodOfferings.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {periodOfferings.length ? periodOfferings.map((offering) => (
                    <article key={offering.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-panel">
                      <div className="flex min-w-0 gap-3">
                        <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-lg font-black leading-tight text-slate-950">{offering.activity.name}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-lake-50 px-2.5 py-1 text-xs font-black text-lake-800">Campers {offering._count.registrations} / {offering.rosterLimit ?? "Approval"}</span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">Staff {offering.staffAssignments.length} / {offering.staffTarget}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {offering.staffAssignments.length ? offering.staffAssignments.map((assignment) => {
                          const lifeguard = isLifeguard(assignment.staff.certifications);
                          return (
                          <span key={assignment.id} className={`flex min-h-9 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-black ${lifeguard ? "bg-red-600 text-white shadow-sm" : "bg-forest-50 text-forest-800"}`}>
                            <span className="truncate">{assignment.staff.firstName} {assignment.staff.lastName[0]}.</span>
                            {lifeguard ? <span className="inline-flex items-center gap-1 rounded-md bg-white/18 px-1.5 py-0.5 text-[0.68rem]"><ShieldCheck className="h-3 w-3" />LG</span> : null}
                          </span>
                          );
                        }) : <span className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-black text-orange-700">Needs staff</span>}
                      </div>
                    </article>
                  )) : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-500">No offerings.</p>}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
