/**
 * Cabin ordering for the PRINTED bunk sheets (full cabin sheets and the
 * staff-only sheet). The database sorts cabins alphabetically, which is
 * wrong on paper in two ways:
 *
 * 1. String compare puts "B10" before "B7" (the "1" sorts first), so
 *    double-digit cabins jump the line. Fixed generally by natural sort:
 *    letter prefix compared as text, numeric suffix compared as a number.
 * 2. Cabin order on the paper sheets is by camper AGE, not name — and
 *    cabin names don't encode age.
 *
 * Precedence, per unit:
 *   1. MANUAL ORDER — Cabin.sortOrder, set by hand on the Cabin Print
 *      Order page (/bunk-management/cabin-order). If ANY cabin in the
 *      unit has a sortOrder, the unit is considered hand-ordered and
 *      sortOrder rules it (cabins without one sort after those that
 *      have one, by the fallback below). This is the go-forward way to
 *      express age order without code changes.
 *   2. Hand-coded overrides below — kept as the safety net so known age
 *      orders (Unit 2 boys: G4 first; Unit 4 girls: G5 last) are right
 *      even before/without anyone touching the ordering page.
 *   3. Natural name sort — identical to alphabetical for single-digit
 *      same-letter units, so ordinary units print exactly as always.
 *
 * Used by the print pages only; on-screen boards keep DB order.
 */

type PrintableCabin = { name: string; sortOrder?: number | null };

/**
 * Hand-ordered "these go FIRST" overrides, keyed "GENDER:UNIT" (Prisma
 * enum values, e.g. "MALE:UNIT2"). Names not in the list sort after the
 * listed ones — a future new cabin still prints, just at the end.
 */
const PRINT_ORDER_FIRST: Record<string, string[]> = {
  "MALE:UNIT2": ["G4", "B7", "B8", "B9", "B10"]
};

/**
 * Hand-ordered "these go LAST" overrides — same key scheme. Everything
 * not listed keeps its normal order ahead of these.
 */
const PRINT_ORDER_LAST: Record<string, string[]> = {
  "FEMALE:UNIT4": ["G5"]
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

function overrideIndex(list: string[] | undefined, name: string): number {
  if (!list) return -1;
  return list.findIndex((n) => n.toUpperCase() === name.trim().toUpperCase());
}

/** Override-aware fallback compare (steps 2 + 3 above). */
function fallbackCompare(a: string, b: string, gender: string, unit: string): number {
  const key = `${gender}:${unit}`;
  const first = PRINT_ORDER_FIRST[key];
  const last = PRINT_ORDER_LAST[key];

  // "Last" wins over everything: a cabin in the last-list sorts after
  // any cabin that isn't, and last-listed cabins keep their list order.
  const lastA = overrideIndex(last, a);
  const lastB = overrideIndex(last, b);
  if (lastA !== -1 || lastB !== -1) {
    if (lastA !== -1 && lastB !== -1) return lastA - lastB;
    return lastA !== -1 ? 1 : -1;
  }

  const firstA = overrideIndex(first, a);
  const firstB = overrideIndex(first, b);
  if (firstA !== -1 && firstB !== -1) return firstA - firstB;
  if (firstA !== -1) return -1;
  if (firstB !== -1) return 1;

  return naturalCompare(a, b);
}

/**
 * Sort a unit's cabins into print order. Non-mutating: returns a new
 * array so callers can keep the fetched list untouched.
 */
export function sortCabinsForPrint<T extends PrintableCabin>(cabins: T[], gender: string, unit: string): T[] {
  const handOrdered = cabins.some((cabin) => cabin.sortOrder !== null && cabin.sortOrder !== undefined);
  return [...cabins].sort((a, b) => {
    if (handOrdered) {
      const sa = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const sb = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      // Equal/both-missing sortOrder: settle by the fallback so the
      // result is still deterministic.
    }
    return fallbackCompare(a.name, b.name, gender, unit);
  });
}
