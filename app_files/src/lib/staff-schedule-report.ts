import { Period, SwimLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, SWIM_CODE } from "@/lib/periods";
import { isSkiStaffingActivity, staffingActivityLabel } from "@/lib/staffing-groups";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";

export const staffScheduleColumns = [
  "Staff",
  "Cert",
  ...STAFF_PERIODS.map((period) => PERIOD_LABEL[period])
] as const;

export type StaffScheduleRow = Record<(typeof staffScheduleColumns)[number], string>;
// staffId rides alongside the printable columns (never rendered as a
// column itself — the page only ever iterates staffScheduleColumns) so
// the live view can match a row against Session.currentScreamStaffId for
// highlighting.
export type StaffScheduleRowWithId = StaffScheduleRow & { staffId: string };

// Only Muskie (M) and Bluegill (B) appear in the Cert column;
// Walleye / Pending stay blank because Mike doesn't post those on the wall.
// Reuses the central SWIM_CODE map from @/lib/periods so letter mapping stays
// consistent with everywhere else (camper cards, registration page, etc.).
const POSTED_SWIM_LEVELS = new Set<SwimLevel>([SwimLevel.MUSKIE, SwimLevel.BLUEGILL]);

// Twilight periods (5A/5B) at the lake area are tubing operations even though
// the staff assignment is to the same "Ski" staffing group used throughout the
// day. So at these two periods we override the display to "TUBE".
const TWILIGHT_PERIODS = new Set<Period>([Period.P5A, Period.P5B]);

/**
 * Decide the displayed label for a staff member's assignment in a given period.
 * Precedence (highest wins):
 *   1. Period override (P5A/P5B + ski-staffing activity) → "TUBE"
 *   2. Activity.abbreviation (when set, e.g. "Stand Up Paddleboard" → "SUP")
 *   3. Staffing label collapse (Ski/Tube/Water Ski all show as "Ski")
 *   4. The activity name as-is
 */
function staffPeriodLabel(period: Period, activityName: string, abbreviation: string | null | undefined) {
  if (TWILIGHT_PERIODS.has(period) && isSkiStaffingActivity(activityName)) return "TUBE";
  if (abbreviation && abbreviation.trim()) return abbreviation.trim();
  return staffingActivityLabel(activityName);
}

export async function buildStaffScheduleRows() {
  const session = await prisma.session.findFirst({ where: { active: true } });

  // Counselor Assistants should never show up on this specific report (or
  // its live view) — but they're Camper records, not Staff records, so
  // normally that would already be automatic. The reason it isn't: CAs
  // used to be routed through the staff pipeline before that was
  // corrected, which can leave a stray Staff row sitting around with the
  // same name as a real CA, disconnected from anything registration
  // actually reads but still perfectly eligible to show up here. Matching
  // by normalized name against active CA campers this session (see
  // lib/ca-staff-exclusion.ts) catches exactly those stray rows without
  // needing a manual flag on Staff.
  const caNameSet = session ? await buildCaNameSet(session.id) : new Set<string>();

  const staff = session
    ? (
        await prisma.staff.findMany({
          where: { active: true, screamEligible: true },
          include: {
            assignments: {
              where: { sessionId: session.id },
              include: { offering: { include: { activity: true } } }
            },
            offPeriods: { where: { sessionId: session.id } },
            certifications: { select: { name: true } }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        })
      ).filter((person) => !isCaStaffRecord(person, caNameSet))
    : [];

  const rows = staff.map((person) => {
    const assignments = new Map(
      person.assignments.map((assignment) => [
        assignment.period,
        staffPeriodLabel(
          assignment.period,
          assignment.offering.activity.name,
          // abbreviation is added in a forthcoming Prisma migration; cast tolerantly
          // so the type checker doesn't fail before db push applies the column.
          (assignment.offering.activity as { abbreviation?: string | null }).abbreviation ?? null
        )
      ])
    );
    const offPeriods = new Set(person.offPeriods.map((offPeriod) => offPeriod.period));

    // Cert column: "LG", "M", "B", or blank.
    // - LG implies Muskie automatically (every lifeguard is a Muskie at Walden),
    //   so an LG-tagged staff member shows ONLY "LG" — never "LG M".
    // - Non-lifeguards show their swim level (M or B) when set.
    // - Walleye / Pending are not posted.
    //
    // Lifeguard is detected from the certifications RELATION (matches what the
    // scream session board / camper screens use). The legacy statusCertification
    // text field is still consulted as a safety net for older records that have
    // "LG" only in the free-text field.
    const certText = person.certifications.map((cert) => cert.name).join(" ");
    const isLifeguard = /\bLG\b|lifeguard/i.test(`${certText} ${person.statusCertification ?? ""}`);
    let statusValue: string;
    if (isLifeguard) {
      statusValue = "LG";
    } else if (person.swimLevel && POSTED_SWIM_LEVELS.has(person.swimLevel)) {
      statusValue = SWIM_CODE[person.swimLevel];
    } else {
      statusValue = "";
    }

    const row: StaffScheduleRowWithId = {
      staffId: person.id,
      Staff: `${person.firstName} ${person.lastName}`,
      "Cert": statusValue
    } as StaffScheduleRowWithId;

    for (const period of STAFF_PERIODS) {
      const periodKey = String(PERIOD_LABEL[period]) as keyof StaffScheduleRow;
      row[periodKey] = String(assignments.get(period) ?? (offPeriods.has(period) ? "OFF" : ""));
    }

    return row;
  });

  return { session, rows };
}
