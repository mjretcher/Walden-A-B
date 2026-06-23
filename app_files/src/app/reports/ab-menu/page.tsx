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
const aPeriods: Period[] = ["P1A", "P2A", "P3A", "P4A"] as Period[];
const bPeriods: Period[] = ["P1B", "P2B", "P3B", "P4B"] as Period[];
const areaOrder = ["Waterfront", "Athletics", "Fitness", "MISC", "Misc", "Riding", "Arts & Crafts", "Performing Arts", "Media & Tech", "Nature"];

type MenuSearchParams = { unit?: string | string[]; window?: string | string[]; counts?: string | string[]; notes?: string | string[]; unitLabels?: string | string[] };
type MenuOffering = { id: string; period: Period; rosterLimit: number | null; preAssigned: boolean; includeInPrint: boolean; eligibleUnits: string; notes: string | null; registrations: { id: string }[]; menuRows: { label: string; visible: boolean; includeInPrint: boolean }[]; area: { name: string }; activity: { name: string } };

function asArray(value?: string | string[]) { return !value ? [] : Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean); }
function selectedUnits(value?: string | string[]) { const units = asArray(value).filter((unit): unit is Unit => Object.values(Unit).includes(unit as Unit)); return units.length ? units : (Object.values(Unit) as Unit[]); }
function unitTitle(units: Unit[]) { return units.length === 4 ? "All Units" : units.map((unit) => UNIT_LABEL[unit as keyof typeof UNIT_LABEL].replace("Unit ", "")).join(" & "); }
function sortAreas(left: string, right: string) { const leftIndex = areaOrder.findIndex((area) => area.toLowerCase() === left.toLowerCase()); const rightIndex = areaOrder.findIndex((area) => area.toLowerCase() === right.toLowerCase()); if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex); return left.localeCompare(right); }

export default async function AbMenuReport({ searchParams }: { searchParams?: Promise<MenuSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });
  const units = selectedUnits(params.unit);
  const registrationWindow = parseRegistrationWindow(params.window);
  const showCounts = asArray(params.counts).includes("show");
  const showNotes = asArray(params.notes).includes("show");
  const showUnitLabels = asArray(params.unitLabels).includes("show");
  const offerings = session ? await prisma.activityOffering.findMany({
    where: { sessionId: session.id, active: true, visibleOnMenu: true, visibleForCamperRegistration: true, period: { in: [...aPeriods, ...bPeriods] } },
    include: { area: true, activity: true, menuRows: { orderBy: { sortOrder: "asc" } }, registrations: { where: { registrationWindow, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } }, select: { id: true } } },
    orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
  }) : [];
  const filteredOfferings = offerings.filter((offering) => { const eligibleUnits = readStringArray(offering.eligibleUnits as any); return !eligibleUnits.length || units.some((unit) => eligibleUnits.includes(unit)); });
  const areaNames = Array.from(new Set(filteredOfferings.map((offering) => offering.area.name))).sort((a: unknown, b: unknown) => sortAreas(a as string, b as string));

  return (
    <AppShell user={user}>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-forest-900">Printable A/B Menu</h1><p className="mt-1 text-slate-600">Paper-style menu: A Day and B Day print as separate pages.</p></div><div className="flex flex-wrap gap-2"><Link className={secondaryButtonClass} href="/admin/menu-builder">Menu Builder</Link><PrintButton label="Print menu" fitToPage orientationToggle defaultOrientation="landscape" /></div></div>
      <form className="no-print mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-soft lg:grid-cols-3" method="get"><fieldset><legend className="mb-2 text-sm font-black text-forest-900">Units</legend><div className="flex flex-wrap gap-2">{(Object.values(Unit) as Unit[]).map((unit) => <label key={unit} className="cursor-pointer"><input className="peer sr-only" defaultChecked={units.includes(unit)} name="unit" type="checkbox" value={unit} /><span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{UNIT_LABEL[unit as keyof typeof UNIT_LABEL]}</span></label>)}</div></fieldset><label className="grid gap-2 text-sm font-black text-forest-900">Registration window<select className="min-h-11 rounded-lg border border-slate-200 px-3" name="window" defaultValue={registrationWindow}>{(Object.values(RegistrationWindow) as string[]).map((window) => <option key={window} value={window}>{REGISTRATION_WINDOW_LABEL[window as keyof typeof REGISTRATION_WINDOW_LABEL]}</option>)}</select></label><fieldset><legend className="mb-2 text-sm font-black text-forest-900">Print details</legend><div className="flex flex-wrap gap-2"><label className="cursor-pointer"><input className="peer sr-only" defaultChecked={showCounts} name="counts" type="checkbox" value="show" /><span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">Show class and total counts</span></label><label className="cursor-pointer"><input className="peer sr-only" defaultChecked={showNotes} name="notes" type="checkbox" value="show" /><span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">Show notes</span></label><label className="cursor-pointer"><input className="peer sr-only" defaultChecked={showUnitLabels} name="unitLabels" type="checkbox" value="show" /><span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">Show units by counts</span></label></div></fieldset><div className="flex flex-wrap gap-2 lg:col-span-3"><button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Update menu</button><a className={secondaryButtonClass} href="/reports/ab-menu">Reset</a></div></form>
      <div className="no-print mb-4 flex flex-wrap gap-2"><Badge tone="blue">{session?.name ?? "No active session"}</Badge><Badge>{unitTitle(units)}</Badge><Badge tone={showCounts ? "green" : "neutral"}>{showCounts ? "Counts on" : "Counts off"}</Badge></div>
      <div className="ab-menu-report"><MenuSheet dayLabel="A" periods={aPeriods} year={session?.year ?? new Date().getFullYear()} units={units as string[]} registrationWindow={registrationWindow} areaNames={areaNames as string[]} offerings={filteredOfferings as MenuOffering[]} showCounts={showCounts} showNotes={showNotes} showUnitLabels={showUnitLabels} /><MenuSheet dayLabel="B" periods={bPeriods} year={session?.year ?? new Date().getFullYear()} units={units as string[]} registrationWindow={registrationWindow} areaNames={areaNames as string[]} offerings={filteredOfferings as MenuOffering[]} showCounts={showCounts} showNotes={showNotes} showUnitLabels={showUnitLabels} /></div>
    </AppShell>
  );
}

function MenuSheet({ dayLabel, periods, year, units, registrationWindow, areaNames, offerings, showCounts, showNotes, showUnitLabels }: { dayLabel: "A" | "B"; periods: Period[]; year: number; units: Unit[]; registrationWindow: RegistrationWindow; areaNames: string[]; offerings: MenuOffering[]; showCounts: boolean; showNotes: boolean; showUnitLabels: boolean }) {
  const dayOfferings = offerings.filter((offering) => periods.includes(offering.period));
  const dayTotal = capacityTotal(dayOfferings);
  return <section className="ab-menu-sheet print-card"><header className="ab-menu-sheet__header"><span>{year}</span><span>UNIT {unitTitle(units)} / {dayLabel} Menu{showCounts ? ` - Day total ${formatCapacityTotal(dayTotal)}` : ""}</span><span>{REGISTRATION_WINDOW_LABEL[registrationWindow]}</span></header><div className="ab-menu-sheet__grid">{periods.map((period) => { const periodTotal = capacityTotal(offerings.filter((offering) => offering.period === period)); return <div key={period} className="ab-menu-sheet__period-heading"><span>Period {PERIOD_LABEL[period]}</span>{showCounts ? <small>Total {formatCapacityTotal(periodTotal)}</small> : null}</div>; })}{areaNames.map((areaName) => periods.map((period) => { const areaOfferings = offerings.filter((offering) => offering.period === period && offering.area.name === areaName); const hasPrintableOfferings = areaOfferings.some(isPrintableMenuOffering); const areaTotal = capacityTotal(areaOfferings); return <section key={`${areaName}-${period}`} className="ab-menu-sheet__cell"><h2>{areaName}</h2>{areaOfferings.length ? <ul>{areaOfferings.map((offering) => <li key={offering.id} className={offering.includeInPrint ? undefined : "no-print"}><span>{offering.activity.name}{offering.preAssigned ? " (pre-assigned)" : ""}</span>{showCounts ? <strong>{offering.registrations.length}/{offering.rosterLimit ?? "Unlimited"}</strong> : null}{showUnitLabels ? <UnitLabelsForOffering offering={offering} /> : null}{showNotes && offering.notes ? <em>{offering.notes}</em> : null}</li>)}</ul> : null}{showCounts && hasPrintableOfferings ? <p className="ab-menu-sheet__area-total">Area total: {formatCapacityTotal(areaTotal)}</p> : null}</section>; }))}</div><footer className="ab-menu-sheet__footer">{showCounts ? <AreaDayRollups areaNames={areaNames as string[]} offerings={dayOfferings} /> : null}</footer></section>;
}

function AreaDayRollups({ areaNames, offerings }: { areaNames: string[]; offerings: MenuOffering[] }) {
  return <p className="ab-menu-sheet__area-rollups">{areaNames.map((areaName) => { const areaOfferings = offerings.filter((offering) => offering.area.name === areaName); if (!areaOfferings.some(isPrintableMenuOffering)) return null; return <span key={areaName}>{areaName}: {formatCapacityTotal(capacityTotal(areaOfferings))}</span>; })}</p>;
}

function UnitLabelsForOffering({ offering }: { offering: { eligibleUnits: string; menuRows: { label: string; visible: boolean; includeInPrint: boolean }[] } }) {
  const rows = visibleMenuRows(offering.menuRows);
  if (rows.length) return <em>{rows.map((row, index) => <span key={row.label} className={row.includeInPrint ? undefined : "no-print"}>{index ? ", " : ""}{row.label}</span>)}</em>;
  const unitCodes = readStringArray(offering.eligibleUnits as any);
  return <em>{unitCodes.map((unit) => UNIT_LABEL[unit as Unit] ?? unit).join(", ")}</em>;
}
