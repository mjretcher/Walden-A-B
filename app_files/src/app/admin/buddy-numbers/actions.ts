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
//
// PERMANENCE ALSO SURVIVES DELETION: Session.buddyNumberHighWater is a
// monotonic record of the highest number ever issued. Generation starts
// from max(camper max, high water), and deleteCamper raises the high
// water before hard-deleting a numbered camper -- so deleting campers
// (even the one holding the current max) can never cause a retired
// number to be reissued to someone else. The ONLY thing allowed to lower
// it is the typed-confirmation full renumber below.

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

  const [session, campers, camperMax] = await Promise.all([
    prisma.session.findUnique({
      where: { id: targetSessionId },
      select: { id: true, name: true, cycle: true, year: true, active: true, buddyNumberHighWater: true }
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
    }),
    // Max across ALL campers (inactive included) -- an inactive camper
    // keeps their number, and it stays off-limits.
    prisma.camper.aggregate({ where: { sessionId: targetSessionId }, _max: { buddyNumber: true } })
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
  // True next number: above every number ever issued -- active campers,
  // inactive campers, AND numbers whose campers were since hard-deleted
  // (carried by the session high-water mark).
  const currentMax = Math.max(camperMax._max.buddyNumber ?? 0, session?.buddyNumberHighWater ?? 0);

  return {
    session: session ? { id: session.id, name: session.name, cycle: session.cycle, year: session.year, active: session.active } : null,
    assigned,
    unassigned,
    nextNumber: currentMax + 1
  };
}

export async function generateBuddyNumbers(formData: FormData): Promise<void> {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true, name: true } });
  if (!session) throw new Error("That session no longer exists — refresh and pick another.");

  await prisma.$transaction(async (tx) => {
    const [currentMax, sessionRow, unassigned] = await Promise.all([
      tx.camper.aggregate({ where: { sessionId }, _max: { buddyNumber: true } }),
      tx.session.findUnique({ where: { id: sessionId }, select: { buddyNumberHighWater: true } }),
      tx.camper.findMany({
        where: { sessionId, active: true, buddyNumber: null },
        select: { id: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    ]);

    // Start above every number ever issued: camper rows (active AND
    // inactive) plus the session high-water mark, which remembers numbers
    // whose campers were since hard-deleted. This is what guarantees a
    // deleted camper's number is never reissued.
    const startAbove = Math.max(currentMax._max.buddyNumber ?? 0, sessionRow?.buddyNumberHighWater ?? 0);
    let next = startAbove + 1;
    for (const camper of unassigned) {
      await tx.camper.update({ where: { id: camper.id }, data: { buddyNumber: next } });
      next += 1;
    }

    if (unassigned.length > 0) {
      // Record the new ceiling immediately, inside the same transaction.
      await tx.session.update({ where: { id: sessionId }, data: { buddyNumberHighWater: next - 1 } });
      logAudit({
        action: "camper.buddy_numbers_generated",
        actorId: actor.id,
        targetType: "session",
        targetId: sessionId,
        metadata: { sessionName: session.name, count: unassigned.length, startingAt: startAbove + 1 }
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
    `,
    // The one sanctioned reset of the high-water mark: the whole point of
    // this tool is starting the sequence over before anything is printed.
    prisma.session.update({ where: { id: sessionId }, data: { buddyNumberHighWater: activeCount } })
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
