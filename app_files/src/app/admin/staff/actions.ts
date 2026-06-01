"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function values(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => String(value)).filter(Boolean);
}

function cleanName(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
}

function slugFromName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function createStaffArea(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = cleanName(formData, "name");
  if (!name) return;
  const slug = slugFromName(name);
  if (!slug) return;

  await prisma.area.upsert({
    where: { slug },
    update: { active: true },
    create: { name, slug, active: true }
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin/menu-builder");
  revalidatePath("/area-dashboard");
}

export async function createStaffSkill(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = cleanName(formData, "name");
  if (!name) return;

  await prisma.skill.upsert({
    where: { name },
    update: {},
    create: { name }
  });

  revalidatePath("/admin/staff");
}

export async function createStaffCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = cleanName(formData, "name");
  if (!name) return;

  await prisma.certification.upsert({
    where: { name },
    update: {},
    create: { name }
  });

  revalidatePath("/admin/staff");
}

export async function updateStaffProfile(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return;

  const cabinId = String(formData.get("cabinId") ?? "");
  const primaryAreaId = String(formData.get("primaryAreaId") ?? "");
  const secondaryAreaIds = values(formData, "secondaryAreaId");
  const certificationIds = values(formData, "certificationId");
  const skillIds = values(formData, "skillId");

  await prisma.staff.update({
    where: { id: staffId },
    data: {
      cabinId: cabinId || null,
      primaryAreaId: primaryAreaId || null,
      secondaryAreas: { set: secondaryAreaIds.map((id) => ({ id })) },
      certifications: { set: certificationIds.map((id) => ({ id })) },
      skills: { set: skillIds.map((id) => ({ id })) }
    }
  });

  revalidatePath("/admin/staff");
}
