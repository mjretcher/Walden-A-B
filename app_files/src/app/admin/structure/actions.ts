"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

const affectedPaths = [
  "/admin/structure",
  "/admin/staff",
  "/admin/menu-builder",
  "/admin/users",
  "/registration",
  "/scream-session",
  "/switches",
  "/area-dashboard"
];

function revalidateStructureConsumers() {
  for (const path of affectedPaths) revalidatePath(path);
}

export async function createArea(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) throw new Error("Area name is required.");

  await prisma.area.upsert({
    where: { slug: slugify(name) },
    create: { name, slug: slugify(name), description: description || null },
    update: { name, description: description || null, active: true }
  });

  revalidateStructureConsumers();
}

export async function createSkill(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Skill name is required.");

  const existing = await prisma.skill.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    await prisma.skill.update({ where: { id: existing.id }, data: { name, active: true } });
  } else {
    await prisma.skill.create({ data: { name } });
  }

  revalidateStructureConsumers();
}

export async function createCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Certification name is required.");

  const existing = await prisma.certification.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    await prisma.certification.update({ where: { id: existing.id }, data: { name, active: true } });
  } else {
    await prisma.certification.create({ data: { name } });
  }

  revalidateStructureConsumers();
}

export async function toggleArea(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.area.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}

export async function toggleSkill(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.skill.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}

export async function toggleCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.certification.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}
