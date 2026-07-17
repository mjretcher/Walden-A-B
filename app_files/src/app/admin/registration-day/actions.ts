"use server";

import { revalidatePath } from "next/cache";
import { RegistrationWindow, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { generateJoinCode } from "@/lib/event-auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseRegistrationWindow } from "@/lib/registration-windows";

export type EventActionResult = { ok: boolean; error?: string };

/**
 * Creates (and opens) a Registration Day event. Only one event is active at
 * a time: any currently-active event is closed first, in the same
 * transaction, so there is never a moment with two live join codes — a
 * stale QR from an earlier attempt must not still work.
 */
export async function createRegistrationEvent(formData: FormData): Promise<EventActionResult> {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return { ok: false, error: "No active session — activate one before opening a Registration Day." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || "Registration Day";
  const registrationWindow = parseRegistrationWindow(String(formData.get("window") ?? "")) as RegistrationWindow;

  // Codes are unique across all events ever (schema @unique) — retry on the
  // astronomically-unlikely collision instead of failing the whole action.
  let code = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await prisma.registrationEvent.findUnique({ where: { code } });
    if (!clash) break;
    code = generateJoinCode();
  }

  const event = await prisma.$transaction(async (tx) => {
    await tx.registrationEvent.updateMany({
      where: { active: true },
      data: { active: false, closedAt: new Date() }
    });
    return tx.registrationEvent.create({
      data: {
        sessionId: session.id,
        name,
        code,
        registrationWindow,
        createdByUserId: user.id
      }
    });
  });

  logAudit({
    action: "event.create",
    actorId: user.id,
    targetType: "registrationEvent",
    targetId: event.id,
    metadata: { name, code, registrationWindow }
  });

  revalidatePath("/admin/registration-day");
  return { ok: true };
}

/** Closes the event — the kill switch. Every guest cookie dies with it. */
export async function closeRegistrationEvent(formData: FormData): Promise<EventActionResult> {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return { ok: false, error: "Missing event." };

  const event = await prisma.registrationEvent.findUnique({ where: { id: eventId } });
  if (!event || !event.active) return { ok: false, error: "That event is already closed." };

  await prisma.registrationEvent.update({
    where: { id: eventId },
    data: { active: false, closedAt: new Date() }
  });

  logAudit({
    action: "event.close",
    actorId: user.id,
    targetType: "registrationEvent",
    targetId: eventId,
    metadata: { name: event.name, code: event.code }
  });

  revalidatePath("/admin/registration-day");
  return { ok: true };
}
