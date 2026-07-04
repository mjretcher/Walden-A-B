"use server";

import { Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function togglePreScreamOpen(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "");
  const open = formData.get("open") === "true";
  if (!sessionId) return;

  await prisma.session.update({ where: { id: sessionId }, data: { preScreamOpen: open } });
  logAudit({ action: open ? "prescream.open" : "prescream.close", actorId: actor.id, targetType: "session", targetId: sessionId });
  revalidatePath("/prescream");
}

export async function preScreamAssign(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const offeringId = String(formData.get("offeringId") ?? "");
  const staffId = String(formData.get("staffId") ?? "");
  const period = String(formData.get("period") ?? "") as Period;
  if (!offeringId || !staffId || !period) return;

  const [session, offering, staff] = await Promise.all([
    prisma.session.findFirst({ where: { active: true } }),
    prisma.activityOffering.findUnique({ where: { id: offeringId }, select: { id: true, sessionId: true, areaId: true, period: true } }),
    prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, active: true, screamEligible: true } })
  ]);
  if (!session || !offering || !staff) return;
  if (offering.sessionId !== session.id || offering.period !== period) return;
  if (!staff.active || !staff.screamEligible) return;

  const isAreaHead = actor.role === UserRole.AREA_HEAD;
  if (isAreaHead) {
    // Area heads act only within their own area, and only while PreScream
    // is open. Exec Admins can use this same action any time — e.g. to
    // help an area out — since they already have unrestricted access via
    // the live board anyway.
    if (!actor.areaId || actor.areaId !== offering.areaId) return;
    if (!session.preScreamOpen) return;
  }

  await prisma.$transaction(async (tx) => {
    // Lock on the staff row so two near-simultaneous picks from different
    // areas can't both read "nobody holds this slot yet" and both create
    // a real assignment — same row-locking technique used for
    // registration capacity elsewhere in the app.
    await tx.$queryRaw`SELECT id FROM "Staff" WHERE id = ${staffId} FOR UPDATE`;

    const existing = await tx.staffAssignment.findUnique({
      where: { staffId_sessionId_period: { staffId, sessionId: session.id, period } },
      include: { offering: { select: { id: true, areaId: true } } }
    });

    if (!existing) {
      // Nobody holds this slot — claim it outright, exactly like assigning
      // someone directly on the live board. If a conflict happens to
      // already exist for this staff+period (e.g. the previous holder was
      // removed without going through PreScream, leaving an orphaned
      // conflict), resolve it now rather than leaving it dangling.
      await tx.staffAssignment.create({
        data: { staffId, offeringId, sessionId: session.id, period, role: "Lead", createdByUserId: actor.id }
      });
      await tx.preScreamConflict.updateMany({
        where: { sessionId: session.id, staffId, period, resolvedAt: null },
        data: { resolvedAt: new Date(), resolvedByUserId: actor.id }
      });
      return;
    }

    if (existing.offeringId === offeringId) return; // already exactly this pick — idempotent

    if (existing.offering.areaId === offering.areaId) {
      // Same area moving their own pick between two of their own offerings
      // in this period — a normal change, not a cross-area conflict.
      await tx.staffAssignment.update({ where: { id: existing.id }, data: { offeringId } });
      return;
    }

    // Genuine cross-area conflict: someone else already holds this
    // staff+period for a DIFFERENT area. Keep both — find-or-create the
    // conflict, and add this area's claim if it doesn't have one yet. The
    // existing assignment is untouched; it stays the "current holder"
    // until an Exec Admin resolves the conflict one way or the other.
    const conflict = await tx.preScreamConflict.upsert({
      where: { sessionId_staffId_period: { sessionId: session.id, staffId, period } },
      create: { sessionId: session.id, staffId, period },
      update: {}
    });
    await tx.preScreamClaim.upsert({
      where: { conflictId_offeringId: { conflictId: conflict.id, offeringId } },
      create: { conflictId: conflict.id, offeringId, areaId: offering.areaId, claimedByUserId: actor.id },
      update: {}
    });
  });

  revalidatePath("/prescream");
  revalidatePath("/scream-session");
}

export async function preScreamRelease(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return;

  const assignment = await prisma.staffAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, sessionId: true, offering: { select: { areaId: true } } }
  });
  if (!assignment) return;

  if (actor.role === UserRole.AREA_HEAD) {
    if (!actor.areaId || actor.areaId !== assignment.offering.areaId) return;
    const session = await prisma.session.findUnique({ where: { id: assignment.sessionId }, select: { preScreamOpen: true } });
    if (!session?.preScreamOpen) return;
  }

  await prisma.staffAssignment.delete({ where: { id: assignmentId } });
  revalidatePath("/prescream");
  revalidatePath("/scream-session");
}

export async function resolvePreScreamConflict(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const conflictId = String(formData.get("conflictId") ?? "");
  const winningOfferingId = String(formData.get("winningOfferingId") ?? "");
  if (!conflictId || !winningOfferingId) return;

  const conflict = await prisma.preScreamConflict.findUnique({ where: { id: conflictId } });
  if (!conflict || conflict.resolvedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.staffAssignment.upsert({
      where: { staffId_sessionId_period: { staffId: conflict.staffId, sessionId: conflict.sessionId, period: conflict.period } },
      create: { staffId: conflict.staffId, sessionId: conflict.sessionId, period: conflict.period, offeringId: winningOfferingId, role: "Lead", createdByUserId: actor.id },
      update: { offeringId: winningOfferingId }
    });
    await tx.preScreamConflict.update({ where: { id: conflictId }, data: { resolvedAt: new Date(), resolvedByUserId: actor.id } });
  });

  logAudit({
    action: "prescream.resolve_conflict",
    actorId: actor.id,
    targetType: "preScreamConflict",
    targetId: conflictId,
    metadata: { staffId: conflict.staffId, period: conflict.period, winningOfferingId }
  });

  revalidatePath("/prescream");
  revalidatePath("/scream-session");
}

// Withdraw one contending claim without resolving the whole conflict —
// e.g. an area head decides they'd rather ask someone else. If that was
// the only remaining claim, the conflict is deleted outright (it's not a
// conflict anymore, just a normal assignment) rather than left open with
// nothing to resolve.
export async function withdrawPreScreamClaim(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const claimId = String(formData.get("claimId") ?? "");
  if (!claimId) return;

  const claim = await prisma.preScreamClaim.findUnique({ where: { id: claimId }, select: { id: true, areaId: true, conflictId: true } });
  if (!claim) return;
  if (actor.role === UserRole.AREA_HEAD && actor.areaId !== claim.areaId) return;

  await prisma.$transaction(async (tx) => {
    await tx.preScreamClaim.delete({ where: { id: claimId } });
    const remaining = await tx.preScreamClaim.count({ where: { conflictId: claim.conflictId } });
    if (remaining === 0) {
      await tx.preScreamConflict.delete({ where: { id: claim.conflictId } });
    }
  });

  revalidatePath("/prescream");
}

// Deletes a conflict entirely — no winner picked, no assignment touched.
// Use this when the conflict is stale or moot (e.g. it was a test, or
// already settled outside the system) rather than a real decision between
// the contending areas. The current holder (if any) simply keeps their
// assignment untouched.
export async function deletePreScreamConflict(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const conflictId = String(formData.get("conflictId") ?? "");
  if (!conflictId) return;

  const conflict = await prisma.preScreamConflict.findUnique({ where: { id: conflictId } });
  if (!conflict) return;

  await prisma.preScreamConflict.delete({ where: { id: conflictId } }); // claims cascade
  logAudit({
    action: "prescream.delete_conflict",
    actorId: actor.id,
    targetType: "preScreamConflict",
    targetId: conflictId,
    metadata: { staffId: conflict.staffId, period: conflict.period }
  });

  revalidatePath("/prescream");
  revalidatePath("/scream-session");
}

// Full reset for a session: deletes every PreScream conflict/claim. Does
// NOT touch any real StaffAssignment — those are actual staffing
// decisions regardless of how they were made, so a PreScream reset only
// clears the contested-picks bookkeeping, never anyone's actual
// assignment. Useful for wiping out test picks or starting the
// conflict-tracking over without undoing real staffing work.
export async function resetPreScream(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const { count } = await prisma.preScreamConflict.deleteMany({ where: { sessionId } }); // claims cascade
  logAudit({
    action: "prescream.reset",
    actorId: actor.id,
    targetType: "session",
    targetId: sessionId,
    metadata: { conflictsDeleted: count }
  });

  revalidatePath("/prescream");
}
