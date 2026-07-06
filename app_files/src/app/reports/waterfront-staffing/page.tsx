import { Period, RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import type { CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { camperPrintName } from "@/lib/camper-name";
import { isSkiStaffingActivity } from "@/lib/staffing-groups";

// The 8 columns of Mike's waterfront duty sheet, in print order.
// The two-character keys are used internally; the labels are what prints.
type ColumnKey = "canoe" | "kayak" | "swim" | "sup" | "sail" | "ski" | "crash" | "fish";

const COLUMN_ORDER: { key: ColumnKey; label: string }[] = [
  { key: "canoe", label: "CANOE" },
  { key: "kayak", label: "KAYAK" },
  { key: "swim", label: "SWIM" },
  { key: "sup", label: "SUP" },
  { key: "sail", label: "SAIL" },
  { key: "ski", label: "SKI" },
  { key: "crash", label: "CRASH" },
  { key: "fish", label: "FISH" }
];

const A_DAY_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A];
const B_DAY_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B];

/**
 * Classify a Waterfront activity into one of the 8 form columns. Returns null
 * if the activity doesn't belong in this form (e.g., an admin-only program).
 * Matching is fuzzy on the activity name so the form keeps working as Mike
 * adds or renames activities.
 *
 * SKI uses the existing isSkiStaffingActivity helper so both "Water-skiing"
 * and "Tube" land in the SKI column — same as the staff schedule.
 *
 * SPECIAL RULE: "V-Pack" and "CA V-Pack" are their own activities (not
 * literally swim lessons) but Mike wants them bucketed under SWIM
 * specifically on this duty sheet — unique to this report only.
 */
function classifyActivity(name: string): ColumnKey | null {
  const lower = name.toLowerCase();
  if (isSkiStaffingActivity(name)) return "ski"; // covers Water-skiing AND Tube
  if (/\bv[\s-]?pack\b/.test(lower)) return "swim"; // V-Pack / CA V-Pack -> SWIM (waterfront sheet only)
  if (/\bcrash\b/.test(lower)) return "crash";
  if (/\bfish/.test(lower)) return "fish";
  if (/\bsail/.test(lower)) return "sail";
  if (/\bkayak/.test(lower)) return "kayak";
  if (/\bcanoe/.test(lower)) return "canoe";
  if (/\bsup\b|stand[\s-]?up[\s-]?paddle/.test(lower)) return "sup";
  if (/\bswim|mackinac|blue\s*gill/.test(lower)) return "swim";
  return null;
}

/**
 * Within the SWIM column specifically, four named classes get their own
 * labeled sub-box inside the cell instead of dropping into the plain
 * shared list — Bluegill Swim, Mac(kinac) Swim, Swim I, and V-Pack/CA
 * V-Pack. A sub-box only appears when that class actually has someone
 * assigned that period ("just show sub boxes that apply and skip the
 * rest" — nothing pre-printed and left blank here, unlike AQUATIC SUPER/
 * FISH). Anything in the SWIM column that doesn't match one of these four
 * stays in the plain list exactly as before.
 */
type SwimSubKey = "bluegill" | "mac" | "swim1" | "vpack";
const SWIM_SUBCATEGORIES: { key: SwimSubKey; label: string; match: (name: string) => boolean }[] = [
  { key: "bluegill", label: "Bluegill Swim", match: (n) => /\bblue\s*gill\b/i.test(n) },
  { key: "mac", label: "Mac Swim", match: (n) => /\bmac(kinac)?\b/i.test(n) },
  { key: "swim1", label: "Swim I", match: (n) => /\bswim\s*(i|1|one)\b/i.test(n) },
  { key: "vpack", label: "V-Pack", match: (n) => /\bv[\s-]?pack\b/i.test(n) }
];

function classifySwimSubcategory(name: string): SwimSubKey | null {
  for (const sub of SWIM_SUBCATEGORIES) {
    if (sub.match(name)) return sub.key;
  }
  return null;
}

// Sail Dock is a distinct activity in the system, not just regular sailing
// instruction — pulled out of the plain SAIL list into its own small sub-
// box at the bottom of the cell ("Lastname - dock"), same spot as the CA
// box when both exist for the same period.
function isSailDockActivity(name: string): boolean {
  return /\bsail\s*dock\b/i.test(name);
}

type StaffEntry = { firstName: string; lastName: string; isLifeguard: boolean; displayName: string };

function alphaByLastName(a: StaffEntry, b: StaffEntry) {
  // Sort by last name, with first name as a tiebreaker when two staff share
  // the same last name (so the order is stable and predictable).
  const lastA = a.lastName.toLowerCase();
  const lastB = b.lastName.toLowerCase();
  if (lastA !== lastB) return lastA < lastB ? -1 : 1;
  return a.firstName.toLowerCase() < b.firstName.toLowerCase() ? -1 : 1;
}

export default async function WaterfrontStaffingReport() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);

  const session = await prisma.session.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" }
  });
  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Waterfront Staffing" eyebrow="Duty sheet for A-day and B-day" />
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session found.</p>
      </AppShell>
    );
  }

  // Pull every staff assignment in the Waterfront area for the active session.
  // Includes the staff member's cert list so we can mark Lifeguards (*).
  const assignments = await prisma.staffAssignment.findMany({
    where: {
      sessionId: session.id,
      offering: { area: { name: { equals: "Waterfront", mode: "insensitive" } }, active: true },
      staff: { active: true }
    },
    include: {
      staff: {
        select: {
          firstName: true,
          lastName: true,
          statusCertification: true,
          certifications: { select: { name: true } }
        }
      },
      offering: { include: { activity: { select: { name: true } } } }
    }
  });

  // Bucket the assignments by period + column. Map<Period, Map<ColumnKey, StaffEntry[]>>.
  // SWIM subcategories (Bluegill/Mac/Swim I/V-Pack) and SAIL DOCK go into
  // their own separate grids instead — see classifySwimSubcategory and
  // isSailDockActivity above — so they render as labeled sub-boxes rather
  // than dropping into the plain per-column list with everything else.
  const grid = new Map<Period, Map<ColumnKey, StaffEntry[]>>();
  const swimSubGrid = new Map<Period, Map<SwimSubKey, StaffEntry[]>>();
  const sailDockGrid = new Map<Period, StaffEntry[]>();
  for (const assignment of assignments) {
    const column = classifyActivity(assignment.offering.activity.name);
    if (!column) continue;

    const certText = assignment.staff.certifications.map((c) => c.name).join(" ");
    const isLifeguard = /\bLG\b|lifeguard/i.test(`${certText} ${assignment.staff.statusCertification ?? ""}`);
    const entry: StaffEntry = {
      firstName: assignment.staff.firstName,
      lastName: assignment.staff.lastName,
      isLifeguard,
      displayName: assignment.staff.lastName // overwritten below if duplicate in the same cell
    };

    let targetList: StaffEntry[];
    if (column === "swim") {
      const subKey = classifySwimSubcategory(assignment.offering.activity.name);
      if (subKey) {
        if (!swimSubGrid.has(assignment.period)) swimSubGrid.set(assignment.period, new Map());
        const subPeriodMap = swimSubGrid.get(assignment.period)!;
        if (!subPeriodMap.has(subKey)) subPeriodMap.set(subKey, []);
        targetList = subPeriodMap.get(subKey)!;
      } else {
        if (!grid.has(assignment.period)) grid.set(assignment.period, new Map());
        const periodMap = grid.get(assignment.period)!;
        if (!periodMap.has(column)) periodMap.set(column, []);
        targetList = periodMap.get(column)!;
      }
    } else if (column === "sail" && isSailDockActivity(assignment.offering.activity.name)) {
      if (!sailDockGrid.has(assignment.period)) sailDockGrid.set(assignment.period, []);
      targetList = sailDockGrid.get(assignment.period)!;
    } else {
      if (!grid.has(assignment.period)) grid.set(assignment.period, new Map());
      const periodMap = grid.get(assignment.period)!;
      if (!periodMap.has(column)) periodMap.set(column, []);
      targetList = periodMap.get(column)!;
    }

    // De-dupe in case the same staff appears via two offerings collapsing
    // into the same bucket (e.g., Water-skiing and Tube both → ski). Match
    // on the full (firstName, lastName) tuple so two different staff who
    // share a last name aren't accidentally merged.
    const isDuplicate = targetList.some(
      (existing) => existing.lastName === entry.lastName && existing.firstName === entry.firstName
    );
    if (!isDuplicate) {
      targetList.push(entry);
    }
  }

  // Sort each cell alphabetically by last name, then disambiguate any
  // duplicate last names within that cell by appending the first initial.
  // E.g., if two "Smith" staff land in the same cell, they become
  // "Smith A." and "Smith J." so each one is identifiable on the printed
  // sheet. Last-name-only stays the default; the initial only appears
  // where it's actually needed to disambiguate. Applied to all three grids
  // (main, swim sub-boxes, sail dock) the same way.
  function finalizeList(list: StaffEntry[]) {
    list.sort(alphaByLastName);
    const lastNameCounts = new Map<string, number>();
    for (const entry of list) {
      const key = entry.lastName.toLowerCase();
      lastNameCounts.set(key, (lastNameCounts.get(key) ?? 0) + 1);
    }
    for (const entry of list) {
      const isDuplicate = (lastNameCounts.get(entry.lastName.toLowerCase()) ?? 0) > 1;
      entry.displayName = isDuplicate
        ? `${entry.lastName} ${(entry.firstName[0] ?? "").toUpperCase()}.`
        : entry.lastName;
    }
  }
  for (const periodMap of grid.values()) {
    for (const list of periodMap.values()) finalizeList(list);
  }
  for (const periodMap of swimSubGrid.values()) {
    for (const list of periodMap.values()) finalizeList(list);
  }
  for (const list of sailDockGrid.values()) finalizeList(list);

  // Counselor Assistants show up on this sheet too — but strictly as CAs,
  // never mixed into the real staff list. They come from a completely
  // different source (a camper's Teaching Assistant registration, not a
  // StaffAssignment), classified into the same 8 columns as real staff so
  // they land in the right box, then rendered separately (see the dotted
  // "box within a box" in renderSheet) so an area head can see who's
  // helping without it reading as a real staff headcount.
  const caRegistrations = await prisma.registration.findMany({
    where: {
      sessionId: session.id,
      registrationRole: RegistrationRole.TEACHING_ASSISTANT,
      status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] },
      offering: { area: { name: { equals: "Waterfront", mode: "insensitive" } }, active: true }
    },
    include: {
      camper: { select: { firstName: true, lastName: true, nickname: true } },
      offering: { select: { period: true, activity: { select: { name: true } } } }
    }
  });

  const caGrid = new Map<Period, Map<ColumnKey, string[]>>();
  for (const registration of caRegistrations) {
    const column = classifyActivity(registration.offering.activity.name);
    if (!column) continue;

    const name = camperPrintName(registration.camper);
    if (!caGrid.has(registration.offering.period)) caGrid.set(registration.offering.period, new Map());
    const periodMap = caGrid.get(registration.offering.period)!;
    if (!periodMap.has(column)) periodMap.set(column, []);
    const cellList = periodMap.get(column)!;
    if (!cellList.includes(name)) cellList.push(name);
  }
  for (const periodMap of caGrid.values()) {
    for (const list of periodMap.values()) list.sort((a, b) => a.localeCompare(b));
  }

  // Row height, computed per period rather than one fixed value for every
  // row (the previous design). Real data can be genuinely dense — a SKI
  // column alone can run 12+ names even split across its two sub-columns,
  // and a busy SWIM period can stack multiple sub-boxes plus a CA box on
  // top of the plain list. A single fixed height either wastes space on
  // light periods or isn't enough for heavy ones; computing per period
  // lets light rows stay compact so the heavy ones have the room they
  // actually need, without the whole sheet growing past one page.
  function columnLinesNeeded(column: ColumnKey, period: Period): number {
    const entries = grid.get(period)?.get(column) ?? [];
    const caNames = caGrid.get(period)?.get(column) ?? [];
    let lines: number;

    if (column === "ski") {
      // Split across two sub-columns, so the effective height is half the
      // total roster (rounded up), not the full list.
      lines = Math.ceil(entries.length / 2);
    } else if (column === "swim") {
      const applicableSubs = SWIM_SUBCATEGORIES.map((sub) => swimSubGrid.get(period)?.get(sub.key) ?? []).filter((list) => list.length > 0);
      lines = entries.length + applicableSubs.reduce((sum, list) => sum + 1 + list.length, 0); // +1 per sub-box for its label line
    } else if (column === "sail") {
      const dockEntries = sailDockGrid.get(period) ?? [];
      lines = entries.length + dockEntries.length;
    } else {
      lines = entries.length;
    }

    if (caNames.length) lines += caNames.length + 0.5;
    return lines;
  }

  function rowHeightIn(lines: number): number {
    const needed = 0.2 + Math.max(lines, 1) * 0.13;
    return Math.max(0.5, Math.min(3, needed));
  }

  function renderSheet(day: "A" | "B", periods: Period[]) {
    return (
      <section className="waterfront-sheet">
        <div className="waterfront-sheet-header">
          <div className="waterfront-sheet-header-left">
            <span className="waterfront-label">AQUATIC SUPER:</span>
            <span className="waterfront-blank-line">&nbsp;</span>
          </div>
          <div className="waterfront-sheet-header-center">
            WATERFRONT - DAY:&nbsp;
            <span className={day === "A" ? "waterfront-day-on" : "waterfront-day-off"}>A</span>
            &nbsp;&nbsp;
            <span className={day === "B" ? "waterfront-day-on" : "waterfront-day-off"}>B</span>
          </div>
          <div className="waterfront-sheet-header-right">
            {session?.name ?? "2026"}: Q:&nbsp;
            <span className="waterfront-q-on">1</span>
            &nbsp;&nbsp;<span className="waterfront-q-off">2</span>
            &nbsp;&nbsp;QUARTER 1
          </div>
        </div>

        <table className="waterfront-sheet-table">
          <thead>
            <tr>
              <th className="waterfront-row-num">&nbsp;</th>
              {COLUMN_ORDER.map((column) => (
                <th key={column.key} className={`waterfront-col-${column.key}`}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, periodIdx) => {
              const rowHeight = rowHeightIn(Math.max(...COLUMN_ORDER.map((column) => columnLinesNeeded(column.key, period))));
              return (
              <tr key={period} style={{ "--waterfront-row-height": `${rowHeight}in` } as CSSProperties}>
                <td className="waterfront-row-num">{periodIdx + 1}</td>
                {COLUMN_ORDER.map((column) => {
                  const entries = grid.get(period)?.get(column.key) ?? [];
                  const caNames = caGrid.get(period)?.get(column.key) ?? [];
                  // SKI gets a 2-column split inside the cell: names flow top-
                  // to-bottom in the left sub-column, then continue at the top
                  // of the right sub-column. We split the alphabetized list at
                  // the midpoint, so the alphabetical order reads down-then-
                  // across (left half is A..M, right half is N..Z, roughly).
                  const isSki = column.key === "ski";
                  const midpoint = Math.ceil(entries.length / 2);
                  const leftHalf = isSki ? entries.slice(0, midpoint) : entries;
                  const rightHalf = isSki ? entries.slice(midpoint) : [];

                  // SWIM: whichever of the four named classes actually have
                  // someone assigned this period get their own labeled
                  // sub-box, stacked below the plain leftover list. A class
                  // with nothing assigned this period is skipped entirely —
                  // no blank placeholder, unlike AQUATIC SUPER/FISH.
                  const swimSubs =
                    column.key === "swim"
                      ? SWIM_SUBCATEGORIES.map((sub) => ({ ...sub, entries: swimSubGrid.get(period)?.get(sub.key) ?? [] })).filter((sub) => sub.entries.length > 0)
                      : [];

                  // SAIL: dock staff pull out of the plain list into their
                  // own small box, grouped with the CA box (if present) in
                  // one bottom-right stack instead of two separate pinned
                  // elements competing for the same corner.
                  const sailDockEntries = column.key === "sail" ? sailDockGrid.get(period) ?? [] : [];
                  const hasBottomStack = sailDockEntries.length > 0 || caNames.length > 0;

                  return (
                    <td key={column.key} className={`waterfront-cell waterfront-col-${column.key}`}>
                      <div className="waterfront-cell-main">
                        {entries.length === 0 ? null : isSki ? (
                          <div className="waterfront-staff-ski-split">
                            <ul className="waterfront-staff-list">
                              {leftHalf.map((entry) => (
                                <li key={`${entry.lastName}-${entry.firstName}`}>
                                  {entry.isLifeguard ? "*" : ""}{entry.displayName}
                                </li>
                              ))}
                            </ul>
                            <ul className="waterfront-staff-list">
                              {rightHalf.map((entry) => (
                                <li key={`${entry.lastName}-${entry.firstName}`}>
                                  {entry.isLifeguard ? "*" : ""}{entry.displayName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <ul className="waterfront-staff-list">
                            {entries.map((entry) => (
                              <li key={`${entry.lastName}-${entry.firstName}`}>
                                {entry.isLifeguard ? "*" : ""}{entry.displayName}
                              </li>
                            ))}
                          </ul>
                        )}
                        {swimSubs.map((sub) => (
                          <div key={sub.key} className="waterfront-sub-box">
                            <div className="waterfront-sub-box-label">{sub.label}</div>
                            <ul className="waterfront-staff-list">
                              {sub.entries.map((entry) => (
                                <li key={`${entry.lastName}-${entry.firstName}`}>
                                  {entry.isLifeguard ? "*" : ""}{entry.displayName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      {hasBottomStack ? (
                        <div className="waterfront-bottom-stack">
                          {sailDockEntries.map((entry) => (
                            <div key={`${entry.lastName}-${entry.firstName}`} className="waterfront-sub-box waterfront-dock-box">
                              {entry.displayName} - dock
                            </div>
                          ))}
                          {caNames.length ? (
                            <div className="waterfront-ca-box">
                              {caNames.map((name) => <div key={name}>{name}</div>)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>

        <p className="waterfront-sheet-footer no-print"><span className="font-black">Period {day === "A" ? "1A–5A" : "1B–5B"}</span> · LG marked with *</p>
      </section>
    );
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Waterfront Staffing" eyebrow="Duty sheet for A-day and B-day">
          <PrintButton label="Print A & B sheets" />
        </PageHeader>
        <p className="mb-5 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-900">
          Two pages print: A-day and B-day. Staff are listed alphabetically by last name inside each box, with a <span className="font-black">*</span> in front of any Lifeguard. Bluegill Swim, Mac Swim, Swim I, and V-Pack each get their own small labeled box inside SWIM when someone's assigned to them that period — anything else in SWIM stays in the plain list. Sail Dock staff pull into their own small box at the bottom of SAIL ("Lastname - dock") instead of the plain list. Counselor Assistants on a Teaching Assistant registration for that period show separately in a small dotted box in the bottom-right corner of their activity's cell — visible, but kept apart from the real staff headcount. AQUATIC SUPER and FISH stay blank where no assignment exists — pen them in.
        </p>
      </div>

      <div className="waterfront-print-stack">
        {renderSheet("A", A_DAY_PERIODS)}
        {renderSheet("B", B_DAY_PERIODS)}
      </div>
    </AppShell>
  );
}
