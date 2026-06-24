import { Period, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
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
 */
function classifyActivity(name: string): ColumnKey | null {
  const lower = name.toLowerCase();
  if (isSkiStaffingActivity(name)) return "ski"; // covers Water-skiing AND Tube
  if (/\bcrash\b/.test(lower)) return "crash";
  if (/\bfish/.test(lower)) return "fish";
  if (/\bsail/.test(lower)) return "sail";
  if (/\bkayak/.test(lower)) return "kayak";
  if (/\bcanoe/.test(lower)) return "canoe";
  if (/\bsup\b|stand[\s-]?up[\s-]?paddle/.test(lower)) return "sup";
  if (/\bswim|mackinac|blue\s*gill/.test(lower)) return "swim";
  return null;
}

type StaffEntry = { firstName: string; lastName: string; isLifeguard: boolean };

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
  const grid = new Map<Period, Map<ColumnKey, StaffEntry[]>>();
  for (const assignment of assignments) {
    const column = classifyActivity(assignment.offering.activity.name);
    if (!column) continue;

    const certText = assignment.staff.certifications.map((c) => c.name).join(" ");
    const isLifeguard = /\bLG\b|lifeguard/i.test(`${certText} ${assignment.staff.statusCertification ?? ""}`);
    const entry: StaffEntry = {
      firstName: assignment.staff.firstName,
      lastName: assignment.staff.lastName,
      isLifeguard
    };

    if (!grid.has(assignment.period)) grid.set(assignment.period, new Map());
    const periodMap = grid.get(assignment.period)!;
    if (!periodMap.has(column)) periodMap.set(column, []);
    const cellList = periodMap.get(column)!;
    // De-dupe in case the same staff appears via two offerings collapsing
    // into the same column (e.g., Water-skiing and Tube both → ski). Match
    // on the full (firstName, lastName) tuple so two different staff who
    // share a last name aren't accidentally merged.
    const isDuplicate = cellList.some(
      (existing) => existing.lastName === entry.lastName && existing.firstName === entry.firstName
    );
    if (!isDuplicate) {
      cellList.push(entry);
    }
  }

  // Sort each cell alphabetically by last name.
  for (const periodMap of grid.values()) {
    for (const list of periodMap.values()) list.sort(alphaByLastName);
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
            {session.name ?? "2026"}: Q:&nbsp;
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
            {periods.map((period, periodIdx) => (
              <tr key={period}>
                <td className="waterfront-row-num">{periodIdx + 1}</td>
                {COLUMN_ORDER.map((column) => {
                  const entries = grid.get(period)?.get(column.key) ?? [];
                  // SKI gets a 2-column split inside the cell: names flow top-
                  // to-bottom in the left sub-column, then continue at the top
                  // of the right sub-column. We split the alphabetized list at
                  // the midpoint, so the alphabetical order reads down-then-
                  // across (left half is A..M, right half is N..Z, roughly).
                  const isSki = column.key === "ski";
                  const midpoint = Math.ceil(entries.length / 2);
                  const leftHalf = isSki ? entries.slice(0, midpoint) : entries;
                  const rightHalf = isSki ? entries.slice(midpoint) : [];
                  return (
                    <td key={column.key} className={`waterfront-cell waterfront-col-${column.key}`}>
                      {entries.length === 0 ? null : isSki ? (
                        <div className="waterfront-staff-ski-split">
                          <ul className="waterfront-staff-list">
                            {leftHalf.map((entry) => (
                              <li key={`${entry.lastName}-${entry.firstName}`}>
                                {entry.isLifeguard ? "*" : ""}{entry.lastName}
                              </li>
                            ))}
                          </ul>
                          <ul className="waterfront-staff-list">
                            {rightHalf.map((entry) => (
                              <li key={`${entry.lastName}-${entry.firstName}`}>
                                {entry.isLifeguard ? "*" : ""}{entry.lastName}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <ul className="waterfront-staff-list">
                          {entries.map((entry) => (
                            <li key={`${entry.lastName}-${entry.firstName}`}>
                              {entry.isLifeguard ? "*" : ""}{entry.lastName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
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
          Two pages print: A-day and B-day. Staff are listed alphabetically by last name inside each box, with a <span className="font-black">*</span> in front of any Lifeguard. AQUATIC SUPER and FISH stay blank where no assignment exists — pen them in.
        </p>
      </div>

      <div className="waterfront-print-stack">
        {renderSheet("A", A_DAY_PERIODS)}
        {renderSheet("B", B_DAY_PERIODS)}
      </div>
    </AppShell>
  );
}
