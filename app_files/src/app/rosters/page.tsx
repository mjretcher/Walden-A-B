import { Period, RegistrationRole, RegistrationStatus, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { CAMPER_PERIODS, PERIOD_LABEL, TWILIGHT_PERIODS } from "@/lib/periods";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rosters" };

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

const A_PERIODS = [Period.P1A, Period.P2A, Period.P3A, Period.P4A] as Period[];
const B_PERIODS = [Period.P1B, Period.P2B, Period.P3B, Period.P4B] as Period[];

type RostersSearchParams = {
  area?: string | string[];
  period?: string | string[];
  offering?: string | string[];
  allergies?: string | string[];
  camperLeaveDates?: string | string[];
  staffLeaveDates?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function readToggle(value: string | string[] | undefined, defaultValue: boolean) {
  const values = asArray(value);
  return values.length ? values.includes("show") : defaultValue;
}

function shortDate(date?: Date | null) {
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : "";
}

const weekBlockRank: Record<WeekBlock, number> = {
  [WeekBlock.WK1_2]: 1, [WeekBlock.WK3_4]: 2, [WeekBlock.WK5_6]: 3, [WeekBlock.WK7]: 4
};

function camperLeaveLabel(camper: { weekEnrollments: { weekBlock: WeekBlock }[] }) {
  const lastWeek = camper.weekEnrollments.reduce<WeekBlock | null>((latest, enrollment) => {
    if (!latest) return enrollment.weekBlock;
    return weekBlockRank[enrollment.weekBlock] > weekBlockRank[latest] ? enrollment.weekBlock : latest;
  }, null);
  return lastWeek ? `Through ${WEEK_BLOCK_LABEL[lastWeek]}` : "";
}

function staffLabel(
  assignment: { staff: { firstName: string; lastName: string; employmentEnd: Date | null } },
  showLeaveDate: boolean
) {
  const name = `${assignment.staff.firstName} ${assignment.staff.lastName}`;
  const leaveDate = showLeaveDate ? shortDate(assignment.staff.employmentEnd) : "";
  return leaveDate ? `${name} (leaves ${leaveDate})` : name;
}

function ChipToggle({ name, value, label, checked, color = "lake" }: {
  name: string; value: string; label: string; checked: boolean; color?: "lake" | "forest";
}) {
  const activeClass = color === "forest"
    ? "peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white"
    : "peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white";
  return (
    <label className="cursor-pointer">
      <input className="peer sr-only" defaultChecked={checked} name={name} type="checkbox" value={value} />
      <span className={`inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition ${activeClass}`}>{label}</span>
    </label>
  );
}

export default async function RostersPage({ searchParams }: { searchParams?: Promise<RostersSearchParams> }) {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};

  const selectedAreaIds = asArray(params.area);
  const selectedPeriods = asArray(params.period).filter((v): v is Period => Object.values(Period).includes(v as Period));
  const selectedOfferingIds = asArray(params.offering);
  const showAllergies = readToggle(params.allergies, true);
  const showCamperLeaveDates = readToggle(params.camperLeaveDates, false);
  const showStaffLeaveDates = readToggle(params.staffLeaveDates, false);

  const [areas, offeringOptions, offerings] = session
    ? await Promise.all([
        prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        // Picker only needs area+activity names — no camper data needed
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
          select: { id: true, period: true, area: { select: { id: true, name: true } }, activity: { select: { id: true, name: true } } },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        }),
        // Main roster query — only load allergy/leave data when the columns are shown
        prisma.activityOffering.findMany({
          where: {
            sessionId: session.id,
            active: true,
            area: { active: true },
            activity: { active: true },
            ...(selectedAreaIds.length ? { areaId: { in: selectedAreaIds } } : {}),
            ...(selectedPeriods.length ? { period: { in: selectedPeriods } } : {}),
            ...(selectedOfferingIds.length ? { id: { in: selectedOfferingIds } } : {})
          },
          include: {
            area: true,
            activity: true,
            staffAssignments: { include: { staff: true } },
            registrations: {
              where: { status: { in: activeRegistration } },
              include: {
                camper: {
                  include: {
                    cabin: true,
                    allergies: showAllergies ? { include: { allergyLabel: true } } : false,
                    weekEnrollments: showCamperLeaveDates ? { orderBy: { weekBlock: "asc" } } : false
                  }
                }
              },
              orderBy: [{ registrationRole: "asc" }, { camper: { cabin: { name: "asc" } } }, { camper: { lastName: "asc" } }]
            }
          },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        })
      ])
    : [[], [], []];

  // Group offerings by area for the individual classes picker
  const offeringsByArea = offeringOptions.reduce<Record<string, { areaName: string; offerings: typeof offeringOptions }>>((acc, o) => {
    if (!acc[o.area.id]) acc[o.area.id] = { areaName: o.area.name, offerings: [] };
    acc[o.area.id].offerings.push(o);
    return acc;
  }, {});

  const allASelected = A_PERIODS.every((p) => selectedPeriods.includes(p));
  const allBSelected = B_PERIODS.every((p) => selectedPeriods.includes(p));
  const activeFilterCount = selectedAreaIds.length + selectedPeriods.length + selectedOfferingIds.length;
  const visibleOfferings = offerings.filter((o) => {
    const camperRegs = o.registrations.filter((r) => r.registrationRole === RegistrationRole.CAMPER);
    const taRegs = o.registrations.filter((r) => r.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
    return !TWILIGHT_PERIODS.includes(o.period) && (camperRegs.length > 0 || taRegs.length > 0);
  });

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
          <PrintButton label="Print rosters" />
        </PageHeader>
      </div>

      {session ? (
        <form className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft" method="get">

          {/* Top bar: print options + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400 mr-1">On rosters</span>
              <label className="cursor-pointer">
                <input name="allergies" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showAllergies} name="allergies" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Allergies</span>
              </label>
              <label className="cursor-pointer">
                <input name="camperLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showCamperLeaveDates} name="camperLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Camper leave info</span>
              </label>
              <label className="cursor-pointer">
                <input name="staffLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showStaffLeaveDates} name="staffLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Staff leave dates</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-xs font-black text-white">{visibleOfferings.length} roster{visibleOfferings.length !== 1 ? "s" : ""}</span>
              )}
              <a className={secondaryButtonClass} href="/rosters">Reset</a>
              <button className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700" type="submit">Apply</button>
            </div>
          </div>

          <div className="p-5 space-y-6">

            {/* Areas */}
            <div>
              <p className="mb-2 text-sm font-black text-slate-700">Areas</p>
              <div className="flex flex-wrap gap-2">
                {areas.map((area) => (
                  <ChipToggle key={area.id} name="area" value={area.id} label={area.name} checked={selectedAreaIds.includes(area.id)} />
                ))}
              </div>
            </div>

            {/* Periods — with day shortcuts */}
            <div>
              <div className="mb-2 flex items-center gap-3">
                <p className="text-sm font-black text-slate-700">Periods</p>
                <span className="text-xs text-slate-400">— or pick a whole day:</span>
                {/* A-day shortcut: submits all 4 A periods */}
                <a
                  href={`/rosters?${new URLSearchParams([
                    ...A_PERIODS.map((p) => ["period", p] as [string, string]),
                    ...(selectedAreaIds.map((id) => ["area", id] as [string, string])),
                    ...(selectedOfferingIds.map((id) => ["offering", id] as [string, string])),
                    ["allergies", showAllergies ? "show" : "hide"],
                    ["camperLeaveDates", showCamperLeaveDates ? "show" : "hide"],
                    ["staffLeaveDates", showStaffLeaveDates ? "show" : "hide"],
                  ]).toString()}`}
                  className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-black transition ${allASelected ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  All A-day
                </a>
                <a
                  href={`/rosters?${new URLSearchParams([
                    ...B_PERIODS.map((p) => ["period", p] as [string, string]),
                    ...(selectedAreaIds.map((id) => ["area", id] as [string, string])),
                    ...(selectedOfferingIds.map((id) => ["offering", id] as [string, string])),
                    ["allergies", showAllergies ? "show" : "hide"],
                    ["camperLeaveDates", showCamperLeaveDates ? "show" : "hide"],
                    ["staffLeaveDates", showStaffLeaveDates ? "show" : "hide"],
                  ]).toString()}`}
                  className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-black transition ${allBSelected ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  All B-day
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAMPER_PERIODS.map((period) => (
                  <ChipToggle key={period} name="period" value={period} label={PERIOD_LABEL[period]} checked={selectedPeriods.includes(period)} />
                ))}
              </div>
            </div>

            {/* Individual classes — grouped by area */}
            {Object.keys(offeringsByArea).length > 0 && (
              <div>
                <p className="mb-3 text-sm font-black text-slate-700">Individual classes <span className="text-xs font-normal text-slate-400">— use these to pick specific classes within an area/period</span></p>
                <div className="space-y-3">
                  {Object.entries(offeringsByArea).map(([areaId, { areaName, offerings: areaOfferings }]) => {
                    // Group by period within each area
                    const byPeriod = areaOfferings.reduce<Record<string, typeof areaOfferings>>((acc, o) => {
                      const label = PERIOD_LABEL[o.period];
                      if (!acc[label]) acc[label] = [];
                      acc[label].push(o);
                      return acc;
                    }, {});
                    return (
                      <details key={areaId} className="rounded-lg border border-slate-200">
                        <summary className="cursor-pointer px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                          {areaName}
                          {selectedOfferingIds.some((id) => areaOfferings.some((o) => o.id === id)) && (
                            <span className="ml-2 rounded-full bg-forest-700 px-2 py-0.5 text-xs font-black text-white">
                              {areaOfferings.filter((o) => selectedOfferingIds.includes(o.id)).length} selected
                            </span>
                          )}
                        </summary>
                        <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50">
                          {Object.entries(byPeriod).map(([periodLabel, periodOfferings]) => (
                            <div key={periodLabel} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-6 shrink-0 text-xs font-black text-slate-400">{periodLabel}</span>
                              {periodOfferings.map((o) => (
                                <ChipToggle
                                  key={o.id}
                                  name="offering"
                                  value={o.id}
                                  label={o.activity.name}
                                  checked={selectedOfferingIds.includes(o.id)}
                                  color="forest"
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </form>
      ) : null}

      {!session && (
        <div className="no-print rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session selected — roster sheets are not available yet.
        </div>
      )}

      {session && !visibleOfferings.length && (
        <div className="no-print rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
          No rosters match your current filters.{activeFilterCount > 0 ? " Try resetting." : ""}
        </div>
      )}

      <div className="grid gap-6">
        {offerings.map((offering) => {
          const camperRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.CAMPER);
          const assistantRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
          const isTwilight = TWILIGHT_PERIODS.includes(offering.period);
          const isStaffOnly = camperRegistrations.length === 0 && assistantRegistrations.length === 0;
          if (isTwilight || isStaffOnly) return null;

          const rosterColumnCount = 11 + (showAllergies ? 1 : 0) + (showCamperLeaveDates ? 1 : 0);
          const rosterRowCount = Math.max(camperRegistrations.length, offering.rosterLimit ?? 12) + 5;
          const taOverhead = assistantRegistrations.length > 0 ? 1 + assistantRegistrations.length : 0;
          const totalBodyRows = rosterRowCount + taOverhead;
          const rosterSizeClass = totalBodyRows <= 16 ? "roster-size-lg" : totalBodyRows <= 24 ? "roster-size-md" : "roster-size-sm";

          return (
            <article key={offering.id} className={`roster-print-card print-card ${rosterSizeClass} rounded-lg border border-white bg-white p-5 shadow-soft`}>
              <div className="roster-card-header grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="lg" className="roster-card-icon" />
                  <div className="min-w-0">
                    <p className="roster-card-eyebrow text-sm font-semibold uppercase tracking-wide text-lake-700">{offering.area.name} roster sheet</p>
                    <h2 className="text-2xl font-bold text-forest-900">{offering.activity.name}</h2>
                    <p className="text-sm text-slate-500">{session?.name} - Period {PERIOD_LABEL[offering.period]}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">Staff: <span className="font-black">{offering.staffAssignments.map((a) => staffLabel(a, showStaffLeaveDates)).join(", ") || "Unassigned"}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <CapacityPill count={camperRegistrations.length} limit={offering.rosterLimit} limitType={offering.limitType} />
                  <p className="no-print mt-2 text-sm text-slate-500">Page 1</p>
                </div>
              </div>

              <table className="mt-4 w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-forest-900 text-white">
                    <th className="w-8 border border-forest-900 p-2">#</th>
                    <th className="border border-forest-900 p-2 text-left">Name</th>
                    <th className="w-16 border border-forest-900 p-2 text-left">Cabin</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-8 border border-forest-900 p-2">{day}</th>)}
                    {showCamperLeaveDates ? <th className="w-20 border border-forest-900 p-2 text-left">Leave</th> : null}
                    {showAllergies ? <th className="w-28 border border-forest-900 p-2 text-left">Allergies / notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rosterRowCount }).map((_, index) => {
                    const registration = camperRegistrations[index];
                    return (
                      <tr key={registration?.id ?? `blank-${index}`}>
                        <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                        <td className="border border-slate-300 p-2">{registration ? `${registration.camper.firstName} ${registration.camper.lastName}` : ""}</td>
                        <td className="border border-slate-300 p-2">{registration?.camper.cabin?.name ?? ""}</td>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                        {showCamperLeaveDates ? <td className="border border-slate-300 p-2">{registration ? camperLeaveLabel(registration.camper) : "\u00a0"}</td> : null}
                        {showAllergies ? <td className="border border-slate-300 p-2 align-top text-xs leading-snug">{registration?.camper.allergies?.map((a) => a.allergyLabel.name).join(", ") || "\u00a0"}</td> : null}
                      </tr>
                    );
                  })}
                  {assistantRegistrations.length ? (
                    <tr><td className="border border-slate-300 bg-lake-50 p-2 text-center font-black" colSpan={rosterColumnCount}>Teaching Assistants</td></tr>
                  ) : null}
                  {assistantRegistrations.map((registration, index) => (
                    <tr key={registration.id}>
                      <td className="border border-slate-300 p-2 text-center">TA {index + 1}</td>
                      <td className="border border-slate-300 p-2 font-black">{registration.camper.firstName} {registration.camper.lastName}</td>
                      <td className="border border-slate-300 p-2">{registration.camper.cabin?.name ?? ""}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      {showCamperLeaveDates ? <td className="border border-slate-300 p-2">{camperLeaveLabel(registration.camper) || "\u00a0"}</td> : null}
                      {showAllergies ? <td className="border border-slate-300 p-2 align-top text-xs leading-snug">Teaching assistant{registration.camper.allergies?.length ? `; ${registration.camper.allergies.map((a) => a.allergyLabel.name).join(", ")}` : ""}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
