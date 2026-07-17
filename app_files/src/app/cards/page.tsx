// @ts-nocheck
import { Gender, Period, RegistrationRole, RegistrationStatus, RegistrationWindow, Unit, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, secondaryButtonClass } from "@/components/ui";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { camperPrintName } from "@/lib/camper-name";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, UNIT_LABEL } from "@/lib/periods";
import { inferCurrentRegistrationWindow, parseRegistrationWindow, REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const leftPeriods = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
const rightPeriods = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];

type CardsSearchParams = {
  unit?: string | string[];
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

function genderShort(gender: Gender): string {
  if (gender === Gender.FEMALE) return "Girls";
  if (gender === Gender.MALE) return "Boys";
  return "Other";
}

export default async function CardsPage({ searchParams }: { searchParams?: Promise<CardsSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const showMedical = firstParam(params.medical) !== "hide";
  const showQr = firstParam(params.qr) !== "hide";
  const selectedCardsPerPage = ["4", "6", "9"].includes(firstParam(params.cardsPerPage) ?? "") ? firstParam(params.cardsPerPage)! : "6";
  const session = await prisma.session.findFirst({ where: { active: true } });
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));
  const selectedUnits = asArray(params.unit).filter(isUnit);
  const selectedCabinIds = asArray(params.cabin);

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
  const hasAdvancedFilters = selectedGroupIds.length > 0 || weekBlocks.length > 0 || designations.length > 0;

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
    if (selectedCabinIds.length && !selectedCabinIds.includes(camper.cabinId ?? "")) return false;
    return true;
  });

  // Group cabins by unit → gender
  const cabinsByUnitGender = allCabins.reduce<Record<string, Record<string, typeof allCabins>>>((acc, cabin) => {
    if (!acc[cabin.unit]) acc[cabin.unit] = {};
    if (!acc[cabin.unit][cabin.gender]) acc[cabin.unit][cabin.gender] = [];
    acc[cabin.unit][cabin.gender].push(cabin);
    return acc;
  }, {});

  const activeCabinFilters = selectedUnits.length + selectedCabinIds.length;
  const activeAdvancedFilters = selectedGroupIds.length + weekBlocks.length + designations.length;

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Registration Cards" eyebrow={session?.name ?? "No active session"}>
          <PrintButton label="Print cards" />
        </PageHeader>
      </div>

      <AutoSubmitForm className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft">

        {/* ── Top bar: window + print options + actions ── */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="window" defaultValue={registrationWindow}>
            {(Object.values(RegistrationWindow) as string[]).map((w) => (
              <option key={w} value={w}>{REGISTRATION_WINDOW_LABEL[w as RegistrationWindow]} — {REGISTRATION_WINDOW_DESCRIPTION[w as RegistrationWindow]}</option>
            ))}
          </select>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="cardsPerPage" defaultValue={selectedCardsPerPage}>
            <option value="4">4 per page</option>
            <option value="6">6 per page</option>
            <option value="9">9 per page</option>
          </select>
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-black text-forest-900">{campers.length} card{campers.length !== 1 ? "s" : ""}</span>
            <a className={secondaryButtonClass} href="/cards">Reset</a>
          </div>
        </div>

        {/* ── Cabin picker — the main event ── */}
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-forest-900">Select cabins to print</p>
              <p className="text-xs text-slate-500 mt-0.5">No selection prints all {allCampers.length} campers. Click individual cabins or use unit buttons to select a whole unit.</p>
            </div>
            {activeCabinFilters > 0 && (
              <span className="rounded-full bg-lake-600 px-2.5 py-0.5 text-xs font-black text-white">{campers.length} selected</span>
            )}
          </div>

          <div className="space-y-3">
            {(Object.values(Unit) as Unit[]).map((unit) => {
              const genderGroups = cabinsByUnitGender[unit];
              if (!genderGroups) return null;
              const allUnitCabinIds = Object.values(genderGroups).flat().map((c) => c.id);
              const unitFullySelected = selectedUnits.includes(unit);

              return (
                <div key={unit} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-600">{UNIT_LABEL[unit]}</span>
                    <label className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={unitFullySelected} name="unit" type="checkbox" value={unit} />
                      <span className="inline-flex rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-400">
                        All {UNIT_LABEL[unit]}
                      </span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(genderGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([gender, cabins]) => (
                        <div key={gender} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-9 shrink-0 text-xs font-semibold text-slate-400">{genderShort(gender as Gender)}</span>
                          {cabins.map((cabin) => (
                            <label key={cabin.id} className="cursor-pointer">
                              <input className="peer sr-only" defaultChecked={selectedCabinIds.includes(cabin.id)} name="cabin" type="checkbox" value={cabin.id} />
                              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-300">
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

          {/* Advanced filters — collapsed by default, open if anything is active */}
          <details className="mt-4" open={hasAdvancedFilters}>
            <summary className="cursor-pointer text-sm font-black text-slate-500 hover:text-slate-700">
              Advanced filters
              {activeAdvancedFilters > 0 && (
                <span className="ml-2 rounded-full bg-forest-700 px-2 py-0.5 text-xs font-black text-white">{activeAdvancedFilters} active</span>
              )}
            </summary>
            <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Use these to narrow cards to a specific sub-group — e.g. first-session only, 11th grade program, or a saved registration group. These stack on top of cabin selection above.</p>

              {filterGroups.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Saved registration groups</p>
                  <div className="flex flex-wrap gap-2">
                    {filterGroups.map((group) => (
                      <label key={group.id} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={selectedGroupIds.includes(group.id)} name="group" type="checkbox" value={group.id} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{group.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Week blocks</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.values(WeekBlock) as WeekBlock[]).map((wb) => (
                    <label key={wb} className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={weekBlocks.includes(wb)} name="weekBlock" type="checkbox" value={wb} />
                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{WEEK_BLOCK_LABEL[wb]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {designationRows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Session designations</p>
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {designationRows.map((row) => (
                      <label key={row.label} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={designations.includes(row.label)} name="designation" type="checkbox" value={row.label} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{row.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </AutoSubmitForm>

      <div className={`registration-cards-grid cards-per-page-${selectedCardsPerPage} grid gap-5 lg:grid-cols-2 print:grid`}>
        {campers.map((camper: any) => {
          const byPeriod = new Map(camper.registrations.map((registration: any) => [registration.period, registration]));
          // Bluegill swimmers get bold + underline on the printed card so
          // they're easy to find and highlight by hand after printing.
          const isBluegill = camper.swimLevel === "BLUEGILL";
          return (
            <article key={camper.id} className="print-card rounded-lg border-2 border-forest-900 bg-white p-5 shadow-soft print:mb-5">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-700">Camp Walden Registration Card - {REGISTRATION_WINDOW_LABEL[registrationWindow]}</p>
                  <h2 className={`mt-1 text-2xl text-forest-900 ${isBluegill ? "font-extrabold underline decoration-2 underline-offset-4" : "font-bold"}`}>{camperPrintName(camper)}</h2>
                  <p className="text-sm text-slate-600">Cabin {camper.cabin?.name ?? "-"} - {UNIT_LABEL[camper.unit as keyof typeof UNIT_LABEL]} - {isBluegill ? <span className="font-black text-forest-900 underline decoration-2 underline-offset-2">Swim B</span> : <>Swim {SWIM_CODE[camper.swimLevel as keyof typeof SWIM_CODE]}</>}</p>
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
                        <th className="w-9 border border-forest-900 p-2 text-left">Pd</th>
                        <th className="border border-forest-900 p-2 text-left">Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => {
                        const registration = byPeriod.get(period);
                        const activity = (registration as any)?.offering?.activity;
                        const activityLabel = activity
                          ? `${activity.abbreviation || activity.name}${(registration as any).registrationRole === RegistrationRole.TEACHING_ASSISTANT ? " (TA)" : ""}`
                          : "";
                        return (
                          <tr key={period}>
                            <td className="border border-slate-300 p-2 text-base font-extrabold text-forest-900">{PERIOD_LABEL[period]}</td>
                            <td className="border border-slate-300 p-2 align-top text-sm font-semibold leading-snug text-slate-900">
                              {activityLabel}
                            </td>
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
