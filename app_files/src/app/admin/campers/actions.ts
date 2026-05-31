"use server";

import { revalidatePath } from "next/cache";
import { SwimLevel, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function selectedCamperIds(formData: FormData) {
  return formData.getAll("camperId").map((value) => String(value)).filter(Boolean);
}

function selectedSwimLevel(formData: FormData) {
  const value = String(formData.get("swimLevel") ?? "");
  return Object.values(SwimLevel).includes(value as SwimLevel) ? (value as SwimLevel) : null;
}

export async function bulkUpdateCamperSwimLevels(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = selectedCamperIds(formData);
  const swimLevel = selectedSwimLevel(formData);
  if (!ids.length || !swimLevel) return;

  await prisma.camper.updateMany({
    where: { id: { in: ids } },
    data: { swimLevel }
  });

  revalidatePath("/admin/campers");
}

export async function setAllActiveCampersToMuskie() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return;

  await prisma.camper.updateMany({
    where: { sessionId: session.id, active: true },
    data: { swimLevel: SwimLevel.MUSKIE }
  });

  revalidatePath("/admin/campers");
}

export async function updateCamperCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  if (!camperId) return;

  await prisma.camper.update({
    where: { id: camperId },
    data: { cabinId: cabinId || null }
  });

  revalidatePath("/admin/campers");
}
