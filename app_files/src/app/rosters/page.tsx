import { Gender, Period, RegistrationRole, RegistrationStatus, Unit, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS, UNIT_LABEL } from "@/lib/periods";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rosters" };

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const noCabinValue = "__NO_CABIN__";

type RostersSearchParams = {
  group?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
  cabin?: string | string[];
  unit?: string | string[];
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
  [WeekBlock.WK1_2]: 1,
  [WeekBlock.WK3_4]: 2,
  [WeekBlock.WK5_6]: 3,
  [WeekBlock.WK7]: 4
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

function genderLabel(gender: Gender): string {
  if (gender === Gender.FEMALE) return "Girls";
  if (gender === Gender.MALE) return "Boys";
  return "Other";
}

function ChipToggle({ name, value, label, checked, color = "lake" }: { name: string; value: string; label: string; checked: boolean; color?: "lake" | "forest" }) {
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
  const selectedCabins = asArray(params.cabin);
  const selectedUnits = asArray(params.unit).filter((value): value is Unit => Object.values(Unit).includes(value as Unit));
  const selectedAreaIds = asArray(params.area);
  const selectedPeriods = asArray(params.period).filter((value): value is Period => Object.values(Period).includes(value as Period));
  const selectedOfferingIds = asArray(params.offering);
  const showAllergies = readToggle(params.allergies, true);
  const showCamperLeaveDates = readToggle(params.camperLeaveDates, false);
  const showStaffLeaveDates = readToggle(params.staffLeaveDates, false);

  const [filterGroups, designationRows, cabins, areas, offeringOptions] = session
    ? await Promise.all([
        prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } }),
        prisma.camperSessionDesignation.findMany({
          where: { camper: { sessionId: session.id, active: true } },
          distinct: ["label"],
          orderBy: { label: "asc" }
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { gender: "asc" }, { name: "asc" }] }),
        prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true, visibleOnMenu: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } },
          include: { area: true, activity: true },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        })
      ])
    : [[], [], [], [], []];

  const { selectedGroupIds, weekBlocks, designations } = resolveCamperPoolFilters(params, filterGroups);
  const poolWhere = camperPoolWhere({ weekBlocks, designations });

  const cabinFilters = [];
  const realCabinIds = selectedCabins.filter((id) => id !== noCabinValue);
  if (realCabinIds.length) cabinFilters.push({ cabinId: { in: realCabinIds } });
  if (selectedCabins.includes(noCabinValue)) cabinFilters.push({ cabinId: null });

  const camperAndFilters = [];
  if (poolWhere.OR) camperAndFilters.push(poolWhere);
  if (selectedUnits.length) camperAndFilters.push({ unit: { in: selectedUnits } });
  if (cabinFilters.length) camperAndFilters.push({ OR: cabinFilters });
  const camperRosterWhere = camperAndFilters.length ? { AND: camperAndFilters } : {};

  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: {
          sessionId: session.id,
          active: true,
          visibleOnMenu: true,
          visibleForCamperRegistration: true,
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
            where: { status: { in: activeRegistration }, camper: camperRosterWhere },
            include: {
              camper: {
                include: {
                  cabin: true,
                  allergies: { include: { allergyLabel: true } },
                  weekEnrollments: { orderBy: { weekBlock: "asc" } }
                }
              }
            },
            orderBy: [{ registrationRole: "asc" }, { camper: { cabin: { name: "asc" } } }, { camper: { lastName: "asc" } }]
          }
        },
        orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
      })
    : [];

  // Group cabins by unit then gender for the cabin packet section
  const cabinsByUnitGender = cabins.reduce<Record<string, Record<string, typeof cabins>>>((acc, cabin) => {
    const unitKey = cabin.unit;
    const genderKey = cabin.gender;
    if (!acc[unitKey]) acc[unitKey] = {};
    if (!acc[unitKey][genderKey]) acc[unitKey][genderKey] = [];
    acc[unitKey][genderKey].push(cabin);
    return acc;
  }, {});

  // Count active filters for badge
  const activeFilterCount = selectedAreaIds.length + selectedPeriods.length + selectedOfferingIds.length +
    selectedGroupIds.length + weekBlocks.length + designations.length +
    selectedUnits.length + selectedCabins.length;

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
          <PrintButton label="Print rosters" />
        </PageHeader>
      </div>

      {session ? (
        <form className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft" method="get">

          {/* ── Always-visible top bar ── */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-black text-forest-900">Print options</span>
              <label className="cursor-pointer">
                <input name="allergies" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showAllergies} name="allergies" type="checkbox" value="show" />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">
                  Allergies
                </span>
              </label>
              <label className="cursor-pointer">
                <input name="camperLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showCamperLeaveDates} name="camperLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">
                  Camper leave info
                </span>
              </label>
              <label className="cursor-pointer">
                <input name="staffLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showStaffLeaveDates} name="staffLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">
                  Staff leave dates
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-xs font-black text-white">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</span>
              )}
              <a className={secondaryButtonClass} href="/rosters">Reset all</a>
              <button className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700" type="submit">Apply filters</button>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">

            {/* ── Left column: Which rosters to show ── */}
            <div className="p-5">
              <p className="mb-4 text-xs font-black uppercase tracking-wide text-slate-400">Which rosters to show</p>

              <div className="space-y-5">
                {/* Areas */}
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Areas</p>
                  <div className="flex flex-wrap gap-2">
                    {areas.map((area) => (
                      <ChipToggle key={area.id} name="area" value={area.id} label={area.name} checked={selectedAreaIds.includes(area.id)} />
                    ))}
                    {!areas.length && <p className="text-sm text-slate-400">No active areas</p>}
                  </div>
                </div>

                {/* Periods */}
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Periods</p>
                  <div className="flex flex-wrap gap-2">
                    {STAFF_PERIODS.map((period) => (
                      <ChipToggle key={period} name="period" value={period} label={PERIOD_LABEL[period]} checked={selectedPeriods.includes(period)} />
                    ))}
                  </div>
                </div>

                {/* Individual classes */}
                {offeringOptions.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-black text-slate-700">Individual classes</p>
                    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                      {offeringOptions.map((offering) => (
                        <ChipToggle
                          key={offering.id}
                          name="offering"
                          value={offering.id}
                          label={`${PERIOD_LABEL[offering.period]} ${offering.area.name} — ${offering.activity.name}`}
                          checked={selectedOfferingIds.includes(offering.id)}
                          color="forest"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column: Which campers to include ── */}
            <div className="p-5">
              <p className="mb-4 text-xs font-black uppercase tracking-wide text-slate-400">Which campers to include</p>

              <div className="space-y-5">
                {/* Saved groups */}
                {filterGroups.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-black text-slate-700">Saved registration groups</p>
                    <div className="flex flex-wrap gap-2">
                      {filterGroups.map((group) => (
                        <ChipToggle key={group.id} name="group" value={group.id} label={group.name} checked={selectedGroupIds.includes(group.id)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Week blocks */}
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Week blocks</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.values(WeekBlock) as WeekBlock[]).map((wb) => (
                      <ChipToggle key={wb} name="weekBlock" value={wb} label={WEEK_BLOCK_LABEL[wb]} checked={weekBlocks.includes(wb)} color="forest" />
                    ))}
                  </div>
                </div>

                {/* Session designations */}
                {designationRows.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-black text-slate-700">Session designations</p>
                    <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                      {designationRows.map((row) => (
                        <ChipToggle key={row.label} name="designation" value={row.label} label={row.label} checked={designations.includes(row.label)} color="forest" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Cabin packet — Units then grouped cabins */}
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Cabin packet</p>
                  <p className="mb-3 text-xs text-slate-500">Filter rosters to show only campers from selected cabins or units.</p>

                  {/* Units quick-select */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {(Object.values(Unit) as Unit[]).map((unit) => (
                      <ChipToggle key={unit} name="unit" value={unit} label={UNIT_LABEL[unit]} checked={selectedUnits.includes(unit)} />
                    ))}
                  </div>

                  {/* Cabins grouped by unit + gender */}
                  <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <label className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={selectedCabins.includes(noCabinValue)} name="cabin" type="checkbox" value={noCabinValue} />
                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">No cabin</span>
                    </label>

                    {(Object.values(Unit) as Unit[]).map((unit) => {
                      const genderGroups = cabinsByUnitGender[unit];
                      if (!genderGroups) return null;
                      return (
                        <div key={unit}>
                          <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{UNIT_LABEL[unit]}</p>
                          <div className="space-y-1.5">
                            {Object.entries(genderGroups)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([gender, groupCabins]) => (
                                <div key={gender} className="flex flex-wrap items-center gap-1.5">
                                  <span className="w-10 shrink-0 text-xs font-semibold text-slate-400">{genderLabel(gender as Gender)}</span>
                                  {groupCabins.map((cabin) => (
                                    <label key={cabin.id} className="cursor-pointer">
                                      <input className="peer sr-only" defaultChecked={selectedCabins.includes(cabin.id)} name="cabin" type="checkbox" value={cabin.id} />
                                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{cabin.name}</span>
                                    </label>
                                  ))}
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom action bar ── */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <a className={secondaryButtonClass} href="/rosters">Reset all</a>
            <button className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700" type="submit">Apply filters</button>
          </div>
        </form>
      ) : null}

      {!session ? (
        <div className="no-print rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so roster sheets are not available yet.
        </div>
      ) : null}

      {session && !offerings.length ? (
        <div className="no-print rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
          No active offerings match your current filters.{activeFilterCount > 0 ? " Try resetting some filters." : " No active offerings are available yet."}
        </div>
      ) : null}

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
          const rosterSizeClass =
            totalBodyRows <= 16 ? "roster-size-lg" : totalBodyRows <= 24 ? "roster-size-md" : "roster-size-sm";

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

              <table className="mt-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-forest-900 text-white">
                    <th className="w-10 border border-forest-900 p-2">#</th>
                    <th className="border border-forest-900 p-2 text-left">Name</th>
                    <th className="border border-forest-900 p-2 text-left">Cabin</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-10 border border-forest-900 p-2">{day}</th>)}
                    {showCamperLeaveDates ? <th className="border border-forest-900 p-2 text-left">Camper leave</th> : null}
                    {showAllergies ? <th className="border border-forest-900 p-2 text-left">Allergies</th> : null}
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
                        {showAllergies ? <td className="border border-slate-300 p-2">{registration?.camper.allergies.map((a) => a.allergyLabel.name).join(", ") || "\u00a0"}</td> : null}
                      </tr>
                    );
                  })}
                  {assistantRegistrations.length ? (
                    <tr>
                      <td className="border border-slate-300 bg-lake-50 p-2 text-center font-black" colSpan={rosterColumnCount}>Teaching Assistants</td>
                    </tr>
                  ) : null}
                  {assistantRegistrations.map((registration, index) => (
                    <tr key={registration.id}>
                      <td className="border border-slate-300 p-2 text-center">TA {index + 1}</td>
                      <td className="border border-slate-300 p-2 font-black">{registration.camper.firstName} {registration.camper.lastName}</td>
                      <td className="border border-slate-300 p-2">{registration.camper.cabin?.name ?? ""}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      {showCamperLeaveDates ? <td className="border border-slate-300 p-2">{camperLeaveLabel(registration.camper) || "\u00a0"}</td> : null}
                      {showAllergies ? <td className="border border-slate-300 p-2">Teaching assistant{registration.camper.allergies.length ? `; ${registration.camper.allergies.map((a) => a.allergyLabel.name).join(", ")}` : ""}</td> : null}
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
