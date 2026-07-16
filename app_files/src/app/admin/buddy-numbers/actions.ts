"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// Buddy numbers are session-scoped and, once assigned, permanent. Generating
// them only ever touches campers who don't have one yet -- it never
// reassigns or renumbers an existing buddy number, even if the alphabetical
// order would technically put a later arrival earlier in the list. This is
// deliberate: paper buddy-tag systems at the waterfront depend on a
// camper's number never changing mid-session.

export async function listBuddyNumberSessions(): Promise<
  { id: string; name: string; cycle: string; year: number; active: boolean }[]
> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  return prisma.session.findMany({
    select: { id: true, name: true, cycle: true, year: true, active: true },
    orderBy: { createdAt: "desc" }
  });
}

export type BuddyNumberCamper = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  buddyNumber: number | null;
  cabinName: string | null;
};

export type BuddyNumberOverview = {
  session: { id: string; name: string; cycle: string; year: number; active: boolean } | null;
  assigned: BuddyNumberCamper[];
  unassigned: BuddyNumberCamper[];
  nextNumber: number;
};

// targetSessionId is required and explicit, same reasoning as the Q3 cabin
// import tool -- this needs to work on a session that isn't the currently
// active one (prepping Q3 while Q2 is still live), so it must never fall
// back to "whichever session is active."
export async function getBuddyNumberOverview(targetSessionId: string): Promise<BuddyNumberOverview> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const [session, campers] = await Promise.all([
    prisma.session.findUnique({
      where: { id: targetSessionId },
      select: { id: true, name: true, cycle: true, year: true, active: true }
    }),
    prisma.camper.findMany({
      where: { sessionId: targetSessionId, active: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        buddyNumber: true,
        cabin: { select: { name: true } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);

  const rows: BuddyNumberCamper[] = campers.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    nickname: c.nickname,
    buddyNumber: c.buddyNumber,
    cabinName: c.cabin?.name ?? null
  }));

  const assigned = rows
    .filter((c) => c.buddyNumber !== null)
    .sort((a, b) => (a.buddyNumber! - b.buddyNumber!));
  const unassigned = rows.filter((c) => c.buddyNumber === null);
  const currentMax = assigned.reduce((max, c) => Math.max(max, c.buddyNumber!), 0);

  return { session, assigned, unassigned, nextNumber: currentMax + 1 };
}

export async function generateBuddyNumbers(formData: FormData): Promise<void> {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true, name: true } });
  if (!session) throw new Error("That session no longer exists — refresh and pick another.");

  await prisma.$transaction(async (tx) => {
    const [currentMax, unassigned] = await Promise.all([
      tx.camper.aggregate({ where: { sessionId }, _max: { buddyNumber: true } }),
      tx.camper.findMany({
        where: { sessionId, active: true, buddyNumber: null },
        select: { id: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    ]);

    let next = (currentMax._max.buddyNumber ?? 0) + 1;
    for (const camper of unassigned) {
      await tx.camper.update({ where: { id: camper.id }, data: { buddyNumber: next } });
      next += 1;
    }

    if (unassigned.length > 0) {
      logAudit({
        action: "camper.buddy_numbers_generated",
        actorId: actor.id,
        targetType: "session",
        targetId: sessionId,
        metadata: { sessionName: session.name, count: unassigned.length, startingAt: (currentMax._max.buddyNumber ?? 0) + 1 }
      });
    }
  });

  revalidatePath("/admin/buddy-numbers");
  revalidatePath("/reports/mac-swim");
}
