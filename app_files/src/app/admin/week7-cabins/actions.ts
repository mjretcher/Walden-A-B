// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { UserRole, WeekBlock } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const consumerPaths = ["/admin/week7-cabins", "/bunk-management", "/bunk-management/print", "/reports/final-week-sizes"];

function revalidateAll() {
  for (const p of consumerPaths) revalidatePath(p);
}

/**
 * DELIBERATELY DOES NOT FLAG ROSTER REPRINTS.
 *
 * flagRostersForCabinChange exists because a cabin move makes sheets that
 * are CURRENTLY in circulation wrong. A final-week move doesn't: the
 * rosters on clipboards right now are correct for Weeks 1-6 and stay
 * correct until the last week starts. Flagging them would send Mike
 * reprinting accurate paper. Week 7 gets its own print run instead.
 */

/**
 * One-time backfill: stamp each week row's cabinId from the camper's
 * current scalar cabin, so the overlay starts life as an exact copy of the
 * session-to-date placement and every subsequent edit is a real, visible
 * decision rather than a silent fallback.
 *
 * Only touches rows where cabinId is still null, so re-running it can
 * never overwrite a move that's already been made.
 */
export async function backfillWeekCabins(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const weekBlock = String(formData.get("weekBlock") ?? "").trim() as WeekBlock;
  if (!sessionId || !weekBlock) return { ok: false as const, error: "sessionId and weekBlock are required." };

  const rows = await prisma.camperWeekEnrollment.findMany({
    where: { sessionId, weekBlock, cabinId: null, camper: { active: true } },
    select: { id: true, camper: { select: { cabinId: true, cabin: { select: { name: true } } } } }
  });

  const updatable = rows.filter((r) => r.camper.cabinId);
  let stamped = 0;

  const chunkSize = 50;
  for (let i = 0; i < updatable.length; i += chunkSize) {
    const chunk = updatable.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.camperWeekEnrollment.update({
          where: { id: r.id },
          data: { cabinId: r.camper.cabinId, cabinName: r.camper.cabin?.name ?? null }
        })
      )
    );
    stamped += chunk.length;
  }

  revalidateAll();
  return { ok: true as const, stamped, skipped: rows.length - updatable.length };
}

/** Move one camper to a different cabin for a single week block only. */
export async function moveCamperForWeek(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const camperId = String(formData.get("camperId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const weekBlock = String(formData.get("weekBlock") ?? "").trim() as WeekBlock;
  const cabinIdRaw = String(formData.get("cabinId") ?? "").trim();
  const cabinId = cabinIdRaw === "" ? null : cabinIdRaw;

  if (!camperId || !sessionId || !weekBlock) {
    return { ok: false as const, error: "camperId, sessionId, and weekBlock are all required." };
  }

  const cabin = cabinId ? await prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true, name: true } }) : null;
  if (cabinId && !cabin) return { ok: false as const, error: "Cabin not found." };

  const existing = await prisma.camperWeekEnrollment.findUnique({
    where: { camperId_sessionId_weekBlock: { camperId, sessionId, weekBlock } },
    select: { id: true }
  });
  if (!existing) {
    return { ok: false as const, error: "That camper isn't enrolled in this week — nothing to move." };
  }

  await prisma.camperWeekEnrollment.update({
    where: { id: existing.id },
    data: { cabinId, cabinName: cabin?.name ?? null }
  });

  revalidateAll();
  return { ok: true as const };
}

/**
 * Set a staff member's cabin for a single week. An empty cabinId writes an
 * explicit null override -- "out of cabin this week" -- which is NOT the
 * same as clearing the override entirely (see clearStaffWeekOverride).
 */
export async function moveStaffForWeek(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const staffId = String(formData.get("staffId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const weekBlock = String(formData.get("weekBlock") ?? "").trim() as WeekBlock;
  const cabinIdRaw = String(formData.get("cabinId") ?? "").trim();
  const cabinId = cabinIdRaw === "" ? null : cabinIdRaw;

  if (!staffId || !sessionId || !weekBlock) {
    return { ok: false as const, error: "staffId, sessionId, and weekBlock are all required." };
  }

  const [staff, cabin] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } }),
    cabinId ? prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true } }) : Promise.resolve(null)
  ]);
  if (!staff) return { ok: false as const, error: "Staff member not found." };
  if (cabinId && !cabin) return { ok: false as const, error: "Cabin not found." };

  await prisma.cabinStaffWeekOverride.upsert({
    where: { staffId_sessionId_weekBlock: { staffId, sessionId, weekBlock } },
    create: { staffId, sessionId, weekBlock, cabinId, createdByUserId: user.id },
    update: { cabinId, createdByUserId: user.id }
  });

  revalidateAll();
  return { ok: true as const };
}

/** Drop the override entirely — this staffer reverts to their session cabin. */
export async function clearStaffWeekOverride(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const staffId = String(formData.get("staffId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const weekBlock = String(formData.get("weekBlock") ?? "").trim() as WeekBlock;
  if (!staffId || !sessionId || !weekBlock) {
    return { ok: false as const, error: "staffId, sessionId, and weekBlock are all required." };
  }

  await prisma.cabinStaffWeekOverride.deleteMany({ where: { staffId, sessionId, weekBlock } });

  revalidateAll();
  return { ok: true as const };
}
