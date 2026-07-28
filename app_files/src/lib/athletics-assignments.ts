import { Period, RegistrationRole, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { camperPrintName } from "@/lib/camper-name";
import { departureNote } from "@/lib/week-enrollment";

export const A_DAY_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A];
export const B_DAY_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B];

/**
 * The Athletics Assignments sheet is structurally different from every
 * other staffing report in this app: rows are fixed physical STATIONS
 * (matching Mike's actual paper form), columns are periods, and each cell
 * shows WHICH ACTIVITY is running at that station that period — not who's
 * staffing it. Waterfront's duty sheet (and the generic version built for
 * the other 5 areas) is the opposite shape: fixed columns, staff names in
 * the cells.
 *
 * This is a best-effort reconstruction of Mike's paper form from a photo,
 * not a spec he dictated field-by-field — the row labels are what I could
 * read (SBK, BBALL, Tennis, PBALL, ARCH, FENCE, GYMN, a shared VB/Lax/
 * Frisbee/Golf field row, SOCC, and a Fitness/Circuits/Run row), and the
 * classification below is my best guess at which real activity names
 * belong at each station based on what was actually sitting in each box
 * in the photo (e.g. "AFAR" was shown in the Tennis row for one period,
 * so it's matched there). If something lands in the wrong row, it's a
 * one-line regex fix here, not a redesign — tell me which activity and
 * which row it should be instead.
 */
export type AthleticsStationKey = "diamond" | "basketball" | "tennis" | "pickleball" | "archery" | "fencing" | "gymnastics" | "field" | "soccer" | "fitness";

export const ATHLETICS_STATIONS: { key: AthleticsStationKey; label: string; match: (name: string) => boolean }[] = [
  { key: "diamond", label: "SBK", match: (n) => /\bsoftball\b|\bbaseball\b|\bkickball\b|\bwh?iffle\s*ball\b/i.test(n) },
  { key: "basketball", label: "BBALL", match: (n) => /\bbasketball\b|\bb[-\s]?ball\b/i.test(n) },
  { key: "tennis", label: "Tennis", match: (n) => /\btennis\b|\bafar\b/i.test(n) },
  { key: "pickleball", label: "PBALL", match: (n) => /\bpickleball\b|\bp[-\s]?ball\b/i.test(n) },
  { key: "archery", label: "ARCH", match: (n) => /\barchery\b/i.test(n) },
  { key: "fencing", label: "FENCE", match: (n) => /\bfenc(e|ing)\b/i.test(n) },
  { key: "gymnastics", label: "GYMN", match: (n) => /\bgymnastics\b/i.test(n) },
  { key: "field", label: "VB \u00b7 Lax \u00b7 Fr \u00b7 Golf", match: (n) => /\bvolleyball\b|\blacrosse\b|\blax\b|\bfrisbee\b|\bultimate\b|\bgolf\b|\bbfar\b/i.test(n) },
  { key: "soccer", label: "SOCC", match: (n) => /\bsoccer\b|\bflag\s*football\b|\brounds?\b/i.test(n) },
  { key: "fitness", label: "Fit \u00b7 Circuits \u00b7 Run", match: (n) => /\bfit(ness)?\b|\bcircuit\b|\bweight\s*train(ing)?\b|\brun(ning)?\b|\bbik(e|ing)\b|\bcycl(e|ing)\b/i.test(n) }
];

function classifyAthleticsActivity(name: string): AthleticsStationKey | null {
  for (const station of ATHLETICS_STATIONS) {
    if (station.match(name)) return station.key;
  }
  return null;
}

// finalWeekCount: how many of camperCount are still here for the FINAL week
// of the session -- the second, smaller number in the cell. "Still here" is
// `departureNote(weekEnrollments) === null` from lib/week-enrollment.ts, the
// same shared rule the roster prints and Final Week Class Sizes use, so this
// number can't drift from theirs. That rule treats a camper with NO week rows
// as STAYING, deliberately: absent data must not shrink a class on paper.
export type AthleticsCellEntry = { activityLabel: string; staffNames: string[]; camperCount: number; finalWeekCount: number };
export type AthleticsGrid = Map<Period, Map<AthleticsStationKey, AthleticsCellEntry[]>>;
// Counselor Assistants, kept in their own grid rather than folded into
// AthleticsCellEntry — they come from a Teaching Assistant registration on
// the camper's record, not a StaffAssignment, and Mike wants them visibly
// separate from the real staff headcount (a dotted box in the cell, not
// mixed into the staff list), not just visually distinguished within it.
export type AthleticsCaGrid = Map<Period, Map<AthleticsStationKey, string[]>>;

export type AthleticsAssignmentsData = {
  sessionName: string | null;
  grid: AthleticsGrid;
  caGrid: AthleticsCaGrid;
};

export async function buildAthleticsAssignmentsData(): Promise<AthleticsAssignmentsData> {
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) return { sessionName: null, grid: new Map(), caGrid: new Map() };

  const [offerings, caRegistrations] = await Promise.all([
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { name: { equals: "Athletics", mode: "insensitive" } }, activity: { active: true } },
      select: {
        period: true,
        activity: { select: { name: true, abbreviation: true } },
        staffAssignments: { where: { staff: { active: true, screamEligible: true } }, select: { staff: { select: { firstName: true, lastName: true } } } },
        // Rostered campers for the bubbles — CAMPER role, ACTIVE/OVERRIDDEN
        // only (same "rostered" definition as everywhere else). Teaching
        // Assistants are excluded here since they render as the CA box, not
        // part of the class headcount.
        //
        // These are fetched as rows rather than a Prisma _count because the
        // cell needs TWO tallies off the same relation (all rostered, and just
        // the final-week ones), and _count.select can only hold one filter per
        // relation name. Counting in memory also guarantees both numbers come
        // from an identical row set.
        registrations: {
          where: { registrationRole: RegistrationRole.CAMPER, status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] } },
          select: { camper: { select: { weekEnrollments: { where: { sessionId: session.id }, select: { weekBlock: true } } } } }
        }
      }
    }),
    prisma.registration.findMany({
      where: {
        sessionId: session.id,
        registrationRole: RegistrationRole.TEACHING_ASSISTANT,
        status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] },
        offering: { area: { name: { equals: "Athletics", mode: "insensitive" } }, active: true }
      },
      include: {
        camper: { select: { firstName: true, lastName: true, nickname: true } },
        offering: { select: { period: true, activity: { select: { name: true } } } }
      }
    })
  ]);

  const grid: AthleticsGrid = new Map();
  for (const offering of offerings) {
    const station = classifyAthleticsActivity(offering.activity.name);
    if (!station) continue;

    const entry: AthleticsCellEntry = {
      activityLabel: offering.activity.abbreviation || offering.activity.name,
      staffNames: offering.staffAssignments.map((a) => a.staff.lastName).sort((a, b) => a.localeCompare(b)),
      camperCount: offering.registrations.length,
      finalWeekCount: offering.registrations.filter(
        (registration) => departureNote(registration.camper.weekEnrollments) === null
      ).length
    };

    if (!grid.has(offering.period)) grid.set(offering.period, new Map());
    const periodMap = grid.get(offering.period)!;
    if (!periodMap.has(station)) periodMap.set(station, []);
    periodMap.get(station)!.push(entry);
  }

  const caGrid: AthleticsCaGrid = new Map();
  for (const registration of caRegistrations) {
    const station = classifyAthleticsActivity(registration.offering.activity.name);
    if (!station) continue;

    const name = camperPrintName(registration.camper);
    if (!caGrid.has(registration.offering.period)) caGrid.set(registration.offering.period, new Map());
    const periodMap = caGrid.get(registration.offering.period)!;
    if (!periodMap.has(station)) periodMap.set(station, []);
    const cellList = periodMap.get(station)!;
    if (!cellList.includes(name)) cellList.push(name);
  }
  for (const periodMap of caGrid.values()) {
    for (const list of periodMap.values()) list.sort((a, b) => a.localeCompare(b));
  }

  return { sessionName: session.name, grid, caGrid };
}

/** How many text lines a single cell needs: one for the activity, one more
 * if it has staff, plus a little extra for the divider between multiple
 * entries sharing a station+period. Used to size each station row to its
 * own busiest cell instead of guessing one fixed height for all 10 rows —
 * a station that's just "ARCH: Smith" every period shouldn't get the same
 * tall row as one juggling two activities with three staff between them. */
export function cellLines(entries: AthleticsCellEntry[]): number {
  if (!entries.length) return 0;
  const contentLines = entries.reduce((sum, entry) => sum + 1 + (entry.staffNames.length ? 1 : 0), 0);
  const dividerAllowance = (entries.length - 1) * 0.6;
  return contentLines + dividerAllowance;
}

export function rowLinesNeeded(grid: AthleticsGrid, caGrid: AthleticsCaGrid, stationKey: AthleticsStationKey, periods: Period[]): number {
  let max = 0;
  for (const period of periods) {
    const lines = cellLines(grid.get(period)?.get(stationKey) ?? []);
    const caNames = caGrid.get(period)?.get(stationKey) ?? [];
    // The CA box adds one line per name plus a little breathing room for
    // its border/margin — only counted when there's actually a CA there.
    const caLines = caNames.length ? caNames.length + 0.5 : 0;
    max = Math.max(max, lines + caLines);
  }
  return max;
}
