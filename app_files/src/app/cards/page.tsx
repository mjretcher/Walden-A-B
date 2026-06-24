// @ts-nocheck
import { Gender, Period, RegistrationRole, RegistrationStatus, RegistrationWindow, Unit, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, UNIT_LABEL } from "@/lib/periods";
import { parseRegistrationWindow, REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const leftPeriods = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
const rightPeriods = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];

type CardsSearchParams = {
  unit?: string | string[];
  gender?: string | string[];
  cabin?: string | string[];
  window?: string | string[];
  medical?: string | string[];
  group?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
  cardsPerPage?: string | string[];
  qr?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function isUnit(value?: string): value is Unit {
  return !!value && Object.values(Unit).includes(value as Unit);
}

function isGender(value?: string): value is Gender {
  return !!value && Object.values(Gender).includes(value as Gender);
}

function genderShort(gender: Gender): string {
  if (gender === Gender.FEMALE) return "Girls";
  if (gender === Gender.MALE) return "Boys";
  return "Other";
}

export default async function CardsPage({ searchParams }: { searchParams?: Promise<CardsSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  // Print settings
  const showMedical = firstParam(params.medical) !== "hide";
  const showQr = firstParam(params.qr) !== "hide";
  const selectedCardsPerPage = ["4", "6", "9"].includes(firstParam(params.cardsPerPage) ?? "") ? firstParam(params.cardsPerPage)! : "6";
  const registrationWindow = parseRegistrationWindow(params.window);

  // Camper filters
  const selectedUnits = asArray(params.unit).filter(isUnit);
  const selectedGenders = asArray(params.gender).filter(isGender);
  const selectedCabinIds = asArray(params.cabin);

  const session = await prisma.session.findFirst({ where: { active: true } });

  const [filterGroups, designationRows, allCabins] = session
    ? await Promise.all([
        prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } }),
        prisma.camperSessionDesignation.findMany({
          where: { camper: { sessionId: session.id, active: true } },
          distinct: ["label"],
          orderBy: { label: "asc" }
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { gender: "asc" }, { name: "asc" }] })
      ])
    : [[], [], []];

  const { selectedGroupIds, weekBlocks, designations } = resolveCamperPoolFilters(params, filterGroups);

  const allCampers = session
    ? await prisma.camper.findMany({
        where: { sessionId: session.id, active: true, ...camperPoolWhere({ weekBlocks, designations }) },
        include: {
          cabin: true,
          weekEnrollments: { include: { cabin: true }, orderBy: { weekBlock: "asc" } },
          allergies: { include: { allergyLabel: true }, orderBy: { allergyLabel: { name: "asc" } } },
          registrations: {
            where: { registrationWindow, status: { in: activeRegistration } },
            include: { offering: { include: { activity: true } } }
          }
        },
        orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }]
      })
    : [];

  const campers = allCampers.filter((camper) => {
    if (selectedUnits.length && !selectedUnits.includes(camper.unit)) return false;
    if (selectedGenders.length && !selectedGenders.includes(camper.gender)) return false;
    if (selectedCabinIds.length && !selectedCabinIds.includes(camper.cabinId ?? "")) return false;
    return true;
  });

  // Group cabins by unit → gender for the picker
  const cabinsByUnitGender = allCabins.reduce<Record<string, Record<string, typeof allCabins>>>((acc, cabin) => {
    if (!acc[cabin.unit]) acc[cabin.unit] = {};
    if (!acc[cabin.unit][cabin.gender]) acc[cabin.unit][cabin.gender] = [];
    acc[cabin.unit][cabin.gender].push(cabin);
    return acc;
  }, {});

  const activeFilterCount = selectedUnits.length + selectedGenders.length + selectedCabinIds.length +
    selectedGroupIds.length + weekBlocks.length + designations.length;

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Registration Cards" eyebrow={`${REGISTRATION_WINDOW_LABEL[registrationWindow]} · ${campers.length} of ${allCampers.length} campers`}>
          <PrintButton label="Print cards" />
        </PageHeader>
      </div>

      <form className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft" method="get">

        {/* ── Top bar: print settings + actions ── */}
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 px-5 py-4">
          <div className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Window</span>
            <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="window" defaultValue={registrationWindow}>
              {(Object.values(RegistrationWindow) as string[]).map((w) => (
                <option key={w} value={w}>{REGISTRATION_WINDOW_LABEL[w as RegistrationWindow]} — {REGISTRATION_WINDOW_DESCRIPTION[w as RegistrationWindow]}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Cards per page</span>
            <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="cardsPerPage" defaultValue={selectedCardsPerPage}>
              <option value="4">4 per page</option>
              <option value="6">6 per page</option>
              <option value="9">9 per page</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400 w-full">On cards</span>
            <label className="cursor-pointer">
              <input name="medical" type="hidden" value="hide" />
              <input className="peer sr-only" defaultChecked={showMedical} name="medical" type="checkbox" value="show" />
              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Medical notes</span>
            </label>
            <label className="cursor-pointer">
              <input name="qr" type="hidden" value="hide" />
              <input className="peer sr-only" defaultChecked={showQr} name="qr" type="checkbox" value="show" />
              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">QR codes</span>
            </label>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-xs font-black text-white">
                {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
              </span>
            )}
            <a className={secondaryButtonClass} href="/cards">Reset</a>
            <button className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700" type="submit">Apply</button>
          </div>
        </div>

        {/* ── Main filter area ── */}
        <div className="grid gap-0 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">

          {/* Left: Who to print — cabin picker */}
          <div className="p-5">
            <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-400">Who to print</p>
            <p className="mb-4 text-xs text-slate-500">Select specific cabins, or use the unit buttons to grab everyone in a unit at once. No selection = all campers.</p>

            <div className="space-y-4">
              {(Object.values(Unit) as Unit[]).map((unit) => {
                const genderGroups = cabinsByUnitGender[unit];
                if (!genderGroups) return null;
                const unitCabinIds = Object.values(genderGroups).flat().map((c) => c.id);
                const allUnitSelected = unitCabinIds.every((id) => selectedCabinIds.includes(id));

                return (
                  <div key={unit}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-black text-forest-900">{UNIT_LABEL[unit]}</span>
                      {/* Unit-level unit filter shortcut */}
                      <label className="cursor-pointer">
                        <input
                          className="peer sr-only"
                          defaultChecked={selectedUnits.includes(unit)}
                          name="unit"
                          type="checkbox"
                          value={unit}
                        />
                        <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-300">
                          All {UNIT_LABEL[unit]}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      {Object.entries(genderGroups)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([gender, cabins]) => (
                          <div key={gender} className="flex flex-wrap items-center gap-1.5">
                            <span className="w-10 shrink-0 text-xs font-semibold text-slate-400">{genderShort(gender as Gender)}</span>
                            {cabins.map((cabin) => (
                              <label key={cabin.id} className="cursor-pointer">
                                <input
                                  className="peer sr-only"
                                  defaultChecked={selectedCabinIds.includes(cabin.id)}
                                  name="cabin"
                                  type="checkbox"
                                  value={cabin.id}
                                />
                                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">
                                  {cabin.name}
                                </span>
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

          {/* Right: Additional filters */}
          <div className="p-5">
            <p className="mb-4 text-xs font-black uppercase tracking-wide text-slate-400">Additional filters</p>

            <div className="space-y-5">
              {/* Saved groups */}
              {filterGroups.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Saved registration groups</p>
                  <div className="flex flex-wrap gap-2">
                    {filterGroups.map((group) => (
                      <label key={group.id} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={selectedGroupIds.includes(group.id)} name="group" type="checkbox" value={group.id} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{group.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Week blocks */}
              <div>
                <p className="mb-2 text-sm font-black text-slate-700">Week blocks</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.values(WeekBlock) as WeekBlock[]).map((wb) => (
                    <label key={wb} className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={weekBlocks.includes(wb)} name="weekBlock" type="checkbox" value={wb} />
                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{WEEK_BLOCK_LABEL[wb]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Session designations */}
              {designationRows.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-black text-slate-700">Session designations</p>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {designationRows.map((row) => (
                      <label key={row.label} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={designations.includes(row.label)} name="designation" type="checkbox" value={row.label} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{row.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-black text-forest-900">{campers.length} card{campers.length !== 1 ? "s" : ""} will print</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeFilterCount > 0 ? `Filtered from ${allCampers.length} total` : `All ${allCampers.length} active campers`}
                  {" · "}{REGISTRATION_WINDOW_LABEL[registrationWindow]} window
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <a className={secondaryButtonClass} href="/cards">Reset all</a>
          <button className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700" type="submit">Apply filters</button>
        </div>
      </form>

      <div className={`registration-cards-grid cards-per-page-${selectedCardsPerPage} grid gap-5 lg:grid-cols-2 print:grid`}>
        {campers.map((camper: any) => {
          const byPeriod = new Map(camper.registrations.map((registration: any) => [registration.period, registration]));
          return (
            <article key={camper.id} className="print-card rounded-lg border-2 border-forest-900 bg-white p-5 shadow-soft print:mb-5">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-700">Camp Walden Registration Card - {REGISTRATION_WINDOW_LABEL[registrationWindow]}</p>
                  <h2 className="mt-1 text-2xl font-bold text-forest-900">{camper.firstName} {camper.lastName}</h2>
                  <p className="text-sm text-slate-600">Cabin {camper.cabin?.name ?? "-"} - {UNIT_LABEL[camper.unit as keyof typeof UNIT_LABEL]} - Swim {SWIM_CODE[camper.swimLevel as keyof typeof SWIM_CODE]}</p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {camper.campGrade ? `${camper.campGrade} • ` : ""}
                    {camper.weekEnrollments.length
                      ? camper.weekEnrollments.map((week: any) => `${week.weekBlock.replace("WK", "Wk").replace("_", "-")}: ${week.cabin?.name ?? week.cabinName ?? "-"}`).join("  ")
                      : "No week blocks loaded"}
                  </p>
                  {showMedical ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {camper.allergies.map((allergy) => <Badge key={allergy.id} tone="amber">{allergy.allergyLabel.name}</Badge>)}
                      {camper.medicalFlags ? <Badge tone="amber">{camper.medicalFlags}</Badge> : null}
                    </div>
                  ) : null}
                </div>
                {showQr ? <img alt={`QR for ${camper.firstName} ${camper.lastName}`} className="h-24 w-24" src={`/api/campers/${camper.id}/qr`} /> : null}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2">
                {[leftPeriods, rightPeriods].map((periods, index) => (
                  <table key={index} className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-forest-900 text-white">
                        <th className="w-12 border border-forest-900 p-2 text-left">Pd</th>
                        <th className="border border-forest-900 p-2 text-left">Activity</th>
                        <th className="w-14 border border-forest-900 p-2 text-left text-[10px] leading-tight">Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => {
                        const registration = byPeriod.get(period);
                        return (
                          <tr key={period}>
                            <td className="border border-slate-300 p-2 text-lg font-extrabold text-forest-900">{PERIOD_LABEL[period]}</td>
                            <td className="border border-slate-300 p-2 align-top text-base font-semibold leading-snug text-slate-900">
                              {registration ? `${(registration as any).offering.activity.name}${(registration as any).registrationRole === RegistrationRole.TEACHING_ASSISTANT ? " (TA)" : ""}` : ""}
                            </td>
                            <td className="border border-slate-300 p-1 align-top text-[10px] leading-tight text-slate-600">{(registration as any)?.counselorApproval ?? ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">ID: {camper.id}</p>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
