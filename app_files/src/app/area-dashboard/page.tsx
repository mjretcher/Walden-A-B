import { Period, RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const dayGroups = {
  A: { label: "A Day", periods: [Period.P1A, Period.P2A, Period.P3A, Period.P4A] },
  B: { label: "B Day", periods: [Period.P1B, Period.P2B, Period.P3B, Period.P4B] }
};

type DayKey = keyof typeof dayGroups;

type AreaDashboardSearchParams = {
  area?: string;
  day?: string;
};

function selectedDay(value?: string): DayKey {
  return value === "A" ? "A" : "B";
}

export default async function AreaDashboardPage({ searchParams }: { searchParams?: Promise<AreaDashboardSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = await searchParams;
  const areas = await prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const selectedAreaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : params?.area ?? areas[0]?.id;
  const day = selectedDay(params?.day);
  const selectedGroup = dayGroups[day];
  const canFilterArea = user.role === UserRole.EXECUTIVE_ADMIN;

  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, areaId: selectedAreaId, active: true, area: { active: true }, activity: { active: true }, period: { in: selectedGroup.periods } },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: true } },
          _count: { select: { registrations: { where: { status: { in: activeRegistration } } } } }
        },
        orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
      })
    : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Area Head Dashboard" eyebrow={`${selectedGroup.label} menu schedule by period`} />

      <form className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-soft" method="get">
        <div className="flex gap-2">
          <a className={day === "A" ? "inline-flex min-h-11 items-center justify-center rounded-md border-2 border-slate-950 bg-white px-4 py-2 text-sm font-extrabold text-slate-950" : secondaryButtonClass} href={`/area-dashboard?day=A${canFilterArea && selectedAreaId ? `&area=${selectedAreaId}` : ""}`}>A Day</a>
          <a className={day === "B" ? "inline-flex min-h-11 items-center justify-center rounded-md border-2 border-slate-950 bg-white px-4 py-2 text-sm font-extrabold text-slate-950" : secondaryButtonClass} href={`/area-dashboard?day=B${canFilterArea && selectedAreaId ? `&area=${selectedAreaId}` : ""}`}>B Day</a>
        </div>

        <input type="hidden" name="day" value={day} />

        {canFilterArea ? (
          <>
            <label className="text-sm font-semibold text-slate-900">
              Area
              <select className="mt-1 min-h-11 rounded-md border border-slate-300 bg-white px-3" name="area" defaultValue={selectedAreaId}>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>

            <button className="rounded-md bg-slate-950 px-4 py-2 font-semibold text-white">Filter</button>
          </>
        ) : null}
      </form>

      {!session ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so the area dashboard cannot show current class offerings yet.
        </div>
      ) : null}

      <section className="rounded-xl border-2 border-slate-900 bg-white p-4 shadow-soft">
        <div className="border-b-2 border-slate-900 pb-3">
          <h2 className="text-2xl font-extrabold text-slate-950">{selectedGroup.label}</h2>
          <p className="text-sm font-medium text-slate-600">Classes offered by period for the selected area.</p>
        </div>

        <div className="mt-4 grid gap-4">
          {selectedGroup.periods.map((period) => {
            const periodOfferings = offerings.filter((offering) => offering.period === period);

            return (
              <section key={period} className="grid gap-3 rounded-lg border border-slate-300 bg-white p-3 md:grid-cols-[4.5rem_1fr]">
                <div className="flex items-center justify-center rounded-md border-2 border-slate-900 bg-white px-3 py-4 text-center">
                  <div>
                    <p className="text-3xl font-black leading-none text-slate-950">{PERIOD_LABEL[period]}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Period</p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {periodOfferings.length ? periodOfferings.map((offering) => {
                    const camperCount = offering._count.registrations;
                    const staffCount = offering.staffAssignments.length;
                    const missing = Math.max(offering.staffTarget - staffCount, 0);
                    const overCapacity = Boolean(offering.rosterLimit && camperCount > offering.rosterLimit);
                    const status = overCapacity ? "Over capacity" : missing ? "Needs staff" : staffCount > offering.staffTarget ? "Overstaffed" : "Complete";

                    return (
                      <article key={offering.id} className="rounded-md border border-slate-300 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-extrabold leading-tight text-slate-950">{offering.activity.name}</h3>
                            <p className="mt-1 text-sm font-medium text-slate-700">{offering.area.name}</p>
                          </div>
                          <Badge tone={status === "Complete" ? "green" : overCapacity ? "red" : "amber"}>{status}</Badge>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                          <div className="rounded-md border border-slate-300 bg-white p-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Campers</p>
                            <div className="mt-1"><CapacityPill count={camperCount} limit={offering.rosterLimit} limitType={offering.limitType} /></div>
                          </div>
                          <div className="rounded-md border border-slate-300 bg-white p-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Staff</p>
                            <p className="mt-1 font-extrabold text-slate-950">{staffCount} / {offering.staffTarget}</p>
                          </div>
                          <div className="rounded-md border border-slate-300 bg-white p-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Missing</p>
                            <p className="mt-1 font-extrabold text-slate-950">{missing}</p>
                          </div>
                        </div>

                        <p className="mt-3 text-sm text-slate-700"><span className="font-bold text-slate-950">Assigned:</span> {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ") || "None yet"}</p>
                      </article>
                    );
                  }) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm font-medium text-slate-500">
                      No classes currently offered this period.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
