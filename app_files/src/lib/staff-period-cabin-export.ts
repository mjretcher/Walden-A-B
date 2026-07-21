import { Period } from "@prisma/client";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { prisma } from "@/lib/prisma";
import { PERIOD_DISPLAY_LABEL } from "@/lib/periods";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";
import { buildStaffCabinMap } from "@/lib/staff-cabin";

export const staffPeriodCabinColumns = ["Period", "Cabin", "Staff", "Area", "Activity"] as const;
export type StaffPeriodCabinRow = Record<(typeof staffPeriodCabinColumns)[number], string>;

/**
 * One row per staff member working a given period(s) -- the same data
 * /reports/staff-period-cabins shows on screen, reshaped for a quick
 * copy/paste-friendly export. Sorted the same way the report is: by
 * period, then cabin (no-cabin last), then name.
 */
export async function buildStaffPeriodCabinRows(periods: Period[]): Promise<StaffPeriodCabinRow[]> {
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) return [];

  const assignments = await prisma.staffAssignment.findMany({
    where: { sessionId: session.id, period: { in: periods } },
    select: {
      period: true,
      staffId: true,
      staff: { select: { id: true, firstName: true, lastName: true, position: true, position2: true, keepDespiteCaMatch: true } },
      offering: { select: { activity: { select: { name: true } }, area: { select: { name: true } } } }
    }
  });

  const caNameSet = await buildCaNameSet(session.id);
  const eligible = assignments.filter((assignment) => !isCaStaffRecord(assignment.staff, caNameSet));

  const staffIds = Array.from(new Set(eligible.map((assignment) => assignment.staffId)));
  const cabinByStaffId = await buildStaffCabinMap(session.id, staffIds);

  const rows: StaffPeriodCabinRow[] = eligible.map((assignment) => ({
    Period: PERIOD_DISPLAY_LABEL[assignment.period],
    Cabin: cabinByStaffId.get(assignment.staffId) ?? "",
    // Leadership tag (UH/UP/BSH/GSH), same convention as the cabin sheets.
    Staff: `${assignment.staff.firstName} ${assignment.staff.lastName}${staffRoleSuffix(assignment.staff)}`,
    Area: assignment.offering.area.name,
    Activity: assignment.offering.activity.name
  }));

  rows.sort((a, b) => {
    if (a.Period !== b.Period) return a.Period.localeCompare(b.Period);
    const cabinCompare = (a.Cabin || "\uffff").localeCompare(b.Cabin || "\uffff", undefined, { numeric: true });
    if (cabinCompare !== 0) return cabinCompare;
    return a.Staff.localeCompare(b.Staff);
  });

  return rows;
}
