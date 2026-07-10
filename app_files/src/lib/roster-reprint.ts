import { RosterChangeDirection, SwitchType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * When an approved camper switch changes an offering's roster, the
 * printed sheet already handed to that area's counselors is now wrong —
 * the losing area still shows a camper who left, the gaining area is
 * missing one who joined. flagRostersForSwitch creates one flag per
 * affected offering so both area heads see "this roster needs reprinting"
 * instead of finding out the hard way at attendance time.
 *
 * Also carries the camper name, requestedBy, decidedByName, and switch
 * reason (all of which the caller already has on hand) so the roster page
 * can show a per-camper "NEW" marker plus a compact what/why/who footnote,
 * instead of just a generic "something changed" banner.
 */
export async function flagRostersForSwitch(params: {
  sessionId: string;
  camperId: string;
  camperName: string;
  currentOfferingId?: string | null;
  requestedOfferingId?: string | null;
  requestedBy?: string | null;
  decidedByName?: string | null;
  reason?: string | null;
}) {
  const { sessionId, camperId, camperName, currentOfferingId, requestedOfferingId, requestedBy, decidedByName, reason } = params;
  const reasonSuffix = reason ? ` — ${reason}` : "";
  const data = [
    currentOfferingId
      ? {
          sessionId,
          offeringId: currentOfferingId,
          reason: `${camperName} removed via switch${reasonSuffix}`,
          camperId,
          camperName,
          direction: RosterChangeDirection.REMOVED,
          requestedBy: requestedBy ?? null,
          decidedByName: decidedByName ?? null
        }
      : null,
    requestedOfferingId
      ? {
          sessionId,
          offeringId: requestedOfferingId,
          reason: `${camperName} added via switch${reasonSuffix}`,
          camperId,
          camperName,
          direction: RosterChangeDirection.ADDED,
          requestedBy: requestedBy ?? null,
          decidedByName: decidedByName ?? null
        }
      : null
  ].filter(Boolean) as {
    sessionId: string;
    offeringId: string;
    reason: string;
    camperId: string;
    camperName: string;
    direction: RosterChangeDirection;
    requestedBy: string | null;
    decidedByName: string | null;
  }[];
  if (!data.length) return;
  await prisma.rosterReprintFlag.createMany({ data });
}

export async function getRosterReprintBadgeCount(user: { role: UserRole; areaId?: string | null }): Promise<number> {
  if (user.role === UserRole.AREA_HEAD && !user.areaId) return 0;
  if (user.role !== UserRole.EXECUTIVE_ADMIN && user.role !== UserRole.AREA_HEAD) return 0;

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) return 0;

  // Count distinct OFFERINGS needing reprint, not raw flag rows — two
  // switches touching the same offering should still read as "1 roster",
  // matching what the Rosters page will actually show as one card.
  const flags = await prisma.rosterReprintFlag.findMany({
    where: {
      sessionId: session.id,
      resolvedAt: null,
      ...(user.role === UserRole.AREA_HEAD ? { offering: { areaId: user.areaId! } } : {})
    },
    select: { offeringId: true }
  });
  return new Set(flags.map((f) => f.offeringId)).size;
}

/**
 * Self-healing backfill for RosterReprintFlag rows created before camper-
 * name tracking existed on this model (camperName/direction/requestedBy/
 * decidedByName were added later — see schema.prisma). Reconnects each
 * untracked flag to the SwitchRequest that actually created it (same
 * offering, closest decidedAt to the flag's own createdAt) and fills in
 * the missing detail from there, instead of leaving it stuck showing
 * "before this detail was tracked" forever.
 *
 * Safe to call on every /rosters load: the query only ever matches rows
 * still missing camperName, so once a flag is backfilled (or was never
 * missing data to begin with) this is a fast no-op for it.
 */
export async function backfillUntrackedReprintFlags(sessionId: string) {
  const untracked = await prisma.rosterReprintFlag.findMany({
    where: { sessionId, resolvedAt: null, camperName: null }
  });
  if (!untracked.length) return;

  for (const flag of untracked) {
    const candidates = await prisma.switchRequest.findMany({
      where: {
        sessionId,
        type: SwitchType.CAMPER,
        OR: [{ currentOfferingId: flag.offeringId }, { requestedOfferingId: flag.offeringId }]
      },
      include: { camper: { select: { firstName: true, lastName: true } }, decidedBy: { select: { name: true } } }
    });

    let best: (typeof candidates)[number] | null = null;
    let bestDiffMs = Infinity;
    for (const candidate of candidates) {
      const timestamp = candidate.decidedAt ?? candidate.updatedAt;
      const diffMs = Math.abs(timestamp.getTime() - flag.createdAt.getTime());
      if (diffMs < bestDiffMs) {
        bestDiffMs = diffMs;
        best = candidate;
      }
    }

    // Only accept a plausible match — within 5 minutes of the flag's own
    // creation — so an old flag never gets wrongly attributed to some
    // unrelated switch that happens to touch the same offering.
    if (best && best.camper && bestDiffMs <= 5 * 60 * 1000) {
      const direction = best.currentOfferingId === flag.offeringId ? RosterChangeDirection.REMOVED : RosterChangeDirection.ADDED;
      await prisma.rosterReprintFlag.update({
        where: { id: flag.id },
        data: {
          camperId: best.camperId,
          camperName: `${best.camper.firstName} ${best.camper.lastName}`,
          direction,
          requestedBy: best.requestedBy,
          decidedByName: best.decidedBy?.name ?? null
        }
      });
    }
  }
}
