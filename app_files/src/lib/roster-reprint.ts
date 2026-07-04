import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * When an approved camper switch changes an offering's roster, the
 * printed sheet already handed to that area's counselors is now wrong —
 * the losing area still shows a camper who left, the gaining area is
 * missing one who joined. flagRostersForSwitch creates one flag per
 * affected offering so both area heads see "this roster needs reprinting"
 * instead of finding out the hard way at attendance time.
 */
export async function flagRostersForSwitch(params: {
  sessionId: string;
  currentOfferingId?: string | null;
  requestedOfferingId?: string | null;
}) {
  const { sessionId, currentOfferingId, requestedOfferingId } = params;
  const data = [
    currentOfferingId ? { sessionId, offeringId: currentOfferingId, reason: "Camper removed via switch" } : null,
    requestedOfferingId ? { sessionId, offeringId: requestedOfferingId, reason: "Camper added via switch" } : null
  ].filter(Boolean) as { sessionId: string; offeringId: string; reason: string }[];
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
