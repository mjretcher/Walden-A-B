"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Clears the reprint flag for one offering. There's no way to detect an
// actual browser print, so this is a deliberate "I reprinted this" click
// rather than something automatic.
export async function markRosterReprinted(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const offeringId = String(formData.get("offeringId") ?? "");
  if (!offeringId) return;

  if (actor.role === UserRole.AREA_HEAD) {
    const offering = await prisma.activityOffering.findUnique({ where: { id: offeringId }, select: { areaId: true } });
    if (!offering || offering.areaId !== actor.areaId) return;
  }

  await prisma.rosterReprintFlag.updateMany({
    where: { offeringId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId: actor.id }
  });
  revalidatePath("/rosters");
}

// Clears every currently-shown flag in one click — used after printing a
// filtered batch of affected rosters together.
export async function markRostersReprinted(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const offeringIds = formData.getAll("offeringId").map(String).filter(Boolean);
  if (!offeringIds.length) return;

  const scopedIds = actor.role === UserRole.AREA_HEAD
    ? (
        await prisma.activityOffering.findMany({ where: { id: { in: offeringIds }, areaId: actor.areaId ?? undefined }, select: { id: true } })
      ).map((o) => o.id)
    : offeringIds;
  if (!scopedIds.length) return;

  await prisma.rosterReprintFlag.updateMany({
    where: { offeringId: { in: scopedIds }, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId: actor.id }
  });
  revalidatePath("/rosters");
}
