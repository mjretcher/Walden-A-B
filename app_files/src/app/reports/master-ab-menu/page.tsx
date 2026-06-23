import Link from "next/link";
import { RegistrationRole, RegistrationStatus, RegistrationWindow, Unit, UserRole, type Period } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { capacityTotal, formatCapacityTotal, isPrintableMenuOffering, visibleMenuRows } from "@/lib/menu-builder-behavior";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
import { parseRegistrationWindow, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const areaOrder = ["Waterfront", "Athletics", "Fitness", "MISC", "Misc", "Riding", "Arts & Crafts", "Performing Arts", "Media & Tech", "Nature"];
const MASTER_A_DAY_PERIODS = ["P1A", "P2A", "P3A", "P4A"] as const;
const MASTER_B_DAY_PERIODS = ["P1B", "P2B", "P3B", "P4B"] as const;
const MASTER_MENU_PERIODS = [...MASTER_A_DAY_PERIODS, ...MASTER_B_DAY_PERIODS] as Period[];

type MasterMenuSearchParams = {
  window?: string | string[];
  unit?: string | string[];
  classSpots?: string | string[];
  areaSpots?: string | string[];
  columnSpots?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function selectedUnits(value?: string | string[]) {
  const units = asArray(value).filter((unit): unit is Unit => Object.values(Unit).includes(unit as Unit));
  return units.length ? units : (Object.values(Unit) as Unit[]);
}

function unitTitle(units: Unit[]) {
  if (units.length === 4) return "All Units";
  return units.map((unit) => UNIT_LABEL[unit].replace("Unit ", "")).join(" & ");
}

function readPrintToggle(value: string | string[] | undefined, defaultValue: boolean) {
  const values = asArray(value);
  return values.length ? values.includes("show") : defaultValue;
}

function sortAreas(left: string, right: string) {
  const leftIndex = areaOrder.findIndex((area) => area.toLowerCase() === left.toLowerCase());
  const rightIndex = areaOrder.findIndex((area) => area.toLowerCase() === right.toLowerCase());
  if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  return left.localeCompare(right);
}

export default async function MasterAbMenuReport({ searchParams }: { searchParams?: Promise<MasterMenuSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });
  const registrationWindow = parseRegistrationWindow(params.window);
  const units = selectedUnits(params.unit);
  const showClassSpots = readPrintToggle(params.classSpots, true);
  const showAreaTotalSpots = readPrintToggle(params.areaSpots, false);
  const showColumnTotalSpots = readPrintToggle(params.columnSpots, false);
  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true, visibleOnMasterMenu: true, period: { in: MASTER_MENU_PERIODS } },
        include: {
          area: true,
          activity: true,
          menuRows: { orderBy: { sortOrder: "asc" } },
          staffAssignments: { include: { staff: true }, orderBy: [{ staff: { lastName: "asc" } }, { staff: { firstName: "asc" } }] },
          registrations: {
            where: { registrationWindow, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } },
            select: { id: true }
          }
        },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];
  const filteredOfferings = offerings.filter((offering) => {
    const eligibleUnits = readStringArray(offering.eligibleUnits);
    return !eligibleUnits.length || units.some((unit) => eligibleUnits.includes(unit));
  });
  const areaNames = Array.from(new Set(filteredOfferings.map((offering) => offering.area.name))).sort(sortAreas);

  return (
    <AppShell user={user}>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Master A/B Menu</h1>
          <p className="mt-1 text-slate-600">Staff-facing menu with units, staff-only classes, and row-level visibility controls.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryButtonClass} href="/admin/menu-builder">Menu Builder</Link>
          <Link className={secondaryButtonClass} href="/reports/ab-menu">Standard A/B Menu</Link>
        </div>
      </div>

      <form className="no-print mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-soft lg:grid-cols-3" method="get">
        <fieldset>
          <legend className="mb-2 text-sm font-black text-forest-900">Units</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.values(Unit) as Unit[]).map((unit) => (
              <label key={unit} className="cursor-pointer">
                <input className="peer sr-only" defaultChecked={units.includes(unit)} name="unit" type="checkbox" value={unit} />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{UNIT_LABEL[unit]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-2 text-sm font-black text-forest-900">
          Registration window
          <select className="min-h-11 rounded-lg border border-slate-200 px-3" name="window" defaultValue={registrationWindow}>
            {Object.values(RegistrationWindow).map((window) => <option key={window} value={window}>{REGISTRATION_WINDOW_LABEL[window]}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-black text-forest-900">Print spots</legend>
          <div className="flex flex-wrap gap-2">
            <PrintToggle name="classSpots" label="Show class spots" checked={showClassSpots} />
            <PrintToggle name="areaSpots" label="Show area total spots" checked={showAreaTotalSpots} />
            <PrintToggle name="columnSpots" label="Show column total spots" checked={showColumnTotalSpots} />
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
          <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Update menu</button>
          <a className={secondaryButtonClass} href="/reports/master-ab-menu">Reset</a>
          <PrintButton label="Print master menu" />
        </div>
      </form>

      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Badge tone="blue">{session?.name ?? "No active session"}</Badge>
        <Badge>{unitTitle(units)}</Badge>
        <Badge>{REGISTRATION_WINDOW_LABEL[registrationWindow]}</Badge>
        <Badge tone="green">Units shown</Badge>
      </div>

      <div className="ab-menu-report">
        <MasterSheet dayLabel="A" periods={MASTER_A_DAY_PERIODS as unknown as Period[]} year={session?.year ?? new Date().getFullYear()} registrationWindow={registrationWindow} areaNames={areaNames} offerings={filteredOfferings} showClassSpots={showClassSpots} showAreaTotalSpots={showAreaTotalSpots} showColumnTotalSpots={showColumnTotalSpots} />
        <MasterSheet dayLabel="B" periods={MASTER_B_DAY_PERIODS as unknown as Period[]} year={session?.year ?? new Date().getFullYear()} registrationWindow={registrationWindow} areaNames={areaNames} offerings={filteredOfferings} showClassSpots={showClassSpots} showAreaTotalSpots={showAreaTotalSpots} showColumnTotalSpots={showColumnTotalSpots} />
      </div>
    </AppShell>
  );
}

function MasterSheet({
  dayLabel,
  periods,
  year,
  registrationWindow,
  areaNames,
  offerings,
  showClassSpots,
  showAreaTotalSpots,
  showColumnTotalSpots
}: {
  dayLabel: "A" | "B";
  periods: Period[];
  year: number;
  registrationWindow: RegistrationWindow;
  areaNames: string[];
  offerings: Array<{
    id: string;
    period: Period;
    rosterLimit: number | null;
    preAssigned: boolean;
    includeInPrint: boolean;
    eligibleUnits: string;
    notes: string | null;
    registrations: { id: string }[];
    staffAssignments: { staff: { firstName: string; lastName: string } }[];
    menuRows: { label: string; visible: boolean; includeInPrint: boolean }[];
    area: { name: string };
    activity: { name: string };
  }>;
  showClassSpots: boolean;
  showAreaTotalSpots: boolean;
  showColumnTotalSpots: boolean;
}) {
  return (
    <section className="ab-menu-sheet print-card">
      <header className="ab-menu-sheet__header">
        <span>{year}</span>
        <span>MASTER / {dayLabel} Menu</span>
        <span>{REGISTRATION_WINDOW_LABEL[registrationWindow]}</span>
      </header>
      <div className="ab-menu-sheet__grid">
        {periods.map((period) => (
          <div key={period} className="ab-menu-sheet__period-heading">
            <span>Period {PERIOD_LABEL[period]}</span>
            {showColumnTotalSpots ? <small>Column total: {formatCapacityTotal(capacityTotal(offerings.filter((offering) => offering.period === period)))}</small> : null}
          </div>
        ))}
        {areaNames.map((areaName) => periods.map((period) => {
          const areaOfferings = offerings.filter((offering) => offering.period === period && offering.area.name === areaName);
          const hasPrintableOfferings = areaOfferings.some(isPrintableMenuOffering);
          return (
            <section key={`${areaName}-${period}`} className="ab-menu-sheet__cell">
              <h2>{areaName}</h2>
              {areaOfferings.length ? (
                <ul>
                  {areaOfferings.map((offering) => (
                    <li key={offering.id} className={offering.includeInPrint ? undefined : "no-print"}>
                      <span>{offering.activity.name}{offering.preAssigned ? " (pre-assigned)" : ""}</span>
                      {showClassSpots ? <strong>{offering.registrations.length}/{offering.rosterLimit ?? "Unlimited"}</strong> : null}
                      <UnitLabelsForOffering offering={offering} />
                      {offering.staffAssignments.length ? <em>Staff: {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ")}</em> : null}
                      {offering.notes ? <em>{offering.notes}</em> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {hasPrintableOfferings && showAreaTotalSpots ? <p className="mt-1 text-[10px] font-black uppercase text-slate-500">Area total: {formatCapacityTotal(capacityTotal(areaOfferings))}</p> : null}
            </section>
          );
        }))}
      </div>
      <footer className="ab-menu-sheet__footer">
        <p>Master version for staff, prep, photo, yearbook, and staff-duty planning.</p>
      </footer>
    </section>
  );
}

function PrintToggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="cursor-pointer">
      <input name={name} type="hidden" value="off" />
      <input className="peer sr-only" defaultChecked={checked} name={name} type="checkbox" value="show" />
      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{label}</span>
    </label>
  );
}

function UnitLabelsForOffering({ offering }: { offering: { eligibleUnits: string; menuRows: { label: string; visible: boolean; includeInPrint: boolean }[] } }) {
  const rows = visibleMenuRows(offering.menuRows);
  if (rows.length) {
    return (
      <em>
        {rows.map((row, index) => (
          <span key={row.label} className={row.includeInPrint ? undefined : "no-print"}>{index ? ", " : ""}{row.label}</span>
        ))}
      </em>
    );
  }
  const unitCodes = readStringArray(offering.eligibleUnits);
  return <em>{unitCodes.map((unit) => UNIT_LABEL[unit as Unit] ?? unit).join(", ")}</em>;
}
