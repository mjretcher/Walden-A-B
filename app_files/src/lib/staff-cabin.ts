import { prisma } from "@/lib/prisma";

/**
 * A staff member's cabin can come from either of two independently-edited
 * places (see the comment atop staff-quick-edit.tsx): the live,
 * session-scoped CabinStaffAssignment (Bunk Management's drag-and-drop
 * board) or the plain Staff.cabinId field (set by the CampMinder import,
 * or edited directly on the Staff Management profile page). Neither
 * auto-syncs the other -- a staff member set up via CampMinder import but
 * never touched on the Bunk Management board has a real cabin sitting on
 * Staff.cabinId with no matching CabinStaffAssignment row. Checking only
 * CabinStaffAssignment (as this app's cabin-aware reports did until now)
 * makes that staff member look cabin-less even though they aren't.
 *
 * This resolves both and merges them, with CabinStaffAssignment winning
 * when a staff member has both -- it's the one live board Mike and Area
 * Heads actually drag staff around on mid-session, so it should reflect
 * the most current disposition when the two disagree.
 */
export async function buildStaffCabinMap(sessionId: string, staffIds: string[]): Promise<Map<string, string>> {
  if (!staffIds.length) return new Map();

  const [legacyCabins, liveCabinAssignments] = await Promise.all([
    prisma.staff.findMany({
      where: { id: { in: staffIds }, cabinId: { not: null } },
      select: { id: true, cabin: { select: { name: true } } }
    }),
    prisma.cabinStaffAssignment.findMany({
      where: { sessionId, staffId: { in: staffIds } },
      select: { staffId: true, cabin: { select: { name: true } } }
    })
  ]);

  const result = new Map<string, string>();
  for (const entry of legacyCabins) {
    if (entry.cabin) result.set(entry.id, entry.cabin.name);
  }
  for (const entry of liveCabinAssignments) {
    result.set(entry.staffId, entry.cabin.name);
  }
  return result;
}
