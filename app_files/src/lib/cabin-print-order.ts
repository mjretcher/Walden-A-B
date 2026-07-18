/**
 * Cabin ordering for the PRINTED bunk sheets (full cabin sheets and the
 * staff-only sheet). The database sorts cabins alphabetically, which is
 * wrong on paper in two ways:
 *
 * 1. String compare puts "B10" before "B7" (the "1" sorts first), so
 *    double-digit cabins jump the line. Fixed generally by natural sort:
 *    letter prefix compared as text, numeric suffix compared as a number.
 * 2. Cabin order on the paper sheets is by camper AGE, not name — and
 *    cabin names don't encode age. Unit 2 boys is the one place this
 *    bites today (G4 houses the youngest and must print FIRST, before
 *    B7–B10), so it gets an explicit hand-ordered override below.
 *
 * Everything not covered by an override falls back to natural sort, which
 * for single-digit same-letter units is identical to the old alphabetical
 * order — so all girls units and boys units 1/3/4 print exactly as before.
 *
 * Used by the print pages only; on-screen boards keep DB order.
 */

type PrintableCabin = { name: string };

/**
 * Hand-ordered overrides, keyed "GENDER:UNIT" (Prisma enum values, e.g.
 * "MALE:UNIT2"). Names not in a unit's list sort AFTER the listed ones,
 * by natural sort — so a future new cabin still prints, just at the end,
 * until it's added here.
 */
const PRINT_ORDER_OVERRIDES: Record<string, string[]> = {
  "MALE:UNIT2": ["G4", "B7", "B8", "B9", "B10"]
};

/** Split "B10" -> ["B", 10]; names without a numeric suffix get NaN. */
function splitName(name: string): [string, number] {
  const match = /^([^0-9]*)(\d+)/.exec(name.trim());
  if (!match) return [name.trim().toUpperCase(), Number.NaN];
  return [match[1].toUpperCase(), Number.parseInt(match[2], 10)];
}

/** Numeric-aware name compare: B7 < B8 < B9 < B10; G2 < G3 < G12. */
function naturalCompare(a: string, b: string): number {
  const [prefixA, numA] = splitName(a);
  const [prefixB, numB] = splitName(b);
  if (prefixA !== prefixB) return prefixA < prefixB ? -1 : 1;
  if (Number.isNaN(numA) || Number.isNaN(numB)) return a.localeCompare(b);
  return numA - numB;
}

/**
 * Sort a unit's cabins into print order. Non-mutating: returns a new
 * array so callers can keep the fetched list untouched.
 */
export function sortCabinsForPrint<T extends PrintableCabin>(cabins: T[], gender: string, unit: string): T[] {
  const override = PRINT_ORDER_OVERRIDES[`${gender}:${unit}`];
  return [...cabins].sort((a, b) => {
    if (override) {
      const ia = override.findIndex((n) => n.toUpperCase() === a.name.trim().toUpperCase());
      const ib = override.findIndex((n) => n.toUpperCase() === b.name.trim().toUpperCase());
      // Both listed: override order. One listed: it goes first. Neither:
      // fall through to natural sort.
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
    }
    return naturalCompare(a.name, b.name);
  });
}
