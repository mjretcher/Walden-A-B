import { WeekBlock } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * WEEK-SCOPED CABIN RESOLUTION
 *
 * For most of a session everyone sits in exactly one cabin and the two
 * scalar sources -- Camper.cabinId and CabinStaffAssignment /
 * Staff.cabinId -- are the whole truth. The final week (WK7) is the
 * exception: two-week campers go home, a handful of cabins get
 * consolidated or shut down, and some campers and staff move as a result.
 *
 * Rather than mutate the scalar fields (which would destroy the record of
 * where everyone actually was for Weeks 1-6, and silently rewrite every
 * already-printed roster and cabin sheet), the final-week picture is
 * stored as a thin OVERLAY on top of them:
 *
 *   campers -> CamperWeekEnrollment.cabinId  (column already existed)
 *   staff   -> CabinStaffWeekOverride.cabinId
 *
 * Both overlays are sparse. Absence of a row means "unchanged" and falls
 * back to the scalar. Only people who actually move are stored. The
 * scalars stay frozen at their Q3 values forever, so every existing
 * surface keeps rendering the session as it was without any changes.
 *
 * The one asymmetry worth knowing: for STAFF, an override row with a null
 * cabinId is meaningful -- it means "explicitly in no cabin this week"
 * (their cabin closed and they weren't reassigned), which is different
 * from having no row at all. For CAMPERS, a null enrollment cabinId just
 * falls back, because a camper with no cabin at all isn't a state the
 * enrollment import can produce and shouldn't be inventable here.
 */

export type WeekCabinMaps = {
  /** camperId -> cabinId (null = no cabin). Only campers enrolled that week. */
  camperCabin: Map<string, string | null>;
  /** staffId -> cabinId (null = deliberately out of cabin that week). */
  staffCabin: Map<string, string | null>;
};

/**
 * Resolve where every camper and staff member sits for one week block.
 *
 * Campers are limited to those actually enrolled in `weekBlock` -- that's
 * the point of the whole exercise, since the two-week kids have no WK7
 * enrollment and must not appear on final-week sheets. Staff have no
 * per-week enrollment concept, so every active staff member resolves to
 * something (possibly null).
 */
export async function resolveWeekCabins(sessionId: string, weekBlock: WeekBlock): Promise<WeekCabinMaps> {
  const [enrollments, staffScalars, baseAssignments, overrides] = await Promise.all([
    prisma.camperWeekEnrollment.findMany({
      where: { sessionId, weekBlock, camper: { active: true } },
      select: { camperId: true, cabinId: true, camper: { select: { cabinId: true } } }
    }),
    prisma.staff.findMany({
      where: { active: true, cabinId: { not: null } },
      select: { id: true, cabinId: true }
    }),
    prisma.cabinStaffAssignment.findMany({
      where: { sessionId },
      select: { staffId: true, cabinId: true }
    }),
    prisma.cabinStaffWeekOverride.findMany({
      where: { sessionId, weekBlock },
      select: { staffId: true, cabinId: true }
    })
  ]);

  const camperCabin = new Map<string, string | null>();
  for (const row of enrollments) {
    camperCabin.set(row.camperId, row.cabinId ?? row.camper.cabinId ?? null);
  }

  // Same precedence buildStaffCabinMap uses (board beats import/profile),
  // with the week override sitting on top of both.
  const staffCabin = new Map<string, string | null>();
  for (const row of staffScalars) staffCabin.set(row.id, row.cabinId);
  for (const row of baseAssignments) staffCabin.set(row.staffId, row.cabinId);
  for (const row of overrides) staffCabin.set(row.staffId, row.cabinId);

  return { camperCabin, staffCabin };
}

export type WeekCabinOccupancy = {
  cabinId: string;
  camperIds: string[];
  staffIds: string[];
};

/**
 * Invert the maps into per-cabin occupancy. Cabins that end the week with
 * nobody in them simply don't appear -- that IS the definition of a cabin
 * being shut down for the final week; there's no separate closed flag to
 * keep in sync with reality.
 */
export function groupByCabin(maps: WeekCabinMaps): Map<string, WeekCabinOccupancy> {
  const byCabin = new Map<string, WeekCabinOccupancy>();

  function slot(cabinId: string): WeekCabinOccupancy {
    let entry = byCabin.get(cabinId);
    if (!entry) {
      entry = { cabinId, camperIds: [], staffIds: [] };
      byCabin.set(cabinId, entry);
    }
    return entry;
  }

  for (const [camperId, cabinId] of maps.camperCabin) {
    if (cabinId) slot(cabinId).camperIds.push(camperId);
  }
  for (const [staffId, cabinId] of maps.staffCabin) {
    if (cabinId) slot(cabinId).staffIds.push(staffId);
  }

  return byCabin;
}

/** Cabin IDs a human has explicitly marked closed for this week. */
export async function getWeekClosures(sessionId: string, weekBlock: WeekBlock): Promise<Set<string>> {
  const rows = await prisma.cabinWeekClosure.findMany({
    where: { sessionId, weekBlock },
    select: { cabinId: true }
  });
  return new Set(rows.map((r) => r.cabinId));
}

/**
 * Cabins that held campers last week and hold none this week -- i.e. the
 * ones that emptied out on their own. Staff-only counts as empty: a cabin
 * with counselors but zero campers isn't operating.
 *
 * This is INFERRED closure, and it's deliberately kept separate from
 * CabinWeekClosure (explicit closure). A cabin can be either, both, or
 * neither, and the two answer different questions: "did this empty out?"
 * versus "did someone decide this is shut?" Only the explicit one blocks
 * new arrivals, because only it reflects an actual decision.
 */
export function findEmptiedCabins(current: WeekCabinMaps, final: WeekCabinMaps): Set<string> {
  const currentOccupied = new Set<string>();
  for (const cabinId of current.camperCabin.values()) if (cabinId) currentOccupied.add(cabinId);

  const finalOccupied = new Set<string>();
  for (const cabinId of final.camperCabin.values()) if (cabinId) finalOccupied.add(cabinId);

  const closing = new Set<string>();
  for (const cabinId of currentOccupied) {
    if (!finalOccupied.has(cabinId)) closing.add(cabinId);
  }
  return closing;
}

/**
 * How many WK7 enrollment rows still have no cabin stamped on them. Used
 * by the Week 7 Cabins repair tool to decide whether the one-time backfill
 * still needs running -- rows written before the overlay existed all carry
 * a null cabinId and would silently fall back to the Q3 scalar, which is
 * correct but leaves nothing to edit against.
 */
export async function countUnstampedWeekRows(sessionId: string, weekBlock: WeekBlock): Promise<number> {
  return prisma.camperWeekEnrollment.count({
    where: { sessionId, weekBlock, cabinId: null, camper: { active: true } }
  });
}
