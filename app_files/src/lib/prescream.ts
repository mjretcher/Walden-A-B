import { Period, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * PreScream lets area heads propose staff for their own area's offerings
 * ahead of the live Scream Session event. The mechanic is intentionally
 * asymmetric:
 *
 * - The FIRST area to claim a given (staffId, period) just gets a normal
 *   StaffAssignment — identical to assigning someone directly on the live
 *   board. No separate "pending" state, no approval step.
 * - A SECOND (or third...) area contending for the same person+period
 *   doesn't overwrite or get blocked — it opens a PreScreamConflict, and
 *   the contending area's request is stored as a PreScreamClaim. The
 *   current holder is never itself stored as a claim; it's always looked
 *   up live from StaffAssignment, so it can never drift out of sync with
 *   the real board.
 * - The live Scream Session board's own assign/unassign actions are
 *   completely unaffected by any of this — they always win, and touching
 *   them from the live board auto-resolves any open conflict for that
 *   exact staff+period (see resolveConflictForLiveChange below).
 */

export async function getPreScreamBadgeCount(user: { role: UserRole; areaId?: string | null }): Promise<number> {
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) return 0;

  if (user.role === UserRole.EXECUTIVE_ADMIN) {
    return prisma.preScreamConflict.count({ where: { sessionId: session.id, resolvedAt: null } });
  }

  if (user.role === UserRole.AREA_HEAD && user.areaId) {
    return countOpenConflictsForArea(session.id, user.areaId);
  }

  return 0;
}

// An area head cares about a conflict if they're the current holder OR a
// contending claimant — either way, something they picked is unresolved.
async function countOpenConflictsForArea(sessionId: string, areaId: string): Promise<number> {
  const conflicts = await openConflictsWithHolders(sessionId);
  return conflicts.filter((c) => c.holderAreaId === areaId || c.claims.some((claim) => claim.areaId === areaId)).length;
}

export type OpenConflictWithHolder = Awaited<ReturnType<typeof openConflictsWithHolders>>[number];

// Loads open conflicts and resolves each one's "current holder" (the real,
// live StaffAssignment for that staff+period) in a single batched pass —
// avoids an N+1 query per conflict.
export async function openConflictsWithHolders(sessionId: string) {
  const conflicts = await prisma.preScreamConflict.findMany({
    where: { sessionId, resolvedAt: null },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true } },
      claims: {
        include: {
          offering: { select: { id: true, period: true, activity: { select: { name: true } } } },
          area: { select: { id: true, name: true } },
          claimedBy: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  if (!conflicts.length) return [];

  const holders = await prisma.staffAssignment.findMany({
    where: {
      sessionId,
      staffId: { in: conflicts.map((c) => c.staffId) },
      period: { in: conflicts.map((c) => c.period) }
    },
    include: { offering: { select: { id: true, period: true, activity: { select: { name: true } } } }, staff: { select: { id: true } } }
  });
  const holderByStaffPeriod = new Map(holders.map((h) => [`${h.staffId}:${h.period}`, h]));
  const areaByOfferingId = new Map<string, { id: string; name: string }>();
  for (const c of conflicts) {
    for (const claim of c.claims) {
      areaByOfferingId.set(claim.offering.id, claim.area);
    }
  }
  const holderOfferingIds = holders.map((h) => h.offeringId);
  const holderAreas = holderOfferingIds.length
    ? await prisma.activityOffering.findMany({ where: { id: { in: holderOfferingIds } }, select: { id: true, areaId: true, area: { select: { name: true } } } })
    : [];
  const holderAreaByOfferingId = new Map(holderAreas.map((o) => [o.id, o]));

  return conflicts.map((conflict) => {
    const holder = holderByStaffPeriod.get(`${conflict.staffId}:${conflict.period}`);
    const holderArea = holder ? holderAreaByOfferingId.get(holder.offeringId) : null;
    return {
      ...conflict,
      holder: holder ?? null,
      holderAreaId: holderArea?.areaId ?? null,
      holderAreaName: holderArea?.area.name ?? null
    };
  });
}

// Called from the live Scream Session board's own assign/unassign actions
// (/api/staff-assignments). The live board is always authoritative, so
// whatever it does should immediately close out any open PreScream
// conflict for that exact staff+period — PreScream data must never
// contradict what the board actually shows.
export async function resolveConflictForLiveChange(sessionId: string, staffId: string, period: Period, resolvedByUserId: string) {
  await prisma.preScreamConflict.updateMany({
    where: { sessionId, staffId, period, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId }
  });
}
