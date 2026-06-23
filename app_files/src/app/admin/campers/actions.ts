"use server";

import { revalidatePath } from "next/cache";
import { Gender, SwimLevel, Unit, UserRole, WeekBlock } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeStringArray } from "@/lib/local-arrays";
import { prisma } from "@/lib/prisma";
import { SWIM_LABEL } from "@/lib/periods";

const camperConsumerPaths = ["/admin/campers", "/registration", "/cards", "/rosters", "/search", "/dashboard", "/area-dashboard", "/switches"];

function revalidateCamperConsumers() {
  for (const path of camperConsumerPaths) revalidatePath(path);
}

function selectedCamperIds(formData: FormData) {
  return formData.getAll("camperId").map((value) => String(value)).filter(Boolean);
}

function selectedSwimLevel(formData: FormData) {
  const value = String(formData.get("swimLevel") ?? "");
  return Object.values(SwimLevel).includes(value as SwimLevel) ? (value as SwimLevel) : null;
}

function selectedEnum<T extends string>(value: FormDataEntryValue | null, allowed: T[]) {
  const text = String(value ?? "");
  return allowed.includes(text as T) ? (text as T) : null;
}

function confirmation(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function activeSessionId() {
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  return session?.id ?? null;
}

export async function createCamper(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = await activeSessionId();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const gender = selectedEnum(formData.get("gender"), Object.values(Gender) as Gender[]);
  const unit = selectedEnum(formData.get("unit"), Object.values(Unit) as Unit[]);
  const swimLevel = selectedSwimLevel(formData) ?? SwimLevel.PENDING_SWIM_TEST;
  const cabinId = String(formData.get("cabinId") ?? "");

  if (!sessionId || !firstName || !lastName || !gender || !unit) return;

  const cabin = cabinId
    ? await prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true, name: true } })
    : null;
  if (cabinId && !cabin) return;

  const weekBlocks = formData
    .getAll("weekBlock")
    .map(String)
    .filter((value): value is WeekBlock => Object.values(WeekBlock).includes(value as WeekBlock));

  await prisma.camper.create({
    data: {
      firstName,
      lastName,
      gender,
      genderIdentity: String(formData.get("genderIdentity") ?? "").trim() || null,
      age: parseNumber(String(formData.get("age") ?? "")),
      campGrade: String(formData.get("campGrade") ?? "").trim() || null,
      unit,
      cabinId: cabin?.id ?? null,
      swimLevel,
      medicalFlags: String(formData.get("medicalFlags") ?? "").trim() || null,
      counselorAssistant: formData.get("counselorAssistant") === "on",
      active: true,
      sessionId,
      weekEnrollments: cabin && weekBlocks.length
        ? {
            create: weekBlocks.map((weekBlock) => ({
              sessionId,
              weekBlock,
              cabinId: cabin.id,
              cabinName: cabin.name
            }))
          }
        : undefined
    }
  });

  revalidateCamperConsumers();
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

  revalidateCamperConsumers();
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

  revalidateCamperConsumers();
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

  revalidateCamperConsumers();
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

  revalidateCamperConsumers();
}

export async function updateCamperAllergies(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const sessionId = await activeSessionId();
  if (!camperId || !sessionId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, sessionId, active: true },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  const selectedLabelIds = formData.getAll("allergyLabelId").map(String).filter(Boolean);
  const existingLabels = await prisma.allergyLabel.findMany({
    where: { id: { in: selectedLabelIds }, active: true },
    select: { id: true }
  });
  const customNames = String(formData.get("customAllergies") ?? "")
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  const customLabels = await Promise.all(customNames.map((name) => prisma.allergyLabel.upsert({
    where: { name },
    create: { name, category: "Custom" },
    update: { active: true }
  })));
  const nextLabelIds = Array.from(new Set([
    ...existingLabels.map((label) => label.id),
    ...customLabels.map((label) => label.id)
  ]));

  await prisma.$transaction([
    prisma.camperAllergy.deleteMany({ where: { camperId: camper.id } }),
    ...nextLabelIds.map((allergyLabelId) => prisma.camperAllergy.create({
      data: {
        camperId: camper.id,
        allergyLabelId,
        notes: String(formData.get(`allergyNote:${allergyLabelId}`) ?? "").trim() || null
      }
    }))
  ]);

  revalidateCamperConsumers();
}

export async function updateCamperCounselorAssistant(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
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
    data: { counselorAssistant: formData.get("counselorAssistant") === "on" }
  });

  revalidateCamperConsumers();
}

export async function deleteCamper(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const confirm = confirmation(formData, "confirmDelete").toUpperCase();
  if (!camperId || confirm !== "DELETE") return;

  await prisma.camper.delete({ where: { id: camperId } });

  revalidateCamperConsumers();
}

export async function createCamperFilterGroup(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = await activeSessionId();
  if (!sessionId) return;

  const name = confirmation(formData, "groupName");
  if (!name) return;

  const weekBlocks = formData
    .getAll("weekBlock")
    .map(String)
    .filter((value): value is WeekBlock => Object.values(WeekBlock).includes(value as WeekBlock));
  const sessionDesignations = formData.getAll("designation").map(String).filter(Boolean);

  await prisma.camperFilterGroup.upsert({
    where: { sessionId_name: { sessionId, name } },
    create: {
      sessionId,
      name,
      description: confirmation(formData, "groupDescription") || null,
      weekBlocks: writeStringArray(weekBlocks),
      sessionDesignations: writeStringArray(sessionDesignations),
      createdByUserId: user.id
    },
    update: {
      description: confirmation(formData, "groupDescription") || null,
      weekBlocks: writeStringArray(weekBlocks),
      sessionDesignations: writeStringArray(sessionDesignations),
      active: true
    }
  });

  revalidateCamperConsumers();
}

export async function archiveCamperFilterGroup(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("groupId") ?? "");
  const sessionId = await activeSessionId();
  if (!id || !sessionId) return;

  await prisma.camperFilterGroup.updateMany({
    where: { id, sessionId },
    data: { active: false }
  });

  revalidateCamperConsumers();
}
