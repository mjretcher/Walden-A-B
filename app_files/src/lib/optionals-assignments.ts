import { Period } from "@prisma/client";

// Optionals only ever run during camper class periods -- Twilight (P5A/P5B)
// is staff-only and campers are with their cabins, same convention Rosters
// and Trip Planner already use (see CAMPER_PERIODS in lib/periods.ts).
export const OPTIONALS_A_PERIODS: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
export const OPTIONALS_B_PERIODS: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];
export const OPTIONALS_PERIODS: Period[] = [...OPTIONALS_A_PERIODS, ...OPTIONALS_B_PERIODS];

export function optionalsAssignmentRowKey(period: string, index: number) {
  return `${period}:${index}`;
}
