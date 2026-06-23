import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { staffingActivityLabel } from "@/lib/staffing-groups";

export const staffScheduleColumns = [
  "Staff",
  "Status/certification",
  ...STAFF_PERIODS.map((period) => PERIOD_LABEL[period])
] as const;

export type StaffScheduleRow = Record<(typeof staffScheduleColumns)[number], string>;

export async function buildStaffScheduleRows() {
  const session = await prisma.session.findFirst({ where: { active: true } });
  const staff = session
    ? await prisma.staff.findMany({
        where: { active: true },
        include: {
          assignments: { where: { sessionId: session.id }, include: { offering: { include: { activity: true } } } },
          offPeriods: { where: { sessionId: session.id } }
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    : [];

  const rows = staff.map((person) => {
    const assignments = new Map(person.assignments.map((assignment) => [assignment.period, staffingActivityLabel(assignment.offering.activity.name)]));
    const offPeriods = new Set(person.offPeriods.map((offPeriod) => offPeriod.period));
    const row: StaffScheduleRow = {
      Staff: `${person.firstName} ${person.lastName}`,
      "Status/certification": person.statusCertification ?? ""
    } as StaffScheduleRow;

    for (const period of STAFF_PERIODS) {
      const periodKey = String(PERIOD_LABEL[period]) as keyof StaffScheduleRow;
      row[periodKey] = String(assignments.get(period) ?? (offPeriods.has(period) ? "OFF" : ""));
    }

    return row;
  });

  return { session, rows };
}
