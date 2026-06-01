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

  const areaId = String(formData.get("areaId"));
  const activityId = await resolveActivity(areaId, formData);
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const rosterLimit = rosterLimitRaw ? Number(rosterLimitRaw) : null;

  await prisma.activityOffering.create({
    data: {
      sessionId: session.id,
      menuId: menu.id,
      areaId,
      activityId,
      period: String(formData.get("period")) as Period,
      eligibleUnits: writeStringArray(formData.getAll("eligibleUnits") as Unit[]),
      eligibleSwimLevels: writeStringArray(formData.getAll("eligibleSwimLevels") as SwimLevel[]),
      rosterLimit,
      limitType: String(formData.get("limitType")) as LimitType,
      allowOverride: formData.get("allowOverride") === "on",
      preAssigned: formData.get("preAssigned") === "on",
      staffTarget: Number(formData.get("staffTarget") ?? 1),
      notes: String(formData.get("notes") ?? "").trim() || null
    }
  });

  revalidatePath("/admin/menu-builder");
}

export async function updateOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();

  await prisma.activityOffering.update({
    where: { id },
    data: {
      rosterLimit: rosterLimitRaw ? Number(rosterLimitRaw) : null,
      limitType: String(formData.get("limitType")) as LimitType,
      staffTarget: Number(formData.get("staffTarget") ?? 1),
      active: formData.get("active") === "on",
      preAssigned: formData.get("preAssigned") === "on",
      allowOverride: formData.get("allowOverride") === "on",
      notes: String(formData.get("notes") ?? "").trim() || null
    }
  });

  revalidatePath("/admin/menu-builder");
  revalidatePath("/dashboard");
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
    return activity.id;
  }
  const activity = await prisma.activity.findFirst({ where: { id: existingActivityId, areaId, active: true } });
  if (!activity) throw new Error("Active activity is required.");
  return activity.id;
}
