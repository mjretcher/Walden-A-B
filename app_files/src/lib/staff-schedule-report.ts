import { SwimLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, SWIM_CODE } from "@/lib/periods";
import { staffingActivityLabel } from "@/lib/staffing-groups";

export const staffScheduleColumns = [
  "Staff",
  "Status/certification",
  ...STAFF_PERIODS.map((period) => PERIOD_LABEL[period])
] as const;

export type StaffScheduleRow = Record<(typeof staffScheduleColumns)[number], string>;

// Only Muskie (M) and Bluegill (B) appear in the Status/certification column;
// Walleye / Pending stay blank because Mike doesn't post those on the wall.
// Reuses the central SWIM_CODE map from @/lib/periods so letter mapping stays
// consistent with everywhere else (camper cards, registration page, etc.).
const POSTED_SWIM_LEVELS = new Set<SwimLevel>([SwimLevel.MUSKIE, SwimLevel.BLUEGILL]);

export async function buildStaffScheduleRows() {
  const session = await prisma.session.findFirst({ where: { active: true } });
  const staff = session
    ? await prisma.staff.findMany({
        where: { active: true, screamEligible: true },
        include: {
          assignments: { where: { sessionId: session.id }, include: { offering: { include: { activity: true } } } },
          offPeriods: { where: { sessionId: session.id } },
          certifications: { select: { name: true } }
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    : [];

  const rows = staff.map((person) => {
    const assignments = new Map(person.assignments.map((assignment) => [assignment.period, staffingActivityLabel(assignment.offering.activity.name)]));
    const offPeriods = new Set(person.offPeriods.map((offPeriod) => offPeriod.period));

    // Status/certification combines lifeguard cert and swim level: "LG", "M",
    // "B", "LG M", or "LG B". Blank if neither is set.
    // Lifeguard is detected from the certifications RELATION (matches what the
    // scream session board / camper screens use) — not just the free-text
    // statusCertification field, which is stale or empty for many staff.
    const certText = person.certifications.map((cert) => cert.name).join(" ");
    const isLifeguard = /\bLG\b|lifeguard/i.test(`${certText} ${person.statusCertification ?? ""}`);
    // Business rule: ALL lifeguards are automatically Muskies. So an LG-tagged
    // staff member always gets "M" appended regardless of (or in the absence
    // of) an explicit swimLevel on file.
    const explicitSwimCode = person.swimLevel && POSTED_SWIM_LEVELS.has(person.swimLevel)
      ? SWIM_CODE[person.swimLevel]
      : "";
    const swimCode = isLifeguard ? "M" : explicitSwimCode;
    const statusParts = [isLifeguard ? "LG" : "", swimCode].filter(Boolean);

    const row: StaffScheduleRow = {
      Staff: `${person.firstName} ${person.lastName}`,
      "Status/certification": statusParts.join(" ")
    } as StaffScheduleRow;

    for (const period of STAFF_PERIODS) {
      const periodKey = String(PERIOD_LABEL[period]) as keyof StaffScheduleRow;
      row[periodKey] = String(assignments.get(period) ?? (offPeriods.has(period) ? "OFF" : ""));
    }

    return row;
  });

  return { session, rows };
}
