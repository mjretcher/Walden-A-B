import { prisma } from "@/lib/prisma";

/**
 * Normalizes a name for matching — lowercase, trimmed, hyphens/apostrophes/
 * periods collapsed to spaces. Same normalization the Q2 cabin import
 * tool's own stale-CA-staff-record detection uses (see the comment on
 * possibleStaleCaStaffRecords in app/admin/import/q2-cabins/actions.ts) —
 * one shared convention rather than each caller inventing its own.
 */
export function normalizeName(value: string): string {
  return value.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Counselor Assistants are Camper records, not Staff records, so normally
 * they can't appear anywhere that only reads the Staff table. The reason
 * they sometimes do: CAs used to be routed through the staff pipeline
 * before that was corrected, which can leave a stray Staff row sitting
 * around with the same name as a real CA — disconnected from anything
 * registration actually reads, but still a perfectly normal, active,
 * screamEligible Staff record as far as any Staff-table query is
 * concerned.
 *
 * Returns the set of normalized names for active CAs this session, for
 * cross-referencing against Staff records and filtering out exactly those
 * stray rows. Used by the Staff Schedule report and the Scream Session
 * board — both places Mike specifically doesn't want CAs to appear,
 * since their Teaching Assistant assignments are handled entirely through
 * camper registration instead.
 */
export async function buildCaNameSet(sessionId: string): Promise<Set<string>> {
  const caCampers = await prisma.camper.findMany({
    where: { sessionId, active: true, counselorAssistant: true },
    select: { firstName: true, lastName: true }
  });
  return new Set(caCampers.map((camper) => normalizeName(`${camper.firstName} ${camper.lastName}`)));
}

export function isCaStaffRecord(person: { firstName: string; lastName: string }, caNameSet: Set<string>): boolean {
  return caNameSet.has(normalizeName(`${person.firstName} ${person.lastName}`));
}
