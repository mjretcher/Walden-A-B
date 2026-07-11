import { Period } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Maps the camp's daily schedule to clock times so the Right Now command
 * center (and Trip Planner) can label periods and auto-detect which one it
 * is. Times are editable in Admin → Period Times and stored per slot in
 * the PeriodSlotTime table; DEFAULT_SLOT_TIMES below is the fallback for
 * any slot without a saved row, so a fresh database still behaves
 * sensibly. Slot times are shared by A and B days — slot 1 runs the same
 * clock hours whether today is 1A or 1B.
 *
 * All detection runs in America/Detroit regardless of where the server
 * lives (Vercel runs UTC), since "what period is it" is a wall-clock
 * question at camp.
 */

export type SlotTime = { start: number; end: number; label: string };
export type SlotTimes = Record<number, SlotTime>;

export const SLOT_NUMBERS = [1, 2, 3, 4, 5] as const;

// Slot 1-5 → [startMinutes, endMinutes] since midnight, Detroit time.
// Slot 5 is Twilight (staff periods only — campers are with their cabins).
// These are the real 2026 bell schedule per Mike (Twilight unchanged from
// the original placeholder — no confirmed time given for it yet); saved
// PeriodSlotTime rows override these per slot.
export const DEFAULT_SLOT_TIMES: SlotTimes = {
  1: { start: 10 * 60 + 0, end: 11 * 60 + 15, label: "10:00–11:15" },
  2: { start: 11 * 60 + 15, end: 12 * 60 + 30, label: "11:15–12:30" },
  3: { start: 14 * 60 + 30, end: 15 * 60 + 45, label: "2:30–3:45" },
  4: { start: 16 * 60 + 15, end: 17 * 60 + 30, label: "4:15–5:30" },
  5: { start: 19 * 60 + 0, end: 20 * 60 + 15, label: "7:00–8:15" }
};

/** "2:05 PM"-style label for minutes-since-midnight, without the space or
 * AM/PM (camp style: "9:00–10:10", "2:00–3:10" — 12-hour, no meridiem,
 * matching the original hardcoded labels admins are used to reading). */
export function minutesToClockLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

export function slotTimeLabel(start: number, end: number): string {
  return `${minutesToClockLabel(start)}–${minutesToClockLabel(end)}`;
}

/** "HH:MM" 24-hour value for <input type="time">. */
export function minutesToInputValue(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse an <input type="time"> "HH:MM" value to minutes since midnight;
 * null when malformed. */
export function inputValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** The effective bell schedule: saved PeriodSlotTime rows layered over
 * DEFAULT_SLOT_TIMES, labels regenerated from the stored minutes. One
 * cheap query (≤5 tiny rows); callers already run per-request queries so
 * no extra caching layer is warranted. */
export async function getSlotTimes(): Promise<SlotTimes> {
  const rows = await prisma.periodSlotTime.findMany();
  const times: SlotTimes = { ...DEFAULT_SLOT_TIMES };
  for (const row of rows) {
    if (row.slot < 1 || row.slot > 5) continue;
    times[row.slot] = { start: row.startMinutes, end: row.endMinutes, label: slotTimeLabel(row.startMinutes, row.endMinutes) };
  }
  return times;
}

export type DayHalf = "A" | "B";

export function slotToPeriod(slot: number, day: DayHalf): Period {
  return `P${slot}${day}` as Period;
}

export function periodSlot(period: Period): number {
  return Number(period.charAt(1));
}

export function periodDay(period: Period): DayHalf {
  return period.charAt(2) as DayHalf;
}

/** Current wall-clock state at camp (America/Detroit). */
export function detroitNow(): { minutes: number; dateKey: string; timeLabel: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" }).format(now);
  return {
    minutes: hour * 60 + minute,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    timeLabel
  };
}

/**
 * Which slot is happening right now — or, between periods, which slot is
 * most relevant (the upcoming one, or the last one after the day ends).
 * `inProgress` distinguishes "class is running" from "showing you the
 * nearest period". Pass the result of getSlotTimes() so detection honors
 * the edited bell schedule; defaults keep old call sites working.
 */
export function detectCurrentSlot(minutes: number, slotTimes: SlotTimes = DEFAULT_SLOT_TIMES): { slot: number; inProgress: boolean; note: string | null } {
  const slots = Object.entries(slotTimes).map(([slot, t]) => ({ slot: Number(slot), ...t }));
  // End is exclusive so back-to-back periods hand off cleanly: at exactly
  // 11:15 with period 1 ending and period 2 starting then, 11:15 is
  // period 2.
  for (const s of slots) {
    if (minutes >= s.start && minutes < s.end) return { slot: s.slot, inProgress: true, note: null };
  }
  const upcoming = slots.find((s) => minutes < s.start);
  if (upcoming) return { slot: upcoming.slot, inProgress: false, note: `Between periods — showing the upcoming period (${upcoming.label}).` };
  const last = slots[slots.length - 1];
  return { slot: last.slot, inProgress: false, note: "After the last period — showing the final period of the day." };
}
