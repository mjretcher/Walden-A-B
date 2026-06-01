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

async function activeSessionId() {
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  return session?.id ?? null;
}

export async function bulkUpdateCamperSwimLevels(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = selectedCamperIds(formData);
  const swimLevel = selectedSwimLevel(formData);
  const sessionId = await activeSessionId();
  if (!ids.length || !swimLevel || !sessionId) return;

  await prisma.camper.updateMany({
    where: { id: { in: ids }, sessionId, active: true },
    data: { swimLevel }
  });

  revalidatePath("/admin/campers");
}

export async function setAllActiveCampersToMuskie() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = await activeSessionId();
  if (!sessionId) return;

  await prisma.camper.updateMany({
    where: { sessionId, active: true },
    data: { swimLevel: SwimLevel.MUSKIE }
  });

  revalidatePath("/admin/campers");
}

export async function updateCamperCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  const sessionId = await activeSessionId();
  if (!camperId || !sessionId) return;

  await prisma.camper.updateMany({
    where: { id: camperId, sessionId, active: true },
    data: { cabinId: cabinId || null }
  });

  revalidatePath("/admin/campers");
}
