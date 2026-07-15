"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { Gender, SwimLevel, Unit, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Source data: Bree's Q3 (Second Session, weeks 5-7) camper list --
// First Name / Last Name / Session / Bunk / Camp Grade. Unlike the Q1/Q2
// cabin sheets, this is a single combined file (no separate girls/boys
// files, no staff rows) and it carries a per-camper "Session" designation
// string (e.g. "Second Session", "Two weeks Second Session", "Full Season",
// "Five Weeks, 3-7", "25CA_SIX WEEKS") that isn't present in the Q1/Q2
// format at all. That string is stored verbatim as a CamperSessionDesignation
// label -- the same field the Bunk Management print rosters already display
// -- rather than being parsed into WeekBlock enrollments, since the mapping
// from these free-text labels to WK1_2/WK3_4/WK5_6/WK7 blocks isn't defined
// anywhere in the app and guessing it silently would risk mis-scheduling a
// camper's attendance. A "25<CA>_..." prefix on the Session string is the
// sheet's own signal for counselor assistants (confirmed: every such row in
// the source file is 12th grade with no bunk listed), so it's used to set
// Camper.counselorAssistant -- CAs are Camper records, never Staff, per
// established convention.
type Q3ImportPerson = {
  firstName: string;
  lastName: string;
  cabin: string; // Bunk column; "" means the sheet listed no bunk for this person
  grade: string | null;
  sessionLabel: string;
  counselorAssistant: boolean;
};

let assignmentsCache: Q3ImportPerson[] | null = null;
function loadAssignments(): Q3ImportPerson[] {
  if (assignmentsCache) return assignmentsCache;
  const filePath = path.join(process.cwd(), "data", "q3-assignments.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  assignmentsCache = JSON.parse(raw) as Q3ImportPerson[];
  return assignmentsCache;
}

// Normalize names for matching: lowercase, trim, collapse whitespace, strip non-alpha
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

// Grades should go up by ~1 per year, never down. Two unrelated kids sharing
// an exact first+last name is rare but not impossible at 250+ campers, and a
// grade that doesn't line up is the cheapest signal available (from this
// sheet alone) that an exact name match might not actually be the same
// person. This never blocks the auto-create -- it only adds a note so Mike
// can spot-check the row before trusting the copied profile.
function gradeNumber(grade: string | null | undefined): number | null {
  const m = grade?.match(/\d+/);
  return m ? Number(m[0]) : null;
}
function gradeMismatchNote(sheetGrade: string | null, priorGrade: string | null): string | null {
  const sheetNum = gradeNumber(sheetGrade);
  const priorNum = gradeNumber(priorGrade);
  if (sheetNum === null || priorNum === null) return null;
  const delta = sheetNum - priorNum;
  if (delta < 0 || delta > 2) {
    return `⚠ Grade check: sheet says ${sheetGrade}, prior record says ${priorGrade} — double-check this is actually the same camper before trusting the copied profile.`;
  }
  return null;
}

export type FuzzyMatch = {
  id: string;
  name: string;
  currentCabinName: string | null;
  score: number;
  reason: string;
  inTargetSession: boolean;
  sessionName?: string;
};

export type DiffEntry = {
  importIndex: number;
  importName: string;
  sessionLabel: string;
  hasBunkInSheet: boolean;
  desiredCabinName: string; // "" when hasBunkInSheet is false
  desiredUnit: Unit | null;
  match: null | {
    id: string;
    currentCabinName: string | null;
    currentCabinId: string | null;
    currentUnit: Unit | null;
  };
  cabinExists: boolean;
  cabinId: string | null;
  status:
    | "match-no-change"
    | "match-cabin-change"
    | "match-unit-change"
    | "match-both-change"
    | "no-cabin"
    | "no-person"
    | "multiple-matches"
    | "duplicate-conflict"
    | "will-create-new"
    | "will-create-from-prior";
  multipleMatches?: { id: string; currentCabinName: string | null; inTargetSession: boolean; sessionName?: string }[];
  fuzzySuggestions?: FuzzyMatch[];
  notes?: string;
  createFromPriorId?: string;
  createGender?: Gender;
  createGrade?: string | null;
  preConflictStatus?: DiffEntry["status"];
  conflictGroupKey?: string;
};

export type DiffResult = {
  generatedAt: string;
  sessionId: string;
  sessionName: string;
  sessionYear: number;
  sessionCycle: string;
  sessionActive: boolean;
  sessionsOverview: { id: string; name: string; cycle: string; year: number; active: boolean; camperCount: number }[];
  totals: {
    in_file: number;
    matched: number;
    will_change: number;
    unmatched: number;
    ambiguous: number;
    cabin_missing: number;
    duplicate_conflicts: number;
    will_create_new: number;
    will_create_from_prior: number;
    grade_mismatch_flags: number;
    no_bunk_listed: number;
    auto_resolved_from_multiple_sessions: number;
  };
  entries: DiffEntry[];
  unmatchedPeople: { name: string; cabin: string }[];
  missingCabins: string[];
  duplicateNameConflicts: { name: string; cabins: string[] }[];
};

// Damerau-Levenshtein-ish distance, capped, for short name comparison.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[n];
}

function fuzzyScore(importFirst: string, importLast: string, dbFirst: string, dbLast: string): { score: number; reason: string } {
  const iF = norm(importFirst);
  const iL = norm(importLast);
  const dF = norm(dbFirst);
  const dL = norm(dbLast);

  if (iL === dL) {
    if (iF === dF) return { score: 100, reason: "Exact match" };
    const fDist = editDistance(iF, dF);
    if (fDist <= 1) return { score: 95, reason: "Same last name, near-exact first" };
    if (fDist <= 2) return { score: 88, reason: "Same last name, similar first" };
    if (dF.startsWith(iF) || iF.startsWith(dF)) return { score: 80, reason: "Same last name, first-name prefix" };
    if (dF.includes(iF) || iF.includes(dF)) return { score: 75, reason: "Same last name, first-name contains" };
    return { score: 65, reason: "Same last name only" };
  }

  if (iF === dF) {
    const lDist = editDistance(iL, dL);
    if (lDist <= 1) return { score: 90, reason: "Same first, near-exact last" };
    if (lDist <= 2) return { score: 78, reason: "Same first, similar last" };
    return { score: 55, reason: "Same first name only" };
  }

  const fullA = `${iF} ${iL}`;
  const fullB = `${dF} ${dL}`;
  const totalDist = editDistance(fullA, fullB);
  if (totalDist <= 2) return { score: 70, reason: "Near-exact full name" };
  if (totalDist <= 4) return { score: 50, reason: "Similar full name" };

  if (iF === dL && iL === dF) return { score: 85, reason: "First/last name swapped" };

  return { score: 0, reason: "" };
}

export async function listSessions(): Promise<{ id: string; name: string; cycle: string; year: number; active: boolean }[]> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  return prisma.session.findMany({
    select: { id: true, name: true, cycle: true, year: true, active: true },
    orderBy: { createdAt: "desc" }
  });
}

// targetSessionId is REQUIRED and explicit -- deliberately not defaulted to
// "whichever session is active." The whole reason for this tool existing
// separately from a plain active-session lookup is so Q3 can be built out
// (imported, reviewed) while a different session (Q2) stays active and live
// for everyone else searching, logging outages, etc. Defaulting to active
// here would silently point this at the wrong session the moment someone
// runs it before flipping the switch.
export async function generateQ3Diff(targetSessionId: string): Promise<DiffResult> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const assignments = loadAssignments();

  const session = await prisma.session.findUnique({
    where: { id: targetSessionId },
    select: { id: true, name: true, year: true, cycle: true, active: true }
  });
  if (!session) {
    throw new Error("That session no longer exists — refresh and pick another.");
  }

  const [cabins, campers, otherSessionCampers, allSessions, camperCountsBySession] = await Promise.all([
    prisma.cabin.findMany({ select: { id: true, name: true, unit: true, gender: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, unit: true, counselorAssistant: true }
    }),
    // Campers in the DB under a DIFFERENT session (Q1/Q2). Used only as a
    // data source: an exact-name match here means an existing Q3-sheet
    // camper is a stay-over, so their real profile (swim level, age,
    // allergies, medical flags) gets copied into a brand-new Q3-scoped row
    // instead of starting blank. Their Q1/Q2 week/bunk enrollment data is
    // intentionally NOT copied forward -- Q3 is a fresh cabin re-shuffle
    // with mostly new arrivals, so carrying forward a stale bunk would be
    // actively misleading rather than merely incomplete.
    prisma.camper.findMany({
      where: { sessionId: { not: session.id } },
      select: {
        id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } },
        gender: true, genderIdentity: true, age: true, campGrade: true, swimLevel: true, medicalFlags: true,
        counselorAssistant: true, externalId: true, updatedAt: true,
        session: { select: { name: true, createdAt: true } },
        allergies: { select: { allergyLabelId: true, notes: true } }
      }
    }),
    prisma.session.findMany({ select: { id: true, name: true, cycle: true, year: true, active: true } }),
    prisma.camper.groupBy({ by: ["sessionId"], _count: { _all: true } })
  ]);

  const camperCountMap = new Map<string | null, number>();
  for (const row of camperCountsBySession) camperCountMap.set(row.sessionId, row._count._all);
  const sessionsOverview: DiffResult["sessionsOverview"] = allSessions.map((s) => ({
    id: s.id, name: s.name, cycle: s.cycle, year: s.year, active: s.active, camperCount: camperCountMap.get(s.id) ?? 0
  }));

  const cabinByName = new Map<string, { id: string; name: string; unit: Unit; gender: Gender }>();
  for (const c of cabins) cabinByName.set(c.name.toUpperCase(), c);

  const camperByName = new Map<string, typeof campers>();
  for (const c of campers) {
    const key = `${norm(c.firstName)} ${norm(c.lastName)}`;
    if (!camperByName.has(key)) camperByName.set(key, []);
    camperByName.get(key)!.push(c);
  }

  const otherCamperByName = new Map<string, typeof otherSessionCampers>();
  for (const c of otherSessionCampers) {
    const key = `${norm(c.firstName)} ${norm(c.lastName)}`;
    if (!otherCamperByName.has(key)) otherCamperByName.set(key, []);
    otherCamperByName.get(key)!.push(c);
  }

  const entries: DiffEntry[] = [];
  const unmatchedPeople: DiffResult["unmatchedPeople"] = [];
  const missingCabins = new Set<string>();

  assignments.forEach((p, importIndex) => {
    const key = `${norm(p.firstName)} ${norm(p.lastName)}`;
    const hasBunkInSheet = p.cabin.trim() !== "";
    const desiredCabin = hasBunkInSheet ? cabinByName.get(p.cabin.toUpperCase()) : undefined;
    const desiredUnit = desiredCabin?.unit ?? null;
    if (hasBunkInSheet && !desiredCabin) missingCabins.add(p.cabin);

    const noBunkNote = !hasBunkInSheet
      ? "No bunk listed in this sheet — will save without a cabin assignment. Assign one manually in Bunk Management once you know where they're going."
      : null;

    const candidates = camperByName.get(key) ?? [];

    if (candidates.length === 0) {
      const priorCandidates = otherCamperByName.get(key) ?? [];

      if (priorCandidates.length === 1) {
        const prior = priorCandidates[0];
        if (hasBunkInSheet && !desiredCabin) {
          entries.push({
            importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
            desiredCabinName: p.cabin, desiredUnit, match: null, cabinExists: false, cabinId: null, status: "no-cabin",
            notes: `Cabin '${p.cabin}' doesn't exist in the database — found this person in ${prior.session?.name ?? "another session"} but can't create them without a real cabin.`
          });
          return;
        }
        entries.push({
          importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
          desiredCabinName: hasBunkInSheet ? p.cabin : "", desiredUnit, match: null,
          cabinExists: true, cabinId: desiredCabin?.id ?? null, status: "will-create-from-prior",
          createFromPriorId: prior.id,
          notes: [gradeMismatchNote(p.grade, prior.campGrade), noBunkNote].filter(Boolean).join(" ")
            || `Found in ${prior.session?.name ?? "another session"} (cabin ${prior.cabin?.name ?? "none"}) — will create a new Q3 record with their existing profile.`
        });
        return;
      }

      if (priorCandidates.length > 1) {
        // Every candidate here is an EXACT normalized-name match (that's how
        // otherCamperByName was built) -- in practice this means the same
        // kid attended more than one prior session (e.g. Full Season / Five
        // Weeks spans both Q1 and Q2), not two different kids who happen to
        // share a name. Rather than blocking on a manual pick for every one
        // of these (there were ~50), prefer the candidate from the most
        // recently created session -- its record was already copied forward
        // from the earlier one(s) by the Q2 tool, so it's the most complete
        // and up to date profile. Nothing about the other session's record
        // is touched or lost either way; this only decides which one gets
        // used as the template for the new Q3 row. The full candidate list
        // is still attached so this can be overridden per-row if it ever
        // picks wrong (e.g. a genuine grade-mismatch case).
        const ranked = [...priorCandidates].sort((a, b) => {
          const sessionDelta = (b.session?.createdAt?.getTime() ?? 0) - (a.session?.createdAt?.getTime() ?? 0);
          if (sessionDelta !== 0) return sessionDelta;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        });
        const chosen = ranked[0];
        const alternates = ranked.slice(1);

        if (hasBunkInSheet && !desiredCabin) {
          entries.push({
            importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
            desiredCabinName: p.cabin, desiredUnit, match: null, cabinExists: false, cabinId: null, status: "no-cabin",
            notes: `Cabin '${p.cabin}' doesn't exist in the database — found this person in ${priorCandidates.length} prior sessions but can't create them without a real cabin.`
          });
          return;
        }

        const autoResolveNote = `Auto-resolved: found in ${priorCandidates.length} sessions (exact name match — same camper attended more than once). Using the most recent: ${chosen.session?.name ?? "unknown session"}. ${alternates.map((a) => `Not used: ${a.session?.name ?? "unknown session"}`).join(", ")}. Click below to use a different one instead.`;
        entries.push({
          importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
          desiredCabinName: hasBunkInSheet ? p.cabin : "", desiredUnit, match: null,
          cabinExists: true, cabinId: desiredCabin?.id ?? null, status: "will-create-from-prior",
          createFromPriorId: chosen.id,
          multipleMatches: ranked.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: false, sessionName: c.session?.name })),
          notes: [gradeMismatchNote(p.grade, chosen.campGrade), noBunkNote, autoResolveNote].filter(Boolean).join(" ")
        });
        return;
      }

      const scored: FuzzyMatch[] = [];
      for (const person of campers) {
        const { score, reason } = fuzzyScore(p.firstName, p.lastName, person.firstName, person.lastName);
        if (score >= 50) scored.push({ id: person.id, name: `${person.firstName} ${person.lastName}`, currentCabinName: person.cabin?.name ?? null, score, reason, inTargetSession: true });
      }
      for (const person of otherSessionCampers) {
        const { score, reason } = fuzzyScore(p.firstName, p.lastName, person.firstName, person.lastName);
        if (score >= 50) scored.push({ id: person.id, name: `${person.firstName} ${person.lastName}`, currentCabinName: person.cabin?.name ?? null, score, reason, inTargetSession: false, sessionName: person.session?.name });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 3);

      if (top.length > 0) {
        entries.push({
          importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
          desiredCabinName: hasBunkInSheet ? p.cabin : "", desiredUnit, match: null,
          cabinExists: !!desiredCabin, cabinId: desiredCabin?.id ?? null, status: "no-person", fuzzySuggestions: top
        });
        unmatchedPeople.push({ name: `${p.firstName} ${p.lastName}`, cabin: p.cabin });
        return;
      }

      // Genuinely new -- no record anywhere under any name we can find.
      if (hasBunkInSheet && !desiredCabin) {
        entries.push({
          importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
          desiredCabinName: p.cabin, desiredUnit, match: null, cabinExists: false, cabinId: null, status: "no-cabin",
          notes: `Cabin '${p.cabin}' doesn't exist in the database — this is a brand-new camper with nowhere to put them yet.`
        });
        return;
      }
      const genderNote = !desiredCabin
        ? " Gender can't be inferred without a cabin — defaulting to unspecified; please set it manually."
        : "";
      entries.push({
        importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
        desiredCabinName: hasBunkInSheet ? p.cabin : "", desiredUnit, match: null,
        cabinExists: true, cabinId: desiredCabin?.id ?? null, status: "will-create-new",
        createGender: desiredCabin?.gender ?? Gender.UNSPECIFIED,
        createGrade: p.grade,
        notes: (noBunkNote ?? "No matching camper found anywhere in the database — will create a brand-new record. Swim level defaults to \"pending test\".") + genderNote
      });
      return;
    }

    if (candidates.length > 1) {
      entries.push({
        importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
        desiredCabinName: hasBunkInSheet ? p.cabin : "", desiredUnit, match: null,
        cabinExists: !!desiredCabin, cabinId: desiredCabin?.id ?? null, status: "multiple-matches",
        multipleMatches: candidates.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: true }))
      });
      return;
    }

    const person = candidates[0];
    const currentCabinId = person.cabinId;
    const currentCabinName = person.cabin?.name ?? null;
    const currentUnit = person.unit;

    if (hasBunkInSheet && !desiredCabin) {
      entries.push({
        importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
        desiredCabinName: p.cabin, desiredUnit,
        match: { id: person.id, currentCabinName, currentCabinId, currentUnit },
        cabinExists: false, cabinId: null, status: "no-cabin",
        notes: `Cabin '${p.cabin}' doesn't exist in the database`
      });
      return;
    }

    // No bunk listed for someone who already has a Q3 record -- leave their
    // existing cabin alone rather than clearing it based on an absence.
    const cabinChange = hasBunkInSheet && desiredCabin ? currentCabinId !== desiredCabin.id : false;
    const unitChange = hasBunkInSheet && desiredUnit !== null && currentUnit !== desiredUnit;
    let status: DiffEntry["status"];
    if (cabinChange && unitChange) status = "match-both-change";
    else if (cabinChange) status = "match-cabin-change";
    else if (unitChange) status = "match-unit-change";
    else status = "match-no-change";

    entries.push({
      importIndex, importName: `${p.firstName} ${p.lastName}`, sessionLabel: p.sessionLabel, hasBunkInSheet,
      desiredCabinName: hasBunkInSheet ? p.cabin : (currentCabinName ?? ""), desiredUnit,
      match: { id: person.id, currentCabinName, currentCabinId, currentUnit },
      cabinExists: true, cabinId: hasBunkInSheet ? (desiredCabin?.id ?? null) : currentCabinId, status,
      notes: noBunkNote ?? undefined
    });
  });

  // Flag people who appear more than once in the source file with different bunks.
  const byImportName = new Map<string, { name: string; cabins: Set<string> }>();
  for (const p of assignments) {
    const dupKey = `${norm(p.firstName)} ${norm(p.lastName)}`;
    if (!byImportName.has(dupKey)) byImportName.set(dupKey, { name: `${p.firstName} ${p.lastName}`, cabins: new Set() });
    if (p.cabin.trim() !== "") byImportName.get(dupKey)!.cabins.add(p.cabin);
  }
  const duplicateNameConflicts: DiffResult["duplicateNameConflicts"] = [];
  const conflictKeys = new Set<string>();
  for (const [dupKey, { name, cabins }] of byImportName.entries()) {
    if (cabins.size > 1) {
      duplicateNameConflicts.push({ name, cabins: Array.from(cabins).sort() });
      conflictKeys.add(dupKey);
    }
  }
  for (const entry of entries) {
    const src = assignments[entry.importIndex];
    const entryKey = `${norm(src.firstName)} ${norm(src.lastName)}`;
    if (conflictKeys.has(entryKey)) {
      entry.preConflictStatus = entry.status;
      entry.status = "duplicate-conflict";
      entry.conflictGroupKey = entryKey;
    }
  }

  const totals = {
    in_file: assignments.length,
    matched: entries.filter((e) => e.match !== null).length,
    will_change: entries.filter((e) => e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change").length,
    unmatched: entries.filter((e) => e.status === "no-person").length,
    ambiguous: entries.filter((e) => e.status === "multiple-matches").length,
    cabin_missing: entries.filter((e) => e.status === "no-cabin").length,
    duplicate_conflicts: entries.filter((e) => e.status === "duplicate-conflict").length,
    will_create_new: entries.filter((e) => e.status === "will-create-new").length,
    will_create_from_prior: entries.filter((e) => e.status === "will-create-from-prior").length,
    grade_mismatch_flags: entries.filter((e) => e.status === "will-create-from-prior" && e.notes?.startsWith("⚠")).length,
    no_bunk_listed: entries.filter((e) => !e.hasBunkInSheet).length,
    auto_resolved_from_multiple_sessions: entries.filter((e) => e.status === "will-create-from-prior" && (e.multipleMatches?.length ?? 0) > 1).length
  };

  return {
    generatedAt: new Date().toISOString(),
    sessionId: session.id, sessionName: session.name, sessionYear: session.year, sessionCycle: session.cycle, sessionActive: session.active,
    sessionsOverview, totals, entries, unmatchedPeople,
    missingCabins: Array.from(missingCabins).sort(),
    duplicateNameConflicts
  };
}

/**
 * Apply the diff. Every camper touched (created or updated) gets its
 * CamperSessionDesignation replaced with the sheet's current label -- old
 * designations on that record are cleared first, so the label always
 * reflects the latest sheet even on a re-run (e.g. Bree updates someone
 * from "Second Session" to "Two weeks Second Session" after the fact).
 */
export async function applyQ3Diff(targetSessionId: string, overrides?: Record<number, string>, resolvedConflictIndexes?: number[]): Promise<
  { ok: true; applied: number; overrideApplied: number; created: number } | { ok: false; error: string }
> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const diff = await generateQ3Diff(targetSessionId);
  const session = await prisma.session.findUnique({ where: { id: targetSessionId }, select: { id: true } });
  if (!session) return { ok: false, error: "That session no longer exists" };
  const overrideMap = overrides ?? {};
  const resolvedIndexSet = new Set(resolvedConflictIndexes ?? []);
  const overriddenIndexes = new Set(Object.keys(overrideMap).map(Number));

  const cleanChanges = diff.entries.filter((e) => e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change");
  const createNew = diff.entries.filter((e) => e.status === "will-create-new");
  // Excludes any row Mike manually overrode (most commonly an auto-resolved
  // multi-session match he chose to point at the OTHER candidate instead) --
  // otherwise it'd get created twice, once here using the auto-pick and
  // once via overrideCreateTargets using his actual choice.
  const createFromPrior = diff.entries.filter((e) => e.status === "will-create-from-prior" && !overriddenIndexes.has(e.importIndex));
  const resolvedConflicts = diff.entries.filter((e) => e.status === "duplicate-conflict" && resolvedIndexSet.has(e.importIndex));

  const overrideUpdateTargets: { importIndex: number; dbId: string; cabinId: string | null; desiredUnit: Unit | null }[] = [];
  const overrideCreateTargets: { importIndex: number; fromId: string; cabinId: string | null; desiredUnit: Unit | null }[] = [];
  for (const [importIndexStr, dbId] of Object.entries(overrideMap)) {
    const importIndex = Number(importIndexStr);
    const entry = diff.entries.find((e) => e.importIndex === importIndex);
    if (!entry) continue;
    // "will-create-from-prior" is only override-eligible here when it's an
    // auto-resolved multi-session match (multipleMatches populated) -- a
    // plain single-candidate stay-over has nothing to override to.
    const isAutoResolved = entry.status === "will-create-from-prior" && (entry.multipleMatches?.length ?? 0) > 1;
    if (entry.status !== "no-person" && entry.status !== "multiple-matches" && !isAutoResolved) continue;
    if (entry.hasBunkInSheet && (!entry.cabinExists || !entry.cabinId)) continue;

    const candidate = entry.fuzzySuggestions?.find((s) => s.id === dbId) ?? entry.multipleMatches?.find((m) => m.id === dbId);
    if (!candidate) continue;

    if (candidate.inTargetSession) {
      overrideUpdateTargets.push({ importIndex, dbId, cabinId: entry.cabinId, desiredUnit: entry.desiredUnit });
    } else {
      overrideCreateTargets.push({ importIndex, fromId: dbId, cabinId: entry.cabinId, desiredUnit: entry.desiredUnit });
    }
  }

  const totalToApply = cleanChanges.length + overrideUpdateTargets.length + createNew.length + createFromPrior.length + overrideCreateTargets.length + resolvedConflicts.length;
  if (totalToApply === 0) return { ok: true, applied: 0, overrideApplied: 0, created: 0 };


  const assignments = loadAssignments();
  let createdCount = 0;
  const overrideApplied = overrideUpdateTargets.length + overrideCreateTargets.length;

  const priorIds = Array.from(new Set([
    ...createFromPrior.map((e) => e.createFromPriorId).filter((id): id is string => !!id),
    ...overrideCreateTargets.map((o) => o.fromId),
    ...resolvedConflicts.map((e) => e.createFromPriorId).filter((id): id is string => !!id)
  ]));
  const priorProfiles = priorIds.length > 0
    ? await prisma.camper.findMany({
        where: { id: { in: priorIds } },
        include: { allergies: { select: { allergyLabelId: true, notes: true } } }
      })
    : [];
  const priorById = new Map(priorProfiles.map((p) => [p.id, p]));

  // Set (not create) the session designation for a camper inside the
  // transaction -- clears whatever's there first so re-runs stay idempotent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function setDesignation(tx: any, camperId: string, label: string) {
    await tx.camperSessionDesignation.deleteMany({ where: { camperId } });
    await tx.camperSessionDesignation.create({ data: { camperId, label, source: "q3-camper-import" } });
  }

  await prisma.$transaction(async (tx) => {
    // 1. Clean matches
    for (const entry of cleanChanges) {
      if (!entry.match) continue;
      const data: { cabinId?: string | null; unit?: Unit; counselorAssistant?: boolean } = {};
      if (entry.hasBunkInSheet) data.cabinId = entry.cabinId;
      if (entry.desiredUnit !== null && entry.match.currentUnit !== entry.desiredUnit) data.unit = entry.desiredUnit;
      if (assignments[entry.importIndex].counselorAssistant) data.counselorAssistant = true;
      await tx.camper.update({ where: { id: entry.match.id }, data });
      await setDesignation(tx, entry.match.id, entry.sessionLabel);
    }

    // 2. Manual overrides resolving to an existing Q3 record
    for (const o of overrideUpdateTargets) {
      const entry = diff.entries.find((e) => e.importIndex === o.importIndex)!;
      const data: { cabinId?: string; unit?: Unit; firstName: string; lastName: string; counselorAssistant?: boolean } = {
        firstName: assignments[o.importIndex].firstName,
        lastName: assignments[o.importIndex].lastName
      };
      if (entry.hasBunkInSheet && o.cabinId) data.cabinId = o.cabinId;
      if (o.desiredUnit !== null) data.unit = o.desiredUnit;
      if (assignments[o.importIndex].counselorAssistant) data.counselorAssistant = true;
      await tx.camper.update({ where: { id: o.dbId }, data });
      await setDesignation(tx, o.dbId, entry.sessionLabel);
    }

    // 3. Brand-new campers with no prior record anywhere
    for (const entry of createNew) {
      const created = await tx.camper.create({
        data: {
          firstName: assignments[entry.importIndex].firstName,
          lastName: assignments[entry.importIndex].lastName,
          gender: entry.createGender ?? Gender.UNSPECIFIED,
          campGrade: entry.createGrade ?? null,
          unit: entry.desiredUnit ?? Unit.UNIT1,
          cabinId: entry.hasBunkInSheet ? entry.cabinId : null,
          swimLevel: SwimLevel.PENDING_SWIM_TEST,
          counselorAssistant: assignments[entry.importIndex].counselorAssistant ?? false,
          active: true,
          sessionId: session.id
        }
      });
      await setDesignation(tx, created.id, entry.sessionLabel);
      createdCount += 1;
    }

    // 4. New Q3 campers copied forward from a matching record in another session
    for (const entry of createFromPrior) {
      if (!entry.createFromPriorId) continue;
      const prior = priorById.get(entry.createFromPriorId);
      if (!prior) continue;
      const created = await tx.camper.create({
        data: {
          firstName: assignments[entry.importIndex].firstName,
          lastName: assignments[entry.importIndex].lastName,
          gender: prior.gender,
          genderIdentity: prior.genderIdentity,
          age: prior.age,
          campGrade: assignments[entry.importIndex].grade ?? prior.campGrade,
          unit: entry.desiredUnit ?? prior.unit,
          cabinId: entry.hasBunkInSheet ? entry.cabinId : null,
          swimLevel: prior.swimLevel,
          medicalFlags: prior.medicalFlags,
          counselorAssistant: Boolean(assignments[entry.importIndex].counselorAssistant) || prior.counselorAssistant,
          active: true,
          sessionId: session.id,
          externalId: prior.externalId
        }
      });
      if (prior.allergies.length > 0) {
        await tx.camperAllergy.createMany({ data: prior.allergies.map((a) => ({ camperId: created.id, allergyLabelId: a.allergyLabelId, notes: a.notes })) });
      }
      await setDesignation(tx, created.id, entry.sessionLabel);
      createdCount += 1;
    }

    // 5. Manual overrides resolving to a record in a different session -- copy-forward
    for (const o of overrideCreateTargets) {
      const entry = diff.entries.find((e) => e.importIndex === o.importIndex)!;
      const prior = priorById.get(o.fromId);
      if (!prior) continue;
      const created = await tx.camper.create({
        data: {
          firstName: assignments[o.importIndex].firstName,
          lastName: assignments[o.importIndex].lastName,
          gender: prior.gender,
          genderIdentity: prior.genderIdentity,
          age: prior.age,
          campGrade: assignments[o.importIndex].grade ?? prior.campGrade,
          unit: o.desiredUnit ?? prior.unit,
          cabinId: entry.hasBunkInSheet ? o.cabinId : null,
          swimLevel: prior.swimLevel,
          medicalFlags: prior.medicalFlags,
          counselorAssistant: Boolean(assignments[o.importIndex].counselorAssistant) || prior.counselorAssistant,
          active: true,
          sessionId: session.id,
          externalId: prior.externalId
        }
      });
      if (prior.allergies.length > 0) {
        await tx.camperAllergy.createMany({ data: prior.allergies.map((a) => ({ camperId: created.id, allergyLabelId: a.allergyLabelId, notes: a.notes })) });
      }
      await setDesignation(tx, created.id, entry.sessionLabel);
      createdCount += 1;
    }

    // 6. Duplicate-conflict rows Mike explicitly picked a winner for
    for (const entry of resolvedConflicts) {
      const preStatus = entry.preConflictStatus;
      if (entry.match && (preStatus === "match-cabin-change" || preStatus === "match-unit-change" || preStatus === "match-both-change")) {
        const data: { cabinId?: string | null; unit?: Unit; counselorAssistant?: boolean } = {};
        if (entry.hasBunkInSheet) data.cabinId = entry.cabinId;
        if (entry.desiredUnit !== null && entry.match.currentUnit !== entry.desiredUnit) data.unit = entry.desiredUnit;
        if (assignments[entry.importIndex].counselorAssistant) data.counselorAssistant = true;
        await tx.camper.update({ where: { id: entry.match.id }, data });
        await setDesignation(tx, entry.match.id, entry.sessionLabel);
        continue;
      }
      if (entry.createFromPriorId) {
        const prior = priorById.get(entry.createFromPriorId);
        if (!prior) continue;
        const created = await tx.camper.create({
          data: {
            firstName: assignments[entry.importIndex].firstName,
            lastName: assignments[entry.importIndex].lastName,
            gender: prior.gender,
            genderIdentity: prior.genderIdentity,
            age: prior.age,
            campGrade: assignments[entry.importIndex].grade ?? prior.campGrade,
            unit: entry.desiredUnit ?? prior.unit,
            cabinId: entry.hasBunkInSheet ? entry.cabinId : null,
            swimLevel: prior.swimLevel,
            medicalFlags: prior.medicalFlags,
            counselorAssistant: Boolean(assignments[entry.importIndex].counselorAssistant) || prior.counselorAssistant,
            active: true,
            sessionId: session.id,
            externalId: prior.externalId
          }
        });
        if (prior.allergies.length > 0) {
          await tx.camperAllergy.createMany({ data: prior.allergies.map((a) => ({ camperId: created.id, allergyLabelId: a.allergyLabelId, notes: a.notes })) });
        }
        await setDesignation(tx, created.id, entry.sessionLabel);
        createdCount += 1;
        continue;
      }
      // preConflictStatus was will-create-new
      const created = await tx.camper.create({
        data: {
          firstName: assignments[entry.importIndex].firstName,
          lastName: assignments[entry.importIndex].lastName,
          gender: entry.createGender ?? Gender.UNSPECIFIED,
          campGrade: entry.createGrade ?? null,
          unit: entry.desiredUnit ?? Unit.UNIT1,
          cabinId: entry.hasBunkInSheet ? entry.cabinId : null,
          swimLevel: SwimLevel.PENDING_SWIM_TEST,
          counselorAssistant: assignments[entry.importIndex].counselorAssistant ?? false,
          active: true,
          sessionId: session.id
        }
      });
      await setDesignation(tx, created.id, entry.sessionLabel);
      createdCount += 1;
    }
  }, { timeout: 120_000, maxWait: 15_000 });

  for (const p of ["/dashboard", "/registration", "/scream-session", "/rosters", "/cards", "/admin/campers", "/bunk-management", "/switches", "/area-dashboard"]) {
    revalidatePath(p);
  }

  return { ok: true, applied: cleanChanges.length, overrideApplied, created: createdCount };
}
