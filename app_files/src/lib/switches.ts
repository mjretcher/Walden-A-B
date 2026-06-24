import { SwitchStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Count of pending switch requests that require *this* user's attention.
 *
 * Area heads only see switches routed into their own area (matching the hub
 * pending queue scoping); exec admins see the global pending count. Anyone
 * else (e.g. counselors) gets 0 — they can't act on switches.
 */
export async function getPendingSwitchCount(user: { role: UserRole; areaId?: string | null }): Promise<number> {
  if (user.role === UserRole.AREA_HEAD) {
    if (!user.areaId) return 0;
    const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
    if (!session) return 0;
    return prisma.switchRequest.count({
      where: { sessionId: session.id, status: SwitchStatus.PENDING, requestedOffering: { areaId: user.areaId } }
    });
  }

  if (user.role === UserRole.EXECUTIVE_ADMIN) {
    const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
    if (!session) return 0;
    return prisma.switchRequest.count({ where: { sessionId: session.id, status: SwitchStatus.PENDING } });
  }

  return 0;
}
