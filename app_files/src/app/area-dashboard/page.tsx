import Link from "next/link";
import { CalendarDays, ChevronUp, Edit3, Grid2X2, List, MoreVertical, Printer, RefreshCw } from "lucide-react";
import { Period, RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const dayGroups = {
  // Twilight periods (P5A / P5B) are included so Area Heads can see who's
  // staffing the 5th-period (twilight) classes. Twilight has staff-only
  // assignments — no campers — but the area still needs to know which staff
  // and which activities are running.
  A: { label: "A Day", periods: [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A] },
  B: { label: "B Day", periods: [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B] }
};

// Period 5 reads as "Twilight" (camp-specific term) rather than "5A"/"5B" —
// matches how staff refer to it. Every other period now shows its plain
// code (1A, 2A, 3A, 4A) instead of a spelled-out ordinal ("First A",
// "Fourth A", etc.) per Mike's request.
const TWILIGHT_PERIOD_NUMBER = "5";

type DayKey = keyof typeof dayGroups;
type ViewMode = "list" | "grid";
type AreaDashboardSearchParams = { area?: string | string[]; day?: string | string[]; view?: string | string[] };

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function selectedDay(value?: string): DayKey {
  return value === "B" ? "B" : "A";
}

function selectedView(value?: string): ViewMode {
  return value === "grid" ? "grid" : "list";
}

function areaDashboardHref({ areaId, day, view }: { areaId?: string; day: DayKey; view: ViewMode }) {
  const params = new URLSearchParams({ day, view });
  if (areaId) params.set("area", areaId);
  return `/area-dashboard?${params.toString()}`;
}

function statusFor(campers: number, limit: number | null, staff: number, target: number) {
  if (limit && campers > limit) return { label: "Over Capacity", tone: "red" as const, color: "bg-red-600" };
  if (staff < target) return { label: "Needs Staff", tone: "amber" as const, color: "bg-orange-500" };
  if (staff > target) return { label: "Overstaffed", tone: "blue" as const, color: "bg-lake-600" };
  return { label: "Complete", tone: "green" as const, color: "bg-green-600" };
}

export default async function AreaDashboardPage({ searchParams }: { searchParams?: Promise<AreaDashboardSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};
  const areas = await prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const selectedAreaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : firstParam(params?.area) ?? areas[0]?.id;
  const day = selectedDay(firstParam(params?.day));
  const view = selectedView(firstParam(params?.view));
  const selectedGroup = dayGroups[day];
  const canFilterArea = user.role === UserRole.EXECUTIVE_ADMIN;

  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, areaId: selectedAreaId, active: true, area: { active: true }, activity: { active: true }, period: { in: selectedGroup.periods } },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: true } },
          _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
        },
        orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
      })
    : [];

  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const rows = offerings.map((offering) => {
    const campers = offering._count.registrations;
    const staff = offering.staffAssignments.length;
    return { offering, campers, staff, status: statusFor(campers, offering.rosterLimit, staff, offering.staffTarget) };
  });
  const totalCampers = rows.reduce((total, row) => total + row.campers, 0);
  const rosterCapacity = rows.reduce((total, row) => total + (row.offering.rosterLimit ?? 0), 0);
  const totalStaff = rows.reduce((total, row) => total + row.staff, 0);
  const totalTarget = rows.reduce((total, row) => total + row.offering.staffTarget, 0);
  const missingStaff = Math.max(totalTarget - totalStaff, 0);
  const counts = {
    complete: rows.filter((row) => row.status.label === "Complete").length,
    needsStaff: rows.filter((row) => row.status.label === "Needs Staff").length,
    overstaffed: rows.filter((row) => row.status.label === "Overstaffed").length,
    overCapacity: rows.filter((row) => row.status.label === "Over Capacity").length,
    underCapacity: rows.filter((row) => row.offering.rosterLimit && row.campers < row.offering.rosterLimit).length
  };

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Area Dashboard</h1>
          <p className="mt-1 text-base text-slate-600">Real-time staffing and enrollment for your area</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
          <span>Last refreshed: {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date())}</span>
          <Link href="/area-dashboard" className={secondaryButtonClass}><RefreshCw className="h-4 w-4" />Refresh</Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="grid gap-5">
          <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" method="get">
            <input name="day" type="hidden" value={day} />
            <input name="view" type="hidden" value={view} />
            <label className="grid gap-2 text-sm font-black text-slate-900">
              Area
              {canFilterArea ? (
                <select className="min-h-12 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold" name="area" defaultValue={selectedAreaId}>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              ) : (
                <span className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 px-4"><ActivityIcon area={selectedArea?.name} size="sm" />{selectedArea?.name ?? "Area"}</span>
              )}
            </label>
            <div className="grid gap-2 text-sm font-black text-slate-900">
              Day
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
                <Link href={areaDashboardHref({ areaId: canFilterArea ? selectedAreaId : undefined, day: "A", view })} className={`grid min-h-12 place-items-center ${day === "A" ? "bg-lake-600 text-white" : "bg-white text-slate-800"}`}>A Day</Link>
                <Link href={areaDashboardHref({ areaId: canFilterArea ? selectedAreaId : undefined, day: "B", view })} className={`grid min-h-12 place-items-center ${day === "B" ? "bg-lake-600 text-white" : "bg-white text-slate-800"}`}>B Day</Link>
              </div>
            </div>
            <div className="grid gap-2 text-sm font-black text-slate-900">
              View
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
                <Link href={areaDashboardHref({ areaId: canFilterArea ? selectedAreaId : undefined, day, view: "list" })} className={`grid min-h-12 place-items-center ${view === "list" ? "bg-lake-600 text-white" : "bg-white text-slate-800"}`} aria-label="List view"><List className="h-4 w-4" /></Link>
                <Link href={areaDashboardHref({ areaId: canFilterArea ? selectedAreaId : undefined, day, view: "grid" })} className={`grid min-h-12 place-items-center ${view === "grid" ? "bg-lake-600 text-white" : "bg-white text-slate-800"}`} aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></Link>
              </div>
            </div>
            <div className="flex items-end">
              <button className="min-h-12 rounded-lg bg-forest-900 px-4 text-sm font-black text-white" type="submit">Update</button>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
            {selectedGroup.periods.map((period) => {
              const periodRows = rows.filter((row) => row.offering.period === period);
              const periodNumber = PERIOD_LABEL[period].replace(/[AB]/, "");
              // For twilight (P5A/P5B) the heading reads simply "Twilight" —
              // no trailing "A Day"/"B Day" since twilight isn't structured
              // into the regular A/B rotation in camper-facing rhythm.
              // Every other period shows its plain code (e.g. "4A") instead
              // of a spelled-out ordinal ("Fourth A").
              const heading = periodNumber === TWILIGHT_PERIOD_NUMBER ? "Twilight" : PERIOD_LABEL[period];
              return (
                <div key={period} className="border-b border-slate-200 last:border-b-0">
                  <div className="flex items-center justify-between bg-forest-50/60 px-5 py-3">
                    <h2 className="text-lg font-black uppercase text-slate-950">{heading}</h2>
                    <span className="flex items-center gap-3"><Badge tone="green">{periodRows.length} offerings</Badge><ChevronUp className="h-4 w-4" /></span>
                  </div>
                  {view === "list" && periodRows.length ? <div className="hidden grid-cols-[1.8fr_0.7fr_0.7fr_0.5fr_1.1fr_0.8fr_32px] border-y border-slate-100 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500 lg:grid">
                    <span>Activity</span><span>Campers<br />(Limit)</span><span>Staff<br />(Target)</span><span>Missing</span><span>Assigned Staff</span><span>Status</span><span />
                  </div> : null}
                  {periodRows.length ? (
                    view === "grid" ? (
                      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                        {periodRows.map((row) => <AreaOfferingCard key={row.offering.id} row={row} mode="grid" />)}
                      </div>
                    ) : (
                      periodRows.map((row) => <AreaOfferingCard key={row.offering.id} row={row} mode="list" />)
                    )
                  ) : (
                    <p className="p-5 text-sm font-semibold text-slate-500">No offerings currently scheduled for this period.</p>
                  )}
                </div>
              );
            })}
          </section>
        </main>

        <aside className="grid content-start gap-5">
          <PanelBox title="Staffing Summary">
            <div className="flex items-center gap-5">
              <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#16a34a 0 ${counts.complete * 20}%, #f97316 0 ${(counts.complete + counts.needsStaff) * 20}%, #075fca 0 ${(counts.complete + counts.needsStaff + counts.overstaffed) * 20}%, #e11d48 0 ${(counts.complete + counts.needsStaff + counts.overstaffed + counts.overCapacity) * 20}%, #7c3aed 0 100%)` }}>
                <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner"><span className="text-3xl font-black">{offerings.length}</span><span className="-mt-5 text-xs font-bold text-slate-500">Total<br />Offerings</span></div>
              </div>
              <div className="grid gap-2 text-sm">
                <Legend color="bg-green-600" label="Complete" value={counts.complete} />
                <Legend color="bg-orange-500" label="Needs Staff" value={counts.needsStaff} />
                <Legend color="bg-lake-600" label="Overstaffed" value={counts.overstaffed} />
                <Legend color="bg-red-600" label="Over Capacity" value={counts.overCapacity} />
                <Legend color="bg-purple-600" label="Under Capacity" value={counts.underCapacity} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniStat label="Total Campers" value={totalCampers} />
              <MiniStat label="Roster Capacity" value={rosterCapacity} />
              <MiniStat label="Total Staff Assigned" value={totalStaff} />
              <MiniStat label="Total Staff Target" value={totalTarget} />
            </div>
            <MiniStat className="mt-3" label="Missing Staff" value={missingStaff} danger />
          </PanelBox>

          <PanelBox title="Quick Actions">
            <div className="grid gap-3">
              <Link href="/reports/area-block-plan" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-lake-600 bg-white px-4 text-sm font-black text-lake-700"><Printer className="h-4 w-4" />Open Area Block Plan Monitor</Link>
              <Link href="/reports/staff-schedule" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><CalendarDays className="h-4 w-4" />View Full Staff Schedule</Link>
            </div>
          </PanelBox>

          <PanelBox title="Area Notes">
            <p className="text-sm font-medium leading-6 text-slate-600">Motorboat maintenance 5B.<br />Ski boat out 2A-3A on Friday.</p>
            <button className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-black text-lake-700"><Edit3 className="h-4 w-4" />Edit Notes</button>
          </PanelBox>
        </aside>
      </div>
    </AppShell>
  );
}

function ProgressStat({ value, percent, tone }: { value: string; percent: number; tone: "blue" | "green" | "orange" | "red" }) {
  const colors = { blue: "bg-lake-600", green: "bg-green-600", orange: "bg-orange-500", red: "bg-red-600" };
  return (
    <div>
      <p className="font-black">{value}</p>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

type AreaOfferingRow = {
  offering: {
    id: string;
    rosterLimit: number | null;
    staffTarget: number;
    activity: { name: string };
    area: { name: string };
    staffAssignments: { id: string; staff: { firstName: string; lastName: string } }[];
  };
  campers: number;
  staff: number;
  status: ReturnType<typeof statusFor>;
};

function AreaOfferingCard({ row, mode }: { row: AreaOfferingRow; mode: ViewMode }) {
  const limit = row.offering.rosterLimit ?? (row.campers || 1);
  const camperPct = Math.min(100, Math.round((row.campers / limit) * 100));
  const staffPct = Math.min(100, Math.round((row.staff / Math.max(row.offering.staffTarget, 1)) * 100));
  const missing = Math.max(row.offering.staffTarget - row.staff, 0);

  if (mode === "grid") {
    return (
      <article className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-start gap-3">
          <ActivityIcon activity={row.offering.activity.name} area={row.offering.area.name} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-black leading-tight">{row.offering.activity.name}</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">All Units • All Levels</p>
          </div>
          <Badge tone={row.status.tone}>{row.status.label}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <ProgressStat value={`${row.campers} / ${row.offering.rosterLimit ?? "∞"}`} percent={camperPct} tone={row.offering.rosterLimit && row.campers > row.offering.rosterLimit ? "red" : "blue"} />
          <ProgressStat value={`${row.staff} / ${row.offering.staffTarget}`} percent={staffPct} tone={row.staff < row.offering.staffTarget ? "orange" : "green"} />
          <div>
            <p className="font-black">Missing</p>
            <p className={`mt-2 text-xl font-black ${missing ? "text-orange-600" : "text-green-700"}`}>{missing}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.offering.staffAssignments.length ? row.offering.staffAssignments.map((assignment) => <span key={assignment.id} className="rounded-md bg-lake-50 px-2 py-1 text-xs font-bold text-lake-800">{assignment.staff.firstName} {assignment.staff.lastName[0]}.</span>) : <span className="text-sm font-bold text-slate-400">No staff assigned</span>}
        </div>
      </article>
    );
  }

  return (
    <article className="grid gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0 lg:grid-cols-[1.8fr_0.7fr_0.7fr_0.5fr_1.1fr_0.8fr_32px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <ActivityIcon activity={row.offering.activity.name} area={row.offering.area.name} />
        <div className="min-w-0">
          <h3 className="truncate font-black">{row.offering.activity.name}</h3>
          <p className="text-sm font-medium text-slate-500">All Units • All Levels</p>
        </div>
      </div>
      <ProgressStat value={`${row.campers} / ${row.offering.rosterLimit ?? "∞"}`} percent={camperPct} tone={row.offering.rosterLimit && row.campers > row.offering.rosterLimit ? "red" : "blue"} />
      <ProgressStat value={`${row.staff} / ${row.offering.staffTarget}`} percent={staffPct} tone={row.staff < row.offering.staffTarget ? "orange" : "green"} />
      <p className={`font-black ${missing ? "text-orange-600" : "text-green-700"}`}>{missing}</p>
      <div className="flex flex-wrap gap-1.5">
        {row.offering.staffAssignments.length ? row.offering.staffAssignments.map((assignment) => <span key={assignment.id} className="rounded-md bg-lake-50 px-2 py-1 text-xs font-bold text-lake-800">{assignment.staff.firstName} {assignment.staff.lastName[0]}.</span>) : <span className="text-sm font-bold text-slate-400">—</span>}
      </div>
      <Badge tone={row.status.tone}>{row.status.label}</Badge>
      <MoreVertical className="h-4 w-4 text-slate-500" />
    </article>
  );
}

function PanelBox({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft"><h2 className="mb-4 text-sm font-black uppercase tracking-wide">{title}</h2>{children}</section>;
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${color}`} />{label}</span><span className="font-black">{value}</span></div>;
}

function MiniStat({ label, value, danger = false, className = "" }: { label: string; value: number; danger?: boolean; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-4 text-center ${className}`}><p className="text-xs font-medium text-slate-600">{label}</p><p className={`mt-2 text-2xl font-black ${danger ? "text-orange-600" : "text-slate-900"}`}>{value}</p></div>;
}
