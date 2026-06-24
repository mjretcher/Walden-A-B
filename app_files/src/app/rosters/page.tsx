import { Period, RegistrationRole, RegistrationStatus, Unit, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS, UNIT_LABEL } from "@/lib/periods";

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
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
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

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
          <PrintButton label="Print rosters" />
        </PageHeader>
      </div>

      {session ? (
        <form className="no-print mb-5 grid gap-4 rounded-lg border border-white bg-white p-4 shadow-soft lg:grid-cols-3" method="get">
          <fieldset className="lg:col-span-3">
            <legend className="mb-2 text-sm font-semibold text-forest-900">Roster print details</legend>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input name="allergies" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showAllergies} name="allergies" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">Show allergies</span>
              </label>
              <label className="cursor-pointer">
                <input name="camperLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showCamperLeaveDates} name="camperLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">Show camper leave info</span>
              </label>
              <label className="cursor-pointer">
                <input name="staffLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showStaffLeaveDates} name="staffLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">Show staff leave dates</span>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Areas to print</legend>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
              {areas.map((area) => (
                <label key={area.id} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedAreaIds.includes(area.id)} name="area" type="checkbox" value={area.id} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{area.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Periods to print</legend>
            <div className="flex flex-wrap gap-2">
              {STAFF_PERIODS.map((period) => (
                <label key={period} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedPeriods.includes(period)} name="period" type="checkbox" value={period} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{PERIOD_LABEL[period]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Individual classes</legend>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-auto">
              {offeringOptions.map((offering) => (
                <label key={offering.id} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedOfferingIds.includes(offering.id)} name="offering" type="checkbox" value={offering.id} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">
                    {PERIOD_LABEL[offering.period]} {offering.area.name} - {offering.activity.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Saved registration groups</legend>
            <div className="flex flex-wrap gap-2">
              {filterGroups.map((group) => (
                <label key={group.id} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedGroupIds.includes(group.id)} name="group" type="checkbox" value={group.id} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{group.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Week blocks</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.values(WeekBlock) as WeekBlock[]).map((weekBlock) => (
                <label key={weekBlock} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={weekBlocks.includes(weekBlock)} name="weekBlock" type="checkbox" value={weekBlock} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{WEEK_BLOCK_LABEL[weekBlock]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Session designations</legend>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
              {designationRows.map((row) => (
                <label key={row.label} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={designations.includes(row.label)} name="designation" type="checkbox" value={row.label} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{row.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-forest-900">Units for cabin packet</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.values(Unit) as Unit[]).map((unit) => (
                <label key={unit} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedUnits.includes(unit)} name="unit" type="checkbox" value={unit} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{UNIT_LABEL[unit]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="lg:col-span-2">
            <legend className="mb-2 text-sm font-semibold text-forest-900">Cabins for cabin packet</legend>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
              <label className="cursor-pointer">
                <input className="peer sr-only" defaultChecked={selectedCabins.includes(noCabinValue)} name="cabin" type="checkbox" value={noCabinValue} />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">No cabin</span>
              </label>
              {cabins.map((cabin) => (
                <label key={cabin.id} className="cursor-pointer">
                  <input className="peer sr-only" defaultChecked={selectedCabins.includes(cabin.id)} name="cabin" type="checkbox" value={cabin.id} />
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{cabin.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2 lg:col-span-3">
            <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Apply roster print filters</button>
            <a className={secondaryButtonClass} href="/rosters">Reset</a>
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
          No active offerings are available for roster sheets yet.
        </div>
      ) : null}

      <div className="grid gap-6">
        {offerings.map((offering) => {
          const camperRegistrations = offering.registrations.filter((registration) => registration.registrationRole === RegistrationRole.CAMPER);
          const assistantRegistrations = offering.registrations.filter((registration) => registration.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
          const isStaffOnly = camperRegistrations.length === 0 && assistantRegistrations.length === 0;
          const isTwilight = TWILIGHT_PERIODS.includes(offering.period);
          // Mike's rule: this page is the CAMPER ROSTER management surface.
          // - Twilight (P5A/P5B) offerings never have campers (camper schedule
          //   is 8 slots, no twilight) — skip entirely. Staff who run twilight
          //   are visible on the Area Dashboard.
          // - Staff-only rosters (no campers, no TAs) aren't real rosters —
          //   skip entirely so they don't clutter screen or print output.
          if (isTwilight || isStaffOnly) return null;
          const rosterColumnCount = 11 + (showAllergies ? 1 : 0) + (showCamperLeaveDates ? 1 : 0);
          const rosterRowCount = Math.max(camperRegistrations.length, offering.rosterLimit ?? 12) + 5;
          return (
          <article key={offering.id} className="roster-print-card print-card rounded-lg border border-white bg-white p-5 shadow-soft">
            <div className="roster-card-header grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div className="flex min-w-0 items-start gap-3">
                <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="lg" className="roster-card-icon" />
                <div className="min-w-0">
                  <p className="roster-card-eyebrow text-sm font-semibold uppercase tracking-wide text-lake-700">{offering.area.name} roster sheet</p>
                  <h2 className="text-2xl font-bold text-forest-900">{offering.activity.name}</h2>
                  <p className="text-sm text-slate-500">{session?.name} - Period {PERIOD_LABEL[offering.period]}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">Staff: <span className="font-black">{offering.staffAssignments.map((assignment) => staffLabel(assignment, showStaffLeaveDates)).join(", ") || "Unassigned"}</span></p>
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
                      {showAllergies ? <td className="border border-slate-300 p-2">{registration?.camper.allergies.map((allergy) => allergy.allergyLabel.name).join(", ") || "\u00a0"}</td> : null}
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
                    {showAllergies ? <td className="border border-slate-300 p-2">Teaching assistant{registration.camper.allergies.length ? `; ${registration.camper.allergies.map((allergy) => allergy.allergyLabel.name).join(", ")}` : ""}</td> : null}
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
