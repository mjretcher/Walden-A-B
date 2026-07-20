"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// One shared arrangement per session. Exec-only, same as the rest of Bunk
// Management editing. The payload is just tables + person->table assignments;
// the roster is always re-read live on load, so a stale person id in here
// simply doesn't render (harmless).
export async function saveMessHallArrangement(sessionId: string, data: string) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  if (typeof sessionId !== "string" || !sessionId) throw new Error("Missing session.");
  if (typeof data !== "string" || data.length > 1_000_000) throw new Error("Invalid arrangement payload.");

  await prisma.messHallArrangement.upsert({
    where: { sessionId },
    create: { sessionId, data },
    update: { data }
  });

  revalidatePath("/bunk-management/mess-hall");
  return { ok: true };
}
