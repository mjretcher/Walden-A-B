import { Period } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";

// Optionals only ever run during camper class periods -- Twilight (P5A/P5B)
// is staff-only and campers are with their cabins, same convention Rosters
// and Trip Planner already use (see CAMPER_PERIODS in lib/periods.ts).
export const OPTIONALS_A_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
export const OPTIONALS_B_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];
export const OPTIONALS_PERIODS: Period[] = [...OPTIONALS_A_PERIODS, ...OPTIONALS_B_PERIODS];

export function optionalsAssignmentRowKey(period: string, index: number) {
  return `${period}:${index}`;
}

export type OptionalsAvailabilityEntry = { id: string; name: string; detail: string };

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * For every period that has at least one optional actually scheduled (a
 * saved row with a non-empty label), finds staff who are free to help run
 * it right now: staff marked off that period (Scream Session's "Off
 * Period"), or staff whose Scream Session assignment that period is to an
 * activity that ISN'T one of the ones going as an optional -- meaning
 * their regular class isn't running this period and they're not actually
 * tied up.
 *
 * Matching an assignment's activity against a going label is
 * case-insensitive/trimmed string comparison -- Optionals rows are
 * free-typed (see OptionalsAssignmentRow), so a label that doesn't match
 * the real Activity name (a typo, a shorthand) will show that staff
 * member as "elsewhere" even when their class actually is the one going.
 * Picking from the row's activity datalist (real activity names) avoids
 * this in the common case.
 *
 * Returns only periods that had at least one going optional -- a period
 * nobody's touched yet has no meaningful "who's free" answer, so it's
 * left out rather than listing every staff member on the schedule.
 */
export async function buildOptionalsAvailability(
  sessionId: string,
  rows: { period: Period; label: string }[]
): Promise<Map<Period, OptionalsAvailabilityEntry[]>> {
  const goingLabelsByPeriod = new Map<Period, Set<string>>();
  for (const row of rows) {
    if (!row.label.trim()) continue;
    const set = goingLabelsByPeriod.get(row.period) ?? new Set<string>();
    set.add(normalizeLabel(row.label));
    goingLabelsByPeriod.set(row.period, set);
  }
  const periodsWithOptionals = Array.from(goingLabelsByPeriod.keys());
  if (!periodsWithOptionals.length) return new Map();

  const caNameSet = await buildCaNameSet(sessionId);

  const [offPeriodRows, assignmentRows] = await Promise.all([
    prisma.staffOffPeriod.findMany({
      where: { sessionId, period: { in: periodsWithOptionals } },
      include: { staff: { select: { id: true, firstName: true, lastName: true } } }
    }),
    prisma.staffAssignment.findMany({
      where: { sessionId, period: { in: periodsWithOptionals } },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
        offering: { select: { activity: { select: { name: true } } } }
      }
    })
  ]);

  const result = new Map<Period, OptionalsAvailabilityEntry[]>();
  for (const period of periodsWithOptionals) {
    const goingLabels = goingLabelsByPeriod.get(period)!;
    const entries: OptionalsAvailabilityEntry[] = [];

    for (const offPeriod of offPeriodRows.filter((entry) => entry.period === period)) {
      if (isCaStaffRecord(offPeriod.staff, caNameSet)) continue;
      entries.push({ id: offPeriod.staff.id, name: `${offPeriod.staff.firstName} ${offPeriod.staff.lastName}`, detail: "Off" });
    }

    for (const assignment of assignmentRows.filter((entry) => entry.period === period)) {
      if (isCaStaffRecord(assignment.staff, caNameSet)) continue;
      const activityName = assignment.offering.activity.name;
      if (!goingLabels.has(normalizeLabel(activityName))) {
        entries.push({ id: assignment.staff.id, name: `${assignment.staff.firstName} ${assignment.staff.lastName}`, detail: `Not running: ${activityName}` });
      }
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    result.set(period, entries);
  }

  return result;
}
