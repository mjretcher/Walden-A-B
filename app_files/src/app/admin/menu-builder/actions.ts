"use server";

import { LimitType, Period, SwimLevel, Unit, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { writeStringArray } from "@/lib/local-arrays";

export async function createOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const menu = session ? await prisma.menu.findFirst({ where: { sessionId: session.id, active: true } }) : null;
  if (!session || !menu) throw new Error("Active session and menu are required.");

  const requestedAreaId = String(formData.get("areaId"));
  const activity = await resolveActivity(requestedAreaId, formData);
  const certificationIds = await activeCertificationIds(formData.getAll("certificationIds").map(String));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const rosterLimit = rosterLimitRaw ? Number(rosterLimitRaw) : null;
  const swimLevels = await swimLevelsForArea(activity.areaId, formData);

  if (certificationIds.length) {
    await prisma.activity.update({
      where: { id: activity.id },
      data: { requiredCertifications: { set: certificationIds.map((id) => ({ id })) } }
    });
  }

  await prisma.activityOffering.create({
    data: {
      sessionId: session.id,
      menuId: menu.id,
      areaId: activity.areaId,
      activityId: activity.id,
      period: String(formData.get("period")) as Period,
      eligibleUnits: writeStringArray(formData.getAll("eligibleUnits") as Unit[]),
      eligibleSwimLevels: writeStringArray(swimLevels),
      rosterLimit,
      limitType: String(formData.get("limitType")) as LimitType,
      allowOverride: formData.get("allowOverride") === "on",
      preAssigned: formData.get("preAssigned") === "on",
      visibleOnMenu: readCheckbox(formData, "visibleOnMenu", true),
      staffTarget: Number(formData.get("staffTarget") ?? 1),
      notes: String(formData.get("notes") ?? "").trim() || null
    }
  });

  revalidatePath("/admin/menu-builder");
  revalidatePath("/registration");
  revalidatePath("/rosters");
  revalidatePath("/reports/ab-menu");
  revalidatePath("/scream-session");
  revalidatePath("/area-dashboard");
  revalidatePath("/reports/area-block-plan");
}

export async function updateOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const certificationIds = await activeCertificationIds(formData.getAll("certificationIds").map(String));
  const offering = await prisma.activityOffering.findUnique({
    where: { id },
    select: { activityId: true, areaId: true, period: true, eligibleUnits: true, eligibleSwimLevels: true }
  });
  if (!offering) throw new Error("Offering is required.");
  const submittedPeriod = formData.get("period");
  const submittedUnits = formData.getAll("eligibleUnits") as Unit[];
  const submittedSwimLevels = formData.getAll("eligibleSwimLevels") as SwimLevel[];
  const swimLevels = await swimLevelsForArea(offering.areaId, formData, submittedSwimLevels.length ? submittedSwimLevels : null, offering.eligibleSwimLevels);

  await prisma.$transaction([
    prisma.activityOffering.update({
      where: { id },
      data: {
        period: submittedPeriod ? (String(submittedPeriod) as Period) : offering.period,
        eligibleUnits: submittedUnits.length ? writeStringArray(submittedUnits) : offering.eligibleUnits,
        eligibleSwimLevels: writeStringArray(swimLevels),
        rosterLimit: rosterLimitRaw ? Number(rosterLimitRaw) : null,
        limitType: String(formData.get("limitType")) as LimitType,
        staffTarget: Number(formData.get("staffTarget") ?? 1),
        active: formData.get("active") === "on",
        preAssigned: formData.get("preAssigned") === "on",
        visibleOnMenu: readCheckbox(formData, "visibleOnMenu", false),
        allowOverride: formData.get("allowOverride") === "on",
        notes: String(formData.get("notes") ?? "").trim() || null
      }
    }),
    prisma.activity.update({
      where: { id: offering.activityId },
      data: { requiredCertifications: { set: certificationIds.map((certificationId) => ({ id: certificationId })) } }
    })
  ]);

  revalidatePath("/admin/menu-builder");
  revalidatePath("/registration");
  revalidatePath("/rosters");
  revalidatePath("/reports/ab-menu");
  revalidatePath("/dashboard");
  revalidatePath("/scream-session");
  revalidatePath("/area-dashboard");
  revalidatePath("/reports/area-block-plan");
}

export async function deleteOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();
  if (!id || confirm !== "DELETE") return;

  await prisma.activityOffering.delete({ where: { id } });

  revalidatePath("/admin/menu-builder");
  revalidatePath("/dashboard");
  revalidatePath("/scream-session");
  revalidatePath("/area-dashboard");
  revalidatePath("/reports/area-block-plan");
  revalidatePath("/registration");
  revalidatePath("/rosters");
}

async function activeCertificationIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return [];
  return (await prisma.certification.findMany({
    where: { id: { in: uniqueIds }, active: true },
    select: { id: true }
  })).map((certification) => certification.id);
}

function readCheckbox(formData: FormData, name: string, defaultValue: boolean) {
  const values = formData.getAll(name);
  return values.length === 0 ? defaultValue : values.includes("on");
}

function parseStoredArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function swimLevelsForArea(areaId: string, formData: FormData, submittedLevels?: SwimLevel[] | null, existingValue?: string | null) {
  const area = await prisma.area.findUnique({ where: { id: areaId }, select: { name: true } });
  if (!area?.name.toLowerCase().includes("waterfront")) return [];
  if (submittedLevels) return submittedLevels;
  const formLevels = formData.getAll("eligibleSwimLevels") as SwimLevel[];
  return formLevels.length ? formLevels : (parseStoredArray(existingValue ?? null) as SwimLevel[]);
}

async function resolveActivity(areaId: string, formData: FormData) {
  const area = await prisma.area.findFirst({ where: { id: areaId, active: true } });
  if (!area) throw new Error("Active area is required.");

  const existingActivityId = String(formData.get("activityId") ?? "");
  const newActivityName = String(formData.get("newActivityName") ?? "").trim();
  if (newActivityName) {
    const activity = await prisma.activity.upsert({
      where: { areaId_slug: { areaId, slug: slugify(newActivityName) } },
      create: { areaId, name: newActivityName, slug: slugify(newActivityName) },
      update: { active: true }
    });
    return activity;
  }
  const activity = await prisma.activity.findFirst({ where: { id: existingActivityId, active: true } });
  if (!activity) throw new Error("Active activity is required.");
  return activity;
}
