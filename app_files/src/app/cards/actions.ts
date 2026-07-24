"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Clears the card-reprint flag for a set of campers. Same deliberate
 * "I printed these" click as the Rosters banner — there's no way to
 * detect an actual browser print job.
 *
 * Deliberately writes `cardResolvedAt` only. A camper's registration card
 * and the class roster they moved on/off of go stale from the same event
 * but get reprinted by different people at different times, so clearing
 * the card side must leave the Rosters banner exactly where it was.
 */
export async function markCardsReprinted(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const camperIds = formData.getAll("camperId").map(String).filter(Boolean);
  if (!camperIds.length) return;

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) return;

  await prisma.rosterReprintFlag.updateMany({
    where: { sessionId: session.id, camperId: { in: camperIds }, cardResolvedAt: null },
    data: { cardResolvedAt: new Date(), cardResolvedByUserId: actor.id }
  });
  revalidatePath("/cards");
}
