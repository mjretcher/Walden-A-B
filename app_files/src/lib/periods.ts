import { Period, SwimLevel, Unit } from "@prisma/client";

export const CAMPER_PERIODS: Period[] = [
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B,
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A
];

export const STAFF_PERIODS: Period[] = [
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B,
  Period.P5B,
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A,
  Period.P5A
];

export const PERIOD_LABEL: Record<Period, string> = {
  [Period.P1B]: "1B",
  [Period.P2B]: "2B",
  [Period.P3B]: "3B",
  [Period.P4B]: "4B",
  [Period.P5B]: "5B",
  [Period.P1A]: "1A",
  [Period.P2A]: "2A",
  [Period.P3A]: "3A",
  [Period.P4A]: "4A",
  [Period.P5A]: "5A"
};

export const UNIT_LABEL: Record<Unit, string> = {
  [Unit.UNIT1]: "Unit 1",
  [Unit.UNIT2]: "Unit 2",
  [Unit.UNIT3]: "Unit 3",
  [Unit.UNIT4]: "Unit 4"
};

export const SWIM_LABEL: Record<SwimLevel, string> = {
  [SwimLevel.BLUEGILL]: "Bluegill",
  [SwimLevel.WALLEYE]: "Walleye",
  [SwimLevel.MUSKIE]: "Muskie",
  [SwimLevel.PENDING_SWIM_TEST]: "Pending Swim Test"
};

export const SWIM_CODE: Record<SwimLevel, string> = {
  [SwimLevel.BLUEGILL]: "B",
  [SwimLevel.WALLEYE]: "W",
  [SwimLevel.MUSKIE]: "M",
  [SwimLevel.PENDING_SWIM_TEST]: "P"
};

export function periodFromLabel(label: string): Period {
  const normalized = label.trim().toUpperCase();
  const match = Object.entries(PERIOD_LABEL).find(([, value]) => value === normalized);
  if (!match) throw new Error(`Unknown period label: ${label}`);
  return match[0] as Period;
}
