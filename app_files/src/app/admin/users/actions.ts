"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

export async function createUser(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const areaId = String(formData.get("areaId") || "");
  const area = areaId ? await prisma.area.findFirst({ where: { id: areaId, active: true } }) : null;
  await prisma.user.create({
    data: {
      name: String(formData.get("name")),
      email: String(formData.get("email")).toLowerCase(),
      role: String(formData.get("role")) as UserRole,
      areaId: area?.id ?? null,
      passwordHash: hashPassword(String(formData.get("password") || "walden2025!"))
    }
  });

  revalidatePath("/admin/users");
}

export async function toggleUser(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await prisma.user.update({ where: { id }, data: { active: !active } });
  revalidatePath("/admin/users");
}
