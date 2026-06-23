"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function toggleScreamSessionLock(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const password = String(formData.get("password") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const lock = formData.get("lock") === "true";

  const expectedPassword = process.env.SCREAM_LOCK_PASSWORD;
  if (!expectedPassword) throw new Error("SCREAM_LOCK_PASSWORD is not configured.");
  if (password !== expectedPassword) throw new Error("Incorrect password.");

  await prisma.session.update({
    where: { id: sessionId },
    data: { screamSessionLocked: lock }
  });

  revalidatePath("/scream-session");
}
