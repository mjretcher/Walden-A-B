import { prisma } from "@/lib/prisma";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { PERIOD_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS } from "@/lib/periods";
import { getSlotTimes, periodSlot } from "@/lib/period-times";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";

/**
 * Shared data builder for the Staff Off Periods report. The page at
 * /reports/staff-off-periods and the export API at
 * /api/exports/staff-off-periods both render the same underlying dataset,
 * so the query + shaping lives here once instead of drifting in two places.
 * Read-only: this never writes to StaffAssignment or StaffOffPeriod.
 */

export type StaffOffPeriodsPerson = {
  id: string;
  name: string;
  areaName: string | null;
  periods: { period: string; assignedActivity: string | null; isOff: boolean }[];
};

export type StaffOffPeriodMeta = { period: string; label: string; timeLabel: string; isTwilight: boolean };

export type StaffOffPeriodsData = {
  sessionName: string;
  people: StaffOffPeriodsPerson[];
  periodMeta: StaffOffPeriodMeta[];
};

export async function buildStaffOffPeriodsData(): Promise<StaffOffPeriodsData | null> {
  const [session, slotTimes] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    getSlotTimes()
  ]);
  if (!session) return null;

  const caNameSet = await buildCaNameSet(session.id);
  const staffRows = await prisma.staff.findMany({
    where: { active: true, screamEligible: true },
    include: {
      primaryArea: { select: { name: true } },
      assignments: { where: { sessionId: session.id }, include: { offering: { include: { activity: { select: { name: true } } } } } },
      offPeriods: { where: { sessionId: session.id } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const people: StaffOffPeriodsPerson[] = staffRows
    .filter((person) => !isCaStaffRecord(person, caNameSet))
    .map((person) => {
      const assignmentByPeriod: Record<string, string> = {};
      for (const assignment of person.assignments) {
        assignmentByPeriod[assignment.period] = assignment.offering.activity.name;
      }
      const offPeriodSet = new Set(person.offPeriods.map((entry) => entry.period));
      return {
        id: person.id,
        // Leadership tag (UH/UP/BSH/GSH) rides on the display name -- same
        // convention as the printed cabin sheets.
        name: `${person.firstName} ${person.lastName}${staffRoleSuffix(person)}`,
        areaName: person.primaryArea?.name ?? null,
        periods: STAFF_PERIODS.map((period) => ({
          period,
          assignedActivity: assignmentByPeriod[period] ?? null,
          isOff: offPeriodSet.has(period)
        }))
      };
    });

  const periodMeta: StaffOffPeriodMeta[] = STAFF_PERIODS.map((period) => ({
    period,
    label: PERIOD_LABEL[period],
    timeLabel: slotTimes[periodSlot(period)]?.label ?? "",
    isTwilight: TWILIGHT_PERIODS.includes(period)
  }));

  return { sessionName: session.name, people, periodMeta };
}

/**
 * Normalize a user-supplied periods query param ("1A,2A" or "P1A,P2A",
 * any case) down to the set of valid STAFF_PERIODS enum strings, preserving
 * canonical period order. Returns all staff periods when the param is
 * missing/empty or contains nothing valid — an export with zero periods is
 * never what anyone meant.
 */
export function parsePeriodsParam(raw: string | null): string[] {
  const all = STAFF_PERIODS.map((period) => period as string);
  if (!raw) return all;
  const wanted = new Set(
    raw
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
      .map((token) => (token.startsWith("P") ? token : `P${token}`))
  );
  const filtered = all.filter((period) => wanted.has(period));
  return filtered.length > 0 ? filtered : all;
}
