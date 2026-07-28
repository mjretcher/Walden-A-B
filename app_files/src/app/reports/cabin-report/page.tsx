// @ts-nocheck
import { Gender, Period, RegistrationRole, RegistrationStatus, RegistrationWindow, Unit } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { requireUser } from "@/lib/auth";
import { camperPrintName } from "@/lib/camper-name";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";
import { prisma } from "@/lib/prisma";
import { ALL_UNITS, PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
import {
  inferCurrentRegistrationWindow,
  parseRegistrationWindow,
  REGISTRATION_WINDOW_DESCRIPTION,
  REGISTRATION_WINDOW_LABEL
} from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

// Camper-facing schedule periods, matching the Registration Cards convention:
// 1A-4A then 1B-4B. Twilight (5A/5B) is appended only when someone in the
// report actually has a twilight registration, so the ordinary sheet doesn't
// carry two permanently empty columns.
const A_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
const B_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];
const TWILIGHT: Period[] = [Period.P5A, Period.P5B];

type CabinReportSearchParams = {
  window?: string | string[];
  unit?: string | string[];
  gender?: string | string[];
  cabin?: string | string[];
  empty?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function readToggle(value: string | string[] | undefined, fallback: boolean) {
  const values = asArray(value);
  if (!values.length) return fallback;
  return values.includes("show");
}

function isUnit(value?: string): value is Unit {
  return !!value && Object.values(Unit).includes(value as Unit);
}

function genderLabel(gender: Gender): string {
  if (gender === Gender.FEMALE) return "Girls";
  if (gender === Gender.MALE) return "Boys";
  return "Other";
}

export default async function CabinReportPage({ searchParams }: { searchParams?: Promise<CabinReportSearchParams> }) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : {};

  const session = await prisma.session.findFirst({ where: { active: true } });
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));
  const selectedUnits = asArray(params.unit).filter(isUnit);
  const selectedCabinIds = asArray(params.cabin);
  const selectedGender = asArray(params.gender)[0];
  // Off by default: a cabin with nobody in it wastes a sheet of paper.
  const showEmptyCabins = readToggle(params.empty, false);

  const [allCabins, campers] = session
    ? await Promise.all([
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { gender: "asc" }, { name: "asc" }] }),
        prisma.camper.findMany({
          where: { sessionId: session.id, active: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            cabinId: true,
            counselorAssistant: true,
            registrations: {
              where: { registrationWindow, status: { in: activeRegistration } },
              select: {
                period: true,
                registrationRole: true,
                offering: { select: { activity: { select: { name: true } } } }
              }
            }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        })
      ])
    : [[], []];

  // Only show twilight columns if twilight is actually in play this window.
  const hasTwilight = campers.some((camper) => camper.registrations.some((r) => TWILIGHT.includes(r.period)));
  const periods: Period[] = hasTwilight
    ? [...A_PERIODS, Period.P5A, ...B_PERIODS, Period.P5B]
    : [...A_PERIODS, ...B_PERIODS];

  const campersByCabin = new Map<string, typeof campers>();
  for (const camper of campers) {
    const key = camper.cabinId ?? "__unassigned__";
    const list = campersByCabin.get(key) ?? [];
    list.push(camper);
    campersByCabin.set(key, list);
  }

  // Cabin page order mirrors the printed bunk sheets: unit, then gender, then
  // the hand/age ordering from lib/cabin-print-order (NOT raw alphabetical).
  const filteredCabins = allCabins.filter((cabin) => {
    if (selectedUnits.length && !selectedUnits.includes(cabin.unit)) return false;
    if (selectedGender && cabin.gender !== selectedGender) return false;
    if (selectedCabinIds.length && !selectedCabinIds.includes(cabin.id)) return false;
    return true;
  });

  const orderedCabins: typeof allCabins = [];
  for (const unit of ALL_UNITS) {
    for (const gender of Object.values(Gender) as Gender[]) {
      const group = filteredCabins.filter((cabin) => cabin.unit === unit && cabin.gender === gender);
      if (!group.length) continue;
      orderedCabins.push(...sortCabinsForPrint(group, gender, unit));
    }
  }

  const sheets = orderedCabins
    .map((cabin) => ({ cabin, roster: campersByCabin.get(cabin.id) ?? [] }))
    .filter((sheet) => showEmptyCabins || sheet.roster.length > 0);

  // Safety net: campers with no cabin would otherwise silently vanish from a
  // report meant to account for everyone. Only surfaced on an unfiltered run.
  const unassigned = campersByCabin.get("__unassigned__") ?? [];
  const showUnassigned =
    unassigned.length > 0 && !selectedCabinIds.length && !selectedUnits.length && !selectedGender;

  const activeFilterCount = selectedUnits.length + selectedCabinIds.length + (selectedGender ? 1 : 0);
  const totalCampers = sheets.reduce((sum, sheet) => sum + sheet.roster.length, 0);

  const cabinsByUnit = allCabins.reduce<Record<string, typeof allCabins>>((acc, cabin) => {
    (acc[cabin.unit] ||= []).push(cabin);
    return acc;
  }, {});

  function activityLabel(camper: any, period: Period): string {
    const registration = camper.registrations.find((r: any) => r.period === period);
    if (!registration) return "";
    // FULL activity name here on purpose — this sheet hangs in the cabin, so
    // it spells out "Arts and Crafts" rather than the card-style abbreviation.
    const name = registration.offering?.activity?.name ?? "";
    return registration.registrationRole === RegistrationRole.TEACHING_ASSISTANT ? `${name} (TA)` : name;
  }

  function renderSheet(key: string, title: string, subtitle: string, roster: any[]) {
    return (
      <article key={key} className="cabin-report-sheet mb-6 break-inside-avoid rounded-xl border-2 border-forest-900 bg-white p-5 shadow-soft">
        <div className="cabin-report-header flex items-end justify-between gap-4 border-b-2 border-forest-900 pb-2">
          <div>
            <h2 className="text-3xl font-black leading-none text-forest-900">{title}</h2>
            <p className="mt-1 text-sm font-bold text-slate-600">{subtitle}</p>
          </div>
          <p className="text-right text-xs font-bold text-slate-500">
            {session?.name ?? "No active session"}
            <br />
            {REGISTRATION_WINDOW_LABEL[registrationWindow]}
          </p>
        </div>

        {roster.length ? (
          <table className="mt-3 w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-slate-200 text-slate-900">
                <th className="cabin-report-col-num border border-forest-900 p-1.5 font-black">#</th>
                <th className="cabin-report-col-name border border-forest-900 p-1.5 text-left font-black">Camper</th>
                {periods.map((period) => (
                  <th key={period} className="border border-forest-900 p-1.5 font-black">{PERIOD_LABEL[period]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((camper: any, index: number) => (
                <tr key={camper.id}>
                  <td className="cabin-report-col-num border border-slate-300 p-1.5 text-center font-bold">{index + 1}</td>
                  <td className="cabin-report-col-name border border-slate-300 p-1.5 font-bold text-slate-900">
                    {camperPrintName(camper)}
                    {camper.counselorAssistant ? <span className="ml-1 text-[0.6rem] font-black uppercase text-forest-700">CA</span> : null}
                  </td>
                  {periods.map((period) => (
                    <td key={period} className="cabin-report-activity border border-slate-300 p-1.5 align-middle leading-tight text-slate-900">
                      {activityLabel(camper, period) || "\u00a0"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm font-bold text-slate-400">No campers assigned.</p>
        )}
      </article>
    );
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Cabin Report" eyebrow="One printable sheet per cabin — full class names">
          <PrintButton label="Print all cabins" />
        </PageHeader>
      </div>

      <AutoSubmitForm className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="window" defaultValue={registrationWindow}>
            {(Object.values(RegistrationWindow) as string[]).map((w) => (
              <option key={w} value={w}>
                {REGISTRATION_WINDOW_LABEL[w as RegistrationWindow]} — {REGISTRATION_WINDOW_DESCRIPTION[w as RegistrationWindow]}
              </option>
            ))}
          </select>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="gender" defaultValue={selectedGender ?? ""}>
            <option value="">Boys &amp; girls</option>
            <option value={Gender.MALE}>Boys only</option>
            <option value={Gender.FEMALE}>Girls only</option>
          </select>
          <label className="cursor-pointer">
            <input name="empty" type="hidden" value="hide" />
            <input className="peer sr-only" defaultChecked={showEmptyCabins} name="empty" type="checkbox" value="show" />
            <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">
              Include empty cabins
            </span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-black text-forest-900">
              {sheets.length} sheet{sheets.length !== 1 ? "s" : ""} · {totalCampers} camper{totalCampers !== 1 ? "s" : ""}
            </span>
            {activeFilterCount > 0 ? <a className={secondaryButtonClass} href="/reports/cabin-report">Reset</a> : null}
          </div>
        </div>

        <div className="p-5">
          <p className="text-sm font-black text-forest-900">Cabins</p>
          <p className="mt-0.5 text-xs text-slate-500">
            No selection prints every cabin — one page each, in bunk-sheet order. Pick cabins or units only for a partial reprint.
          </p>

          <div className="mt-3 space-y-3">
            {ALL_UNITS.map((unit) => {
              const unitCabins = cabinsByUnit[unit];
              if (!unitCabins?.length) return null;
              return (
                <div key={unit} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-600">{UNIT_LABEL[unit]}</span>
                    <label className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={selectedUnits.includes(unit)} name="unit" type="checkbox" value={unit} />
                      <span className="inline-flex rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-400">
                        Whole unit
                      </span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unitCabins.map((cabin) => (
                      <label key={cabin.id} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={selectedCabinIds.includes(cabin.id)} name="cabin" type="checkbox" value={cabin.id} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">
                          {cabin.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AutoSubmitForm>

      {!session ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session.</p>
      ) : null}

      <div className="cabin-report-list">
        {sheets.map((sheet) =>
          renderSheet(
            sheet.cabin.id,
            `Cabin ${sheet.cabin.name}`,
            `${UNIT_LABEL[sheet.cabin.unit]} · ${genderLabel(sheet.cabin.gender)} · ${sheet.roster.length} camper${sheet.roster.length !== 1 ? "s" : ""}`,
            sheet.roster
          )
        )}
        {showUnassigned
          ? renderSheet(
              "__unassigned__",
              "No cabin assigned",
              `${unassigned.length} camper${unassigned.length !== 1 ? "s" : ""} without a cabin — assign them in Bunk Management`,
              unassigned
            )
          : null}
        {session && !sheets.length && !showUnassigned ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
            No cabins match your current filters.{activeFilterCount > 0 ? " Try resetting." : ""}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
