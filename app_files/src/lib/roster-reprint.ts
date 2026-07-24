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

/**
 * A registration added or removed DIRECTLY — the registration desk, the
 * Registration Day event screen — rather than through the Switches approval
 * flow. The printed-sheet consequence is identical to a switch (the roster
 * already in a counselor's hand is now wrong), so it raises the same flag.
 *
 * Without this, ONLY switch-driven changes were ever flagged: hand-adding a
 * camper to a class left the Rosters page insisting nothing had changed.
 *
 * Callers must not flag WAITLISTED registrations — those don't change the
 * printed roster body. Accepts nullables/dupes so a caller can just pass
 * [offeringId, siblingOfferingId] for a two-period class without pre-cleaning.
 */
export async function flagRostersForRegistrationChange(params: {
  sessionId: string;
  camperId: string;
  camperName: string;
  offeringIds: (string | null | undefined)[];
  direction: RosterChangeDirection;
  actorName?: string | null;
  source?: string | null;
}) {
  const { sessionId, camperId, camperName, direction, actorName, source } = params;
  const offeringIds = Array.from(new Set(params.offeringIds.filter(Boolean))) as string[];
  if (!offeringIds.length) return;
  const verb = direction === RosterChangeDirection.REMOVED ? "removed from" : "added to";
  const sourceSuffix = source ? ` (${source})` : "";
  await prisma.rosterReprintFlag.createMany({
    data: offeringIds.map((offeringId) => ({
      sessionId,
      offeringId,
      reason: `${camperName} ${verb} this class${sourceSuffix}`,
      camperId,
      camperName,
      direction,
      decidedByName: actorName ?? null
    }))
  });
}

/**
 * A staff switch moves a staff member off one class and onto another. No
 * camper joined or left, but both printed rosters name their staff, so both
 * sheets are now wrong — hence direction UPDATED (the same "still on the
 * roster, printed detail is stale" case as a cabin change), not ADDED/REMOVED.
 *
 * camperId/camperName stay null: these flags are about a staff move, and
 * writing a staff name into camperName would make them look like camper
 * changes to the Rosters page and the Cards reprint quick-pick.
 */
export async function flagRostersForStaffSwitch(params: {
  sessionId: string;
  staffName: string;
  currentOfferingId?: string | null;
  requestedOfferingId?: string | null;
  requestedBy?: string | null;
  decidedByName?: string | null;
  reason?: string | null;
}) {
  const { sessionId, staffName, currentOfferingId, requestedOfferingId, requestedBy, decidedByName, reason } = params;
  const reasonSuffix = reason ? ` — ${reason}` : "";
  const data = [
    currentOfferingId
      ? {
          sessionId,
          offeringId: currentOfferingId,
          reason: `Staff: ${staffName} moved off this class via switch${reasonSuffix}`,
          direction: RosterChangeDirection.UPDATED,
          requestedBy: requestedBy ?? null,
          decidedByName: decidedByName ?? null
        }
      : null,
    requestedOfferingId
      ? {
          sessionId,
          offeringId: requestedOfferingId,
          reason: `Staff: ${staffName} moved onto this class via switch${reasonSuffix}`,
          direction: RosterChangeDirection.UPDATED,
          requestedBy: requestedBy ?? null,
          decidedByName: decidedByName ?? null
        }
      : null
  ].filter(Boolean) as {
    sessionId: string;
    offeringId: string;
    reason: string;
    direction: RosterChangeDirection;
    requestedBy: string | null;
    decidedByName: string | null;
  }[];
  if (!data.length) return;
  await prisma.rosterReprintFlag.createMany({ data });
}

/**
 * Shared by every "camper stayed on the roster, but something printed
 * about them is now stale" case (cabin change, nickname change) -- always
 * direction UPDATED, never ADDED/REMOVED, since nobody actually joined or
 * left. Each specific caller below just builds the human-readable reason.
 */
async function flagRostersForStaleInfo(params: {
  sessionId: string;
  camperId: string;
  camperName: string;
  offeringIds: string[];
  reason: string;
  decidedByName?: string | null;
}) {
  const { sessionId, camperId, camperName, offeringIds, reason, decidedByName } = params;
  if (!offeringIds.length) return;
  await prisma.rosterReprintFlag.createMany({
    data: offeringIds.map((offeringId) => ({
      sessionId,
      offeringId,
      reason,
      camperId,
      camperName,
      direction: RosterChangeDirection.UPDATED,
      decidedByName: decidedByName ?? null
    }))
  });
}

/**
 * When a camper's cabin changes, every activity roster they're actively
 * registered on (camper or TA role) now has a stale Cabin column -- the
 * printed sheet still shows their old cabin. This creates one flag per
 * such offering, with direction UPDATED rather than ADDED/REMOVED, since
 * the camper never actually left the roster -- only their printed cabin
 * info did. Reuses the exact same RosterReprintFlag table/banner the
 * Rosters page already shows for switches.
 */
export async function flagRostersForCabinChange(params: {
  sessionId: string;
  camperId: string;
  camperName: string;
  offeringIds: string[];
  fromCabinName: string | null;
  toCabinName: string | null;
  decidedByName?: string | null;
}) {
  const { sessionId, camperId, camperName, offeringIds, fromCabinName, toCabinName, decidedByName } = params;
  const reason = `${camperName} moved${fromCabinName ? ` from ${fromCabinName}` : ""} to ${toCabinName ?? "no cabin"}`;
  await flagRostersForStaleInfo({ sessionId, camperId, camperName, offeringIds, reason, decidedByName });
}

/**
 * Nickname prints in place of first name on rosters/cards (camperPrintName
 * in lib/camper-name.ts) -- same staleness problem as a cabin change, just
 * for the Name column instead of Cabin. camperName here should stay the
 * camper's legal name (used as the stable identifier throughout
 * RosterReprintFlag), while toNickname carries what will actually print
 * from now on.
 */
export async function flagRostersForNicknameChange(params: {
  sessionId: string;
  camperId: string;
  camperName: string;
  offeringIds: string[];
  toNickname: string | null;
  decidedByName?: string | null;
}) {
  const { sessionId, camperId, camperName, offeringIds, toNickname, decidedByName } = params;
  const reason = toNickname
    ? `${camperName} now prints as "${toNickname}"`
    : `${camperName} nickname removed — now prints as legal first name`;
  await flagRostersForStaleInfo({ sessionId, camperId, camperName, offeringIds, reason, decidedByName });
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
    // `direction: null` narrows this to genuine legacy rows (created before
    // camper tracking existed). Staff-switch flags also carry no camperName
    // by design, but they DO set direction UPDATED — without this they'd be
    // eligible here and could be rewritten into a camper ADDED/REMOVED by any
    // camper switch touching the same offering within the 5-minute window.
    where: { sessionId, resolvedAt: null, camperName: null, direction: null }
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

/**
 * Cards and rosters resolve reprint flags independently (`cardResolvedAt`
 * vs `resolvedAt`), but `cardResolvedAt` was added long after the flags
 * themselves. Without seeding, every flag ever roster-resolved in this
 * session would suddenly reappear on /cards as "schedule changed" the
 * moment the column shipped.
 *
 * So: any pre-existing flag that was already marked reprinted on the
 * roster side counts as card-resolved too. The `createdAt` cutoff keeps
 * this strictly historical — flags raised from here on out track the two
 * sides separately, which is the whole point of the second column.
 *
 * Idempotent and self-terminating: after the first pass nothing matches.
 */
const CARD_RESOLUTION_EPOCH = new Date("2026-07-24T00:00:00.000Z");

export async function seedCardReprintResolution(sessionId: string) {
  await prisma.rosterReprintFlag.updateMany({
    where: {
      sessionId,
      cardResolvedAt: null,
      resolvedAt: { not: null },
      createdAt: { lt: CARD_RESOLUTION_EPOCH }
    },
    data: { cardResolvedAt: CARD_RESOLUTION_EPOCH }
  });
}
