import Link from "next/link";
import { RegistrationRole, RegistrationStatus, RegistrationWindow, Unit, UserRole, type Period } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { A_DAY_PERIODS, B_DAY_PERIODS, visibleMenuRows } from "@/lib/menu-builder-behavior";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
import { parseRegistrationWindow, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const areaOrder = ["Waterfront", "Athletics", "Fitness", "MISC", "Misc", "Riding", "Arts & Crafts", "Performing Arts", "Media & Tech", "Nature"];

type MasterMenuSearchParams = {
  window?: string | string[];
};

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
  const periods = [...B_DAY_PERIODS, ...A_DAY_PERIODS] as Period[];
  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true, visibleOnMasterMenu: true, period: { in: periods } },
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
  const areaNames = Array.from(new Set(offerings.map((offering) => offering.area.name))).sort(sortAreas);

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
          <PrintButton label="Print master menu" />
        </div>
      </div>

      <form className="no-print mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-[1fr_auto]" method="get">
        <label className="grid gap-2 text-sm font-black text-forest-900">
          Registration window
          <select className="min-h-11 rounded-lg border border-slate-200 px-3" name="window" defaultValue={registrationWindow}>
            {Object.values(RegistrationWindow).map((window) => <option key={window} value={window}>{REGISTRATION_WINDOW_LABEL[window]}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Update menu</button>
          <a className={secondaryButtonClass} href="/reports/master-ab-menu">Reset</a>
        </div>
      </form>

      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Badge tone="blue">{session?.name ?? "No active session"}</Badge>
        <Badge>{REGISTRATION_WINDOW_LABEL[registrationWindow]}</Badge>
        <Badge tone="green">Units shown</Badge>
      </div>

      <div className="ab-menu-report">
        <MasterSheet dayLabel="A" periods={A_DAY_PERIODS as unknown as Period[]} year={session?.year ?? new Date().getFullYear()} registrationWindow={registrationWindow} areaNames={areaNames} offerings={offerings} />
        <MasterSheet dayLabel="B" periods={B_DAY_PERIODS as unknown as Period[]} year={session?.year ?? new Date().getFullYear()} registrationWindow={registrationWindow} areaNames={areaNames} offerings={offerings} />
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
  offerings
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
          <div key={period} className="ab-menu-sheet__period-heading">Period {PERIOD_LABEL[period]}</div>
        ))}
        {areaNames.map((areaName) => periods.map((period) => {
          const areaOfferings = offerings.filter((offering) => offering.period === period && offering.area.name === areaName);
          return (
            <section key={`${areaName}-${period}`} className="ab-menu-sheet__cell">
              <h2>{areaName}</h2>
              {areaOfferings.length ? (
                <ul>
                  {areaOfferings.map((offering) => (
                    <li key={offering.id} className={offering.includeInPrint ? undefined : "no-print"}>
                      <span>{offering.activity.name}{offering.preAssigned ? " (pre-assigned)" : ""}</span>
                      <strong>{offering.registrations.length}/{offering.rosterLimit ?? "Unlimited"}</strong>
                      <UnitLabelsForOffering offering={offering} />
                      {offering.staffAssignments.length ? <em>Staff: {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ")}</em> : null}
                      {offering.notes ? <em>{offering.notes}</em> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
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
