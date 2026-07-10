import { Period } from "@prisma/client";

/**
 * Maps the camp's daily schedule to clock times so the Right Now command
 * center can auto-detect which period it is. The app never had a
 * period→time mapping anywhere (the calendar table only knows A/B days),
 * so these are DEFAULTS — edit the numbers below to match the real bell
 * schedule and redeploy. The Right Now page always shows a manual period
 * override, so wrong defaults are never blocking, just less magical.
 *
 * All detection runs in America/Detroit regardless of where the server
 * lives (Vercel runs UTC), since "what period is it" is a wall-clock
 * question at camp.
 */

// Slot 1-5 → [startMinutes, endMinutes] since midnight, Detroit time.
// Slot 5 is Twilight (staff periods only — campers are with their cabins).
export const DEFAULT_SLOT_TIMES: Record<number, { start: number; end: number; label: string }> = {
  1: { start: 9 * 60 + 0, end: 10 * 60 + 10, label: "9:00–10:10" },
  2: { start: 10 * 60 + 20, end: 11 * 60 + 30, label: "10:20–11:30" },
  3: { start: 14 * 60 + 0, end: 15 * 60 + 10, label: "2:00–3:10" },
  4: { start: 15 * 60 + 20, end: 16 * 60 + 30, label: "3:20–4:30" },
  5: { start: 19 * 60 + 0, end: 20 * 60 + 15, label: "7:00–8:15" }
};

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
 * nearest period".
 */
export function detectCurrentSlot(minutes: number): { slot: number; inProgress: boolean; note: string | null } {
  const slots = Object.entries(DEFAULT_SLOT_TIMES).map(([slot, t]) => ({ slot: Number(slot), ...t }));
  for (const s of slots) {
    if (minutes >= s.start && minutes <= s.end) return { slot: s.slot, inProgress: true, note: null };
  }
  const upcoming = slots.find((s) => minutes < s.start);
  if (upcoming) return { slot: upcoming.slot, inProgress: false, note: `Between periods — showing the upcoming period (${upcoming.label}).` };
  const last = slots[slots.length - 1];
  return { slot: last.slot, inProgress: false, note: "After the last period — showing the final period of the day." };
}
