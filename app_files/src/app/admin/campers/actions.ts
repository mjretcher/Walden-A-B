"use server";

import { revalidatePath } from "next/cache";
import { SwimLevel, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SWIM_LABEL } from "@/lib/periods";

function selectedCamperIds(formData: FormData) {
  return formData.getAll("camperId").map((value) => String(value)).filter(Boolean);
}

function selectedSwimLevel(formData: FormData) {
  const value = String(formData.get("swimLevel") ?? "");
  return Object.values(SwimLevel).includes(value as SwimLevel) ? (value as SwimLevel) : null;
}

function confirmation(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
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
  if (confirmation(formData, "confirmBulkSwim").toUpperCase() !== "SWIM") return;

  await prisma.camper.updateMany({
    where: { id: { in: ids }, sessionId, active: true },
    data: { swimLevel }
  });

  revalidatePath("/admin/campers");
  revalidatePath("/registration");
}

async function setAllActiveCampersTo(swimLevel: SwimLevel, formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = await activeSessionId();
  if (!sessionId) return;

  const expected = `SET ALL TO ${SWIM_LABEL[swimLevel].toUpperCase()}`;
  if (confirmation(formData, "confirmAllSwim").toUpperCase() !== expected) return;

  await prisma.camper.updateMany({
    where: { sessionId, active: true },
    data: { swimLevel }
  });

  revalidatePath("/admin/campers");
  revalidatePath("/registration");
}

export async function setAllActiveCampersToMuskie(formData: FormData) {
  await setAllActiveCampersTo(SwimLevel.MUSKIE, formData);
}

export async function setAllActiveCampersToPendingSwimTest(formData: FormData) {
  await setAllActiveCampersTo(SwimLevel.PENDING_SWIM_TEST, formData);
}

export async function updateCamperCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  const sessionId = await activeSessionId();
  if (!camperId || !sessionId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, sessionId, active: true },
    select: { id: true, firstName: true, lastName: true, cabinId: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  const nextCabinId = cabinId || null;
  if (nextCabinId) {
    const cabin = await prisma.cabin.findUnique({ where: { id: nextCabinId }, select: { id: true } });
    if (!cabin) return;
  }

  if (camper.cabinId === nextCabinId) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { cabinId: nextCabinId }
  });

  revalidatePath("/admin/campers");
}

export async function updateCamperMedicalFlags(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const medicalFlags = String(formData.get("medicalFlags") ?? "").trim();
  const sessionId = await activeSessionId();
  if (!camperId || !sessionId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, sessionId, active: true },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { medicalFlags: medicalFlags || null }
  });

  revalidatePath("/admin/campers");
  revalidatePath("/cards");
  revalidatePath("/registration");
}
