"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

function isDuplicateEmailError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray((error.meta as { target?: unknown })?.target) &&
    (error.meta as { target?: unknown[] })?.target?.includes("email")
  );
}

export async function createUser(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const areaId = String(formData.get("areaId") || "");
  const area = areaId ? await prisma.area.findFirst({ where: { id: areaId, active: true } }) : null;
  const role = String(formData.get("role")) as UserRole;
  const password = String(formData.get("password") ?? "");
  if (!Object.values(UserRole).includes(role) || password.length < 8) return;

  let created;
  try {
    created = await prisma.user.create({
      data: {
        name: String(formData.get("name")),
        email: String(formData.get("email")).toLowerCase(),
        role,
        areaId: area?.id ?? null,
        passwordHash: hashPassword(password)
      }
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      redirect("/admin/users?error=duplicate-email");
    }
    throw error;
  }

  logAudit({
    action: "user.create",
    actorId: actor.id,
    targetType: "user",
    targetId: created.id,
    metadata: { email: created.email, role: created.role }
  });

  revalidatePath("/admin/users");
}

export async function toggleUser(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await prisma.user.update({ where: { id }, data: { active: !active } });

  logAudit({
    action: "user.toggle_active",
    actorId: actor.id,
    targetType: "user",
    targetId: id,
    metadata: { newActive: !active }
  });

  revalidatePath("/admin/users");
}

export async function updateUser(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const areaId = String(formData.get("areaId") || "");
  const area = areaId ? await prisma.area.findFirst({ where: { id: areaId, active: true } }) : null;
  const role = String(formData.get("role")) as UserRole;
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!Object.values(UserRole).includes(role)) return;
  if (!name || !email) return;
  if (password && password.length < 8) return;

  // Capture the BEFORE state so the audit log can describe what changed.
  const before = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, active: true, areaId: true } });

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        areaId: area?.id ?? null,
        active: formData.get("active") === "on",
        ...(password ? { passwordHash: hashPassword(password) } : {})
      }
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      redirect("/admin/users?error=duplicate-email");
    }
    throw error;
  }

  // Role change is the most important signal — a hijacked admin
  // promoting itself or another account is a key attack pattern.
  if (before && before.role !== role) {
    logAudit({
      action: "user.role_change",
      actorId: actor.id,
      targetType: "user",
      targetId: id,
      metadata: { fromRole: before.role, toRole: role, email }
    });
  }

  // Catch-all "user updated" event for the audit trail. Lighter detail.
  logAudit({
    action: "user.update",
    actorId: actor.id,
    targetType: "user",
    targetId: id,
    metadata: {
      changedPassword: Boolean(password),
      emailChanged: before ? before.email !== email : null,
      activeChanged: before ? before.active !== (formData.get("active") === "on") : null,
      areaChanged: before ? before.areaId !== (area?.id ?? null) : null
    }
  });

  revalidatePath("/admin/users");
}
