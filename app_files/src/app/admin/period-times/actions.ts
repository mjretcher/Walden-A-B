"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { inputValueToMinutes, SLOT_NUMBERS } from "@/lib/period-times";
import { prisma } from "@/lib/prisma";

// Every page that renders slot-time labels or auto-detects the current
// period from them.
const slotTimeConsumerPaths = ["/right-now", "/trip-planner", "/admin/period-times"];

export type SaveSlotTimesResult = { ok: boolean; error?: string };

/**
 * Upserts all 5 slots from the form in one pass. Validates each slot's
 * start < end and that slots don't run backwards relative to each other
 * (slot N must end before slot N+1 starts) — overlapping periods would
 * make detectCurrentSlot ambiguous, so that's a hard reject, unlike the
 * usual soft-warning posture, since silently-wrong auto-detection is
 * worse than a bounce back to the form.
 */
export async function saveSlotTimes(formData: FormData): Promise<SaveSlotTimesResult> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const parsed: { slot: number; start: number; end: number }[] = [];
  for (const slot of SLOT_NUMBERS) {
    const startRaw = String(formData.get(`start-${slot}`) ?? "");
    const endRaw = String(formData.get(`end-${slot}`) ?? "");
    const start = inputValueToMinutes(startRaw);
    const end = inputValueToMinutes(endRaw);
    if (start === null || end === null) return { ok: false, error: `Period ${slot}: enter both a start and end time.` };
    if (start >= end) return { ok: false, error: `Period ${slot}: start time must be before end time.` };
    parsed.push({ slot, start, end });
  }
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].start <= parsed[i - 1].end) {
      return { ok: false, error: `Period ${parsed[i].slot} starts before period ${parsed[i - 1].slot} ends — periods can't overlap.` };
    }
  }

  await prisma.$transaction(
    parsed.map(({ slot, start, end }) =>
      prisma.periodSlotTime.upsert({
        where: { slot },
        create: { slot, startMinutes: start, endMinutes: end },
        update: { startMinutes: start, endMinutes: end }
      })
    )
  );

  for (const path of slotTimeConsumerPaths) revalidatePath(path);
  return { ok: true };
}
