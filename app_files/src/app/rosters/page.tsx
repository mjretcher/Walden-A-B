import { RegistrationRole, RegistrationStatus, Unit, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const noCabinValue = "__NO_CABIN__";

type RostersSearchParams = {
  group?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
  cabin?: string | string[];
  unit?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function RostersPage({ searchParams }: { searchParams?: Promise<RostersSearchParams> }) {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};
  const selectedCabins = asArray(params.cabin);
  const selectedUnits = asArray(params.unit).filter((value): value is Unit => Object.values(Unit).includes(value as Unit));
  const [filterGroups, designationRows, cabins] = session
    ? await Promise.all([
        prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } }),
        prisma.camperSessionDesignation.findMany({
          where: { camper: { sessionId: session.id, active: true } },
          distinct: ["label"],
          orderBy: { label: "asc" }
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] })
      ])
    : [[], [], []];
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
        where: { sessionId: session.id, active: true, visibleOnMenu: true, visibleForCamperRegistration: true },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: true } },
          registrations: {
            where: { status: { in: activeRegistration }, camper: camperRosterWhere },
            include: { camper: { include: { cabin: true, allergies: { include: { allergyLabel: true } } } } },
            orderBy: [{ registrationRole: "asc" }, { camper: { cabin: { name: "asc" } } }, { camper: { lastName: "asc" } }]
          }
        },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
        <PrintButton label="Print rosters" />
      </PageHeader>

      {session ? (
        <form className="no-print mb-5 grid gap-4 rounded-lg border border-white bg-white p-4 shadow-soft lg:grid-cols-3" method="get">
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
            <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Apply roster pool</button>
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
          const isStaffOnly = offering.staffAssignments.length > 0 && camperRegistrations.length === 0 && assistantRegistrations.length === 0;
          const rosterRowCount = isStaffOnly ? 0 : Math.max(camperRegistrations.length, offering.rosterLimit ?? 12);
          return (
          <article key={offering.id} className="print-card rounded-lg border border-white bg-white p-5 shadow-soft">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div className="flex min-w-0 items-start gap-3">
                <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">{offering.area.name} roster sheet</p>
                  <h2 className="text-2xl font-bold text-forest-900">{offering.activity.name}</h2>
                  <p className="text-sm text-slate-500">{session?.name} - Period {PERIOD_LABEL[offering.period]}</p>
                  <p className="mt-1 text-sm text-slate-600">Staff: {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ") || "Unassigned"}</p>
                </div>
              </div>
              <div className="text-right">
                <CapacityPill count={camperRegistrations.length} limit={offering.rosterLimit} limitType={offering.limitType} />
                <p className="mt-2 text-sm text-slate-500">Page 1</p>
              </div>
            </div>

            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="bg-forest-900 text-white">
                  <th className="w-10 border border-forest-900 p-2">#</th>
                  <th className="border border-forest-900 p-2 text-left">Name</th>
                  <th className="border border-forest-900 p-2 text-left">Cabin</th>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-10 border border-forest-900 p-2">{day}</th>)}
                  <th className="border border-forest-900 p-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {isStaffOnly ? (
                  <tr>
                    <td className="border border-slate-300 p-3 text-center text-slate-500" colSpan={12}>No campers assigned</td>
                  </tr>
                ) : null}
                {Array.from({ length: rosterRowCount }).map((_, index) => {
                  const registration = camperRegistrations[index];
                  return (
                    <tr key={registration?.id ?? `blank-${index}`}>
                      <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                      <td className="border border-slate-300 p-2">{registration ? `${registration.camper.firstName} ${registration.camper.lastName}` : ""}</td>
                      <td className="border border-slate-300 p-2">{registration?.camper.cabin?.name ?? ""}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      <td className="border border-slate-300 p-2">{registration?.camper.allergies.map((allergy) => allergy.allergyLabel.name).join(", ") || "\u00a0"}</td>
                    </tr>
                  );
                })}
                {assistantRegistrations.length ? (
                  <tr>
                    <td className="border border-slate-300 bg-lake-50 p-2 text-center font-black" colSpan={12}>Teaching Assistants</td>
                  </tr>
                ) : null}
                {assistantRegistrations.map((registration, index) => (
                  <tr key={registration.id}>
                    <td className="border border-slate-300 p-2 text-center">TA {index + 1}</td>
                    <td className="border border-slate-300 p-2 font-black">{registration.camper.firstName} {registration.camper.lastName}</td>
                    <td className="border border-slate-300 p-2">{registration.camper.cabin?.name ?? ""}</td>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                    <td className="border border-slate-300 p-2">Teaching assistant{registration.camper.allergies.length ? `; ${registration.camper.allergies.map((allergy) => allergy.allergyLabel.name).join(", ")}` : ""}</td>
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
