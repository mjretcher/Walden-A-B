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

/**
 * FULL renumber — the deliberate exception to "buddy numbers are permanent."
 * Exists for exactly one situation: campers were deleted BEFORE anything was
 * printed or handed out, leaving gaps in a sequence nobody outside the app
 * has seen yet. Wipes every buddy number in the session (active AND
 * inactive campers — inactive ones are what left the gaps) and reassigns
 * 1..N alphabetically across active campers.
 *
 * Guarded by a typed confirmation ("RENUMBER"), validated server-side, and
 * heavily audit-logged. Once tags/charts are printed this must never be run
 * again — that warning lives in the UI next to the button.
 *
 * Implementation is two set-based SQL statements in one transaction rather
 * than the per-camper update loop generateBuddyNumbers uses: a ~250-row
 * awaited loop against Neon could brush Prisma's interactive-transaction
 * timeout, while the window-function UPDATE is a single round trip. The
 * ORDER BY matches Prisma's (lastName, firstName) collation, with id as a
 * deterministic tiebreak.
 */
export async function renumberBuddyNumbers(formData: FormData): Promise<void> {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (!sessionId) return;
  if (confirm !== "RENUMBER") {
    throw new Error('Type RENUMBER in the confirmation box to run the full re-number.');
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true, name: true } });
  if (!session) throw new Error("That session no longer exists — refresh and pick another.");

  const [assignedBefore, maxBefore, activeCount] = await Promise.all([
    prisma.camper.count({ where: { sessionId, buddyNumber: { not: null } } }),
    prisma.camper.aggregate({ where: { sessionId }, _max: { buddyNumber: true } }),
    prisma.camper.count({ where: { sessionId, active: true } })
  ]);

  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Camper" SET "buddyNumber" = NULL WHERE "sessionId" = ${sessionId}`,
    prisma.$executeRaw`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "lastName" ASC, "firstName" ASC, id ASC) AS rn
        FROM "Camper"
        WHERE "sessionId" = ${sessionId} AND active = true
      )
      UPDATE "Camper" AS c
      SET "buddyNumber" = ordered.rn
      FROM ordered
      WHERE c.id = ordered.id
    `
  ]);

  logAudit({
    action: "camper.buddy_numbers_renumbered",
    actorId: actor.id,
    targetType: "session",
    targetId: sessionId,
    metadata: {
      sessionName: session.name,
      assignedBefore,
      maxNumberBefore: maxBefore._max.buddyNumber ?? 0,
      assignedAfter: activeCount
    }
  });

  revalidatePath("/admin/buddy-numbers");
  revalidatePath("/reports/mac-swim");
  revalidatePath("/reports/buddy-numbers");
}
