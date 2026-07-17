"use server";

import { Gender } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireBunkManagementAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type OutOfCabinSaveResult = { ok: boolean; error?: string };

// Every surface that renders the OUT OF CABIN box or the selection state.
const consumerPaths = ["/bunk-management/out-of-cabin", "/bunk-management/print", "/bunk-management/print-staff"];

/**
 * Upserts one staff member's out-of-cabin listing state in a single call:
 * include on/off plus which sheet(s). include=false deletes the row rather
 * than keeping a both-flags-false husk, so "who's listed" stays a simple
 * existence query. Exec-only (bunk-management write access).
 */
export async function setOutOfCabinListing(formData: FormData): Promise<OutOfCabinSaveResult> {
  const actor = await requireBunkManagementAccess("write");

  const staffId = String(formData.get("staffId") ?? "");
  const include = formData.get("include") === "true";
  const showOnStaffSheet = formData.get("showOnStaffSheet") === "true";
  const showOnCabinSheet = formData.get("showOnCabinSheet") === "true";
  // "" (Both) → null; otherwise a Gender enum value. Anything else is
  // rejected rather than coerced.
  const rawSide = String(formData.get("side") ?? "");
  const side = rawSide === "" ? null : rawSide === Gender.MALE || rawSide === Gender.FEMALE ? (rawSide as Gender) : undefined;
  if (side === undefined) return { ok: false, error: "Invalid side." };
  if (!staffId) return { ok: false, error: "Missing staff member." };

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true } });
  if (!session) return { ok: false, error: "No active session." };

  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, firstName: true, lastName: true } });
  if (!staff) return { ok: false, error: "That staff member no longer exists." };

  if (!include) {
    await prisma.outOfCabinListing.deleteMany({ where: { staffId, sessionId: session.id } });
  } else {
    await prisma.outOfCabinListing.upsert({
      where: { staffId_sessionId: { staffId, sessionId: session.id } },
      create: { staffId, sessionId: session.id, showOnStaffSheet, showOnCabinSheet, side },
      update: { showOnStaffSheet, showOnCabinSheet, side }
    });
  }

  logAudit({
    action: "bunk.out_of_cabin_listing_set",
    actorId: actor.id,
    targetType: "staff",
    targetId: staffId,
    metadata: { sessionName: session.name, staffName: `${staff.firstName} ${staff.lastName}`, include, showOnStaffSheet, showOnCabinSheet, side: side ?? "BOTH" }
  });

  for (const path of consumerPaths) revalidatePath(path);
  return { ok: true };
}
