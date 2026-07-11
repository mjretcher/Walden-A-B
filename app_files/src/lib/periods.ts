import { Gender, Period, SwimLevel, Unit } from "@prisma/client";

export const CAMPER_PERIODS: Period[] = [
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A,
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B
];

export const STAFF_PERIODS: Period[] = [
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A,
  Period.P5A,
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B,
  Period.P5B
];

export const PERIOD_LABEL: Record<Period, string> = {
  [Period.P1A]: "1A",
  [Period.P2A]: "2A",
  [Period.P3A]: "3A",
  [Period.P4A]: "4A",
  [Period.P5A]: "5A",
  [Period.P1B]: "1B",
  [Period.P2B]: "2B",
  [Period.P3B]: "3B",
  [Period.P4B]: "4B",
  [Period.P5B]: "5B"
};

export const TWILIGHT_PERIODS: Period[] = [Period.P5A, Period.P5B];

export const PERIOD_DISPLAY_LABEL: Record<Period, string> = {
  ...PERIOD_LABEL,
  [Period.P5B]: "5B • Twilight",
  [Period.P5A]: "5A • Twilight"
};

export const UNIT_LABEL: Record<Unit, string> = {
  [Unit.UNIT1]: "Unit 1",
  [Unit.UNIT2]: "Unit 2",
  [Unit.UNIT3]: "Unit 3",
  [Unit.UNIT4]: "Unit 4"
};

export const ALL_UNITS: Unit[] = [Unit.UNIT1, Unit.UNIT2, Unit.UNIT3, Unit.UNIT4];

// Compact unit codes for tight spaces (per-class breakdown chips) where
// the full "Unit 1" label would crowd the card.
export const UNIT_CODE: Record<Unit, string> = {
  [Unit.UNIT1]: "U1",
  [Unit.UNIT2]: "U2",
  [Unit.UNIT3]: "U3",
  [Unit.UNIT4]: "U4"
};

// Canonical gender labels — mirrors the GENDER_LABEL maps that had been
// hand-duplicated in a couple of admin client components; new code should
// import from here instead of redefining it locally.
export const GENDER_LABEL: Record<Gender, string> = {
  [Gender.MALE]: "Male",
  [Gender.FEMALE]: "Female",
  [Gender.NON_BINARY]: "Non-binary",
  [Gender.UNSPECIFIED]: "Unspecified"
};

export const GENDER_CODE: Record<Gender, string> = {
  [Gender.MALE]: "M",
  [Gender.FEMALE]: "F",
  [Gender.NON_BINARY]: "NB",
  [Gender.UNSPECIFIED]: "U"
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

// For 2-period (double-block) classes: the period immediately following a
// given period WITHIN THE SAME DAY. A-day and B-day never chain together, and
// the 4th period of each day has no successor (twilight P5A/P5B is excluded
// from double-block classes). Returns null when there is no valid partner.
export const NEXT_CONSECUTIVE_PERIOD: Partial<Record<Period, Period>> = {
  [Period.P1A]: Period.P2A,
  [Period.P2A]: Period.P3A,
  [Period.P3A]: Period.P4A,
  [Period.P1B]: Period.P2B,
  [Period.P2B]: Period.P3B,
  [Period.P3B]: Period.P4B
};

export function nextConsecutivePeriod(period: Period): Period | null {
  return NEXT_CONSECUTIVE_PERIOD[period] ?? null;
}

export function previousConsecutivePeriod(period: Period): Period | null {
  const entry = Object.entries(NEXT_CONSECUTIVE_PERIOD).find(([, next]) => next === period);
  return entry ? (entry[0] as Period) : null;
}
