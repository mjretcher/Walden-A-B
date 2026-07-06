import { Period, RegistrationRole, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { camperPrintName } from "@/lib/camper-name";

export const A_DAY_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A];
export const B_DAY_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B];

// More than this many activities on one sheet gets unreadable no matter how
// small the font goes, so past this point the sheet splits into multiple
// column-groups (each its own A/B page pair) instead of shrinking forever.
// Waterfront tops out at 8 fixed columns; this is a bit more generous since
// the other areas' columns are single-width (no SKI-style double column).
const MAX_COLUMNS_PER_SHEET = 10;

export type AreaStaffingColumn = { key: string; label: string };
export type AreaStaffingEntry = { firstName: string; lastName: string; displayName: string };
export type AreaStaffingGrid = Map<Period, Map<string, AreaStaffingEntry[]>>;
// Counselor Assistants, kept separate from AreaStaffingGrid — sourced from
// Teaching Assistant registrations on the camper's record, not
// StaffAssignment, and rendered as a visibly distinct "box within a box"
// rather than mixed into the real staff list (see sheetSizeClass/rowHeightIn
// below and the CA box CSS in globals.css).
export type AreaCaGrid = Map<Period, Map<string, string[]>>;

export type AreaStaffingData = {
  sessionName: string | null;
  columns: AreaStaffingColumn[];
  grid: AreaStaffingGrid;
  caGrid: AreaCaGrid;
  maxCellEntries: number;
  maxCaEntries: number;
};

function alphaByLastName(a: AreaStaffingEntry, b: AreaStaffingEntry) {
  const lastA = a.lastName.toLowerCase();
  const lastB = b.lastName.toLowerCase();
  if (lastA !== lastB) return lastA < lastB ? -1 : 1;
  return a.firstName.toLowerCase() < b.firstName.toLowerCase() ? -1 : 1;
}

/**
 * Builds the same kind of period-by-activity staffing grid as the
 * Waterfront duty sheet, but for any area — generalized rather than
 * hand-classified, since (unlike Waterfront) there's no pre-existing paper
 * form with a fixed, known set of named columns to match for these areas.
 * Columns are every activity actually offered in this area this session
 * (whether or not it currently has staff assigned — an empty column is
 * exactly where Mike pens someone in, same as Waterfront's blank AQUATIC
 * SUPER/FISH), so the sheet stays accurate as Menu Builder changes.
 */
export async function buildAreaStaffingData(areaName: string): Promise<AreaStaffingData> {
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) return { sessionName: null, columns: [], grid: new Map(), caGrid: new Map(), maxCellEntries: 0, maxCaEntries: 0 };

  const [offerings, assignments, caRegistrations] = await Promise.all([
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, active: true, area: { name: { equals: areaName, mode: "insensitive" } }, activity: { active: true } },
      select: { activityId: true, activity: { select: { name: true } } }
    }),
    prisma.staffAssignment.findMany({
      where: {
        sessionId: session.id,
        offering: { area: { name: { equals: areaName, mode: "insensitive" } }, active: true },
        staff: { active: true }
      },
      include: {
        staff: { select: { firstName: true, lastName: true } },
        offering: { select: { activityId: true } }
      }
    }),
    prisma.registration.findMany({
      where: {
        sessionId: session.id,
        registrationRole: RegistrationRole.TEACHING_ASSISTANT,
        status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] },
        offering: { area: { name: { equals: areaName, mode: "insensitive" } }, active: true }
      },
      include: {
        camper: { select: { firstName: true, lastName: true, nickname: true } },
        offering: { select: { period: true, activityId: true } }
      }
    })
  ]);

  const columnLabelById = new Map<string, string>();
  for (const offering of offerings) columnLabelById.set(offering.activityId, offering.activity.name);
  const columns: AreaStaffingColumn[] = Array.from(columnLabelById.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const grid: AreaStaffingGrid = new Map();
  for (const assignment of assignments) {
    const columnKey = assignment.offering.activityId;
    if (!columnLabelById.has(columnKey)) continue;

    const entry: AreaStaffingEntry = {
      firstName: assignment.staff.firstName,
      lastName: assignment.staff.lastName,
      displayName: assignment.staff.lastName
    };

    if (!grid.has(assignment.period)) grid.set(assignment.period, new Map());
    const periodMap = grid.get(assignment.period)!;
    if (!periodMap.has(columnKey)) periodMap.set(columnKey, []);
    const cellList = periodMap.get(columnKey)!;
    const isDuplicate = cellList.some((existing) => existing.lastName === entry.lastName && existing.firstName === entry.firstName);
    if (!isDuplicate) cellList.push(entry);
  }

  let maxCellEntries = 0;
  for (const periodMap of grid.values()) {
    for (const list of periodMap.values()) {
      list.sort(alphaByLastName);
      maxCellEntries = Math.max(maxCellEntries, list.length);
      const lastNameCounts = new Map<string, number>();
      for (const entry of list) lastNameCounts.set(entry.lastName.toLowerCase(), (lastNameCounts.get(entry.lastName.toLowerCase()) ?? 0) + 1);
      for (const entry of list) {
        const isDup = (lastNameCounts.get(entry.lastName.toLowerCase()) ?? 0) > 1;
        entry.displayName = isDup ? `${entry.lastName} ${(entry.firstName[0] ?? "").toUpperCase()}.` : entry.lastName;
      }
    }
  }

  const caGrid: AreaCaGrid = new Map();
  for (const registration of caRegistrations) {
    const columnKey = registration.offering.activityId;
    if (!columnLabelById.has(columnKey)) continue;

    const name = camperPrintName(registration.camper);
    if (!caGrid.has(registration.offering.period)) caGrid.set(registration.offering.period, new Map());
    const periodMap = caGrid.get(registration.offering.period)!;
    if (!periodMap.has(columnKey)) periodMap.set(columnKey, []);
    const cellList = periodMap.get(columnKey)!;
    if (!cellList.includes(name)) cellList.push(name);
  }
  let maxCaEntries = 0;
  for (const periodMap of caGrid.values()) {
    for (const list of periodMap.values()) {
      list.sort((a, b) => a.localeCompare(b));
      maxCaEntries = Math.max(maxCaEntries, list.length);
    }
  }

  return { sessionName: session.name, columns, grid, caGrid, maxCellEntries, maxCaEntries };
}

/** Splits columns into groups of at most MAX_COLUMNS_PER_SHEET, so a
 * large activity roster becomes multiple readable pages instead of one
 * illegibly cramped one. Areas under the limit get a single group (one
 * sheet per day, same as Waterfront). */
export function groupColumns(columns: AreaStaffingColumn[]): AreaStaffingColumn[][] {
  if (columns.length <= MAX_COLUMNS_PER_SHEET) return columns.length ? [columns] : [];
  const groups: AreaStaffingColumn[][] = [];
  for (let i = 0; i < columns.length; i += MAX_COLUMNS_PER_SHEET) {
    groups.push(columns.slice(i, i + MAX_COLUMNS_PER_SHEET));
  }
  return groups;
}

/** Size tier by column count on THIS sheet (post-split) — mirrors the
 * roster-size-lg/md/sm pattern used elsewhere: fewer columns get a roomier,
 * more readable layout; only a genuinely packed sheet uses the tight tier. */
export function sheetSizeClass(columnCount: number): "area-sheet-size-lg" | "area-sheet-size-md" | "area-sheet-size-sm" {
  if (columnCount <= 5) return "area-sheet-size-lg";
  if (columnCount <= 8) return "area-sheet-size-md";
  return "area-sheet-size-sm";
}

/** Row height (inches) sized to the tallest cell actually on the sheet,
 * rather than a fixed guess — an area where every activity has 1-2 staff
 * shouldn't get Waterfront's SKI-sized rows, and one with a deep roster
 * in some activities needs more than Waterfront's default. maxCaEntries
 * factors in the CA box's own space requirement when at least one exists,
 * so a row with a CA present doesn't end up cramped. */
export function rowHeightIn(maxCellEntries: number, maxCaEntries: number = 0): number {
  const caAllowance = maxCaEntries > 0 ? maxCaEntries * 0.14 + 0.08 : 0;
  return Math.max(0.55, Math.min(1.4, 0.22 * Math.max(maxCellEntries, 1) + 0.35 + caAllowance));
}
