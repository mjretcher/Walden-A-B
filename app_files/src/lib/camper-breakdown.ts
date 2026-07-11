import { Gender, Unit } from "@prisma/client";
import { GENDER_CODE } from "@/lib/periods";

export type GenderTally = Partial<Record<Gender, number>>;
export type UnitGenderTally = Partial<Record<Unit, GenderTally>>;

const GENDER_ORDER: Gender[] = [Gender.MALE, Gender.FEMALE, Gender.NON_BINARY, Gender.UNSPECIFIED];

/**
 * Tallies a flat list of {unit, gender} pairs — typically the campers
 * behind a set of registrations — into a unit → gender → count map. Powers
 * the "broken down by unit and gender" table on Right Now and Trip
 * Planner, so a scenario like "what does Waterfront look like if Unit 3
 * and 4 leave" can be read straight off the grid instead of hand-counted.
 */
export function tallyByUnitAndGender(people: { unit: Unit; gender: Gender }[]): UnitGenderTally {
  const tally: UnitGenderTally = {};
  for (const p of people) {
    if (!tally[p.unit]) tally[p.unit] = {};
    const cell = tally[p.unit]!;
    cell[p.gender] = (cell[p.gender] ?? 0) + 1;
  }
  return tally;
}

export function genderTallyTotal(cell?: GenderTally): number {
  if (!cell) return 0;
  return GENDER_ORDER.reduce((sum, g) => sum + (cell[g] ?? 0), 0);
}

/** Compact "8M 7F" style label for one cell. Omits zero genders; "—" when
 * empty, so a mixed roster doesn't force every cell to list all 4 genders. */
export function formatGenderTally(cell?: GenderTally): string {
  const parts = GENDER_ORDER.filter((g) => (cell?.[g] ?? 0) > 0).map((g) => `${cell![g]}${GENDER_CODE[g]}`);
  return parts.length ? parts.join(" ") : "—";
}
