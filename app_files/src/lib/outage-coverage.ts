import { Period } from "@prisma/client";
import { readStringArray } from "@/lib/local-arrays";

// Deliberately a separate copy from Right Now's local outageCoversPeriod
// helper (src/app/right-now/page.tsx) rather than a shared import -- Right
// Now is safety-critical and changes to it should stay conservative and
// isolated, so new consumers of this logic (Rosters, etc.) get their own
// copy instead of creating a shared dependency that could someday couple
// an unrelated change back into Right Now's behavior.

export function outageCoversPeriod(outage: { fullDay: boolean; periods: string | null }, period: Period): boolean {
  if (outage.fullDay) return true;
  const list = readStringArray(outage.periods);
  return list.length === 0 || list.includes(period);
}

type OutagePerson = { id: string; firstName: string; lastName: string };

/** Join-table people plus the legacy single-FK person, deduped -- so
 * pre-migration outage rows still list who's actually on them. */
export function outageCampersOf(o: { campers: { camper: OutagePerson }[]; camper: OutagePerson | null }): OutagePerson[] {
  const list = o.campers.map((c) => c.camper);
  if (o.camper && !list.some((p) => p.id === o.camper!.id)) list.push(o.camper);
  return list;
}
