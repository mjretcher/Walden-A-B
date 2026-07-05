import { Period } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

export type AthleticsCellEntry = { activityLabel: string; staffNames: string[] };
export type AthleticsGrid = Map<Period, Map<AthleticsStationKey, AthleticsCellEntry[]>>;

export type AthleticsAssignmentsData = {
  sessionName: string | null;
  grid: AthleticsGrid;
};

export async function buildAthleticsAssignmentsData(): Promise<AthleticsAssignmentsData> {
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) return { sessionName: null, grid: new Map() };

  const offerings = await prisma.activityOffering.findMany({
    where: { sessionId: session.id, active: true, area: { name: { equals: "Athletics", mode: "insensitive" } }, activity: { active: true } },
    select: {
      period: true,
      activity: { select: { name: true, abbreviation: true } },
      staffAssignments: { where: { staff: { active: true } }, select: { staff: { select: { firstName: true, lastName: true } } } }
    }
  });

  const grid: AthleticsGrid = new Map();
  for (const offering of offerings) {
    const station = classifyAthleticsActivity(offering.activity.name);
    if (!station) continue;

    const entry: AthleticsCellEntry = {
      activityLabel: offering.activity.abbreviation || offering.activity.name,
      staffNames: offering.staffAssignments.map((a) => a.staff.lastName).sort((a, b) => a.localeCompare(b))
    };

    if (!grid.has(offering.period)) grid.set(offering.period, new Map());
    const periodMap = grid.get(offering.period)!;
    if (!periodMap.has(station)) periodMap.set(station, []);
    periodMap.get(station)!.push(entry);
  }

  return { sessionName: session.name, grid };
}
