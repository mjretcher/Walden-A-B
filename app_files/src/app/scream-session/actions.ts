"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function toggleScreamSessionLock(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);

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

  // The lock password is shared across every Exec Admin, so without this the
  // only record of who locked/unlocked scream session is "someone with the
  // password did it at some point." This ties it back to an actual person.
  logAudit({
    action: lock ? "scream_session.lock" : "scream_session.unlock",
    actorId: actor.id,
    targetType: "session",
    targetId: sessionId
  });

  revalidatePath("/scream-session");
}
