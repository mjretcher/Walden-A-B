"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { Gender, SwimLevel, Unit, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ImportPerson = {
  role: "staff" | "camper";
  firstName: string;
  lastName: string;
  full_name?: string;
  roles?: string[];
  grade?: string;
  stay?: string;
  counselorAssistant?: boolean;
  cabin: string;
  cabin_raw?: string;
  file_gender_hint?: string;
  unit_header?: string;
  row?: number;
  block?: number;
};

let assignmentsCache: ImportPerson[] | null = null;
function loadAssignments(): ImportPerson[] {
  if (assignmentsCache) return assignmentsCache;
  const filePath = path.join(process.cwd(), "data", "q2-assignments.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  assignmentsCache = JSON.parse(raw) as ImportPerson[];
  return assignmentsCache;
}

// Normalize names for matching: lowercase, trim, collapse whitespace, strip non-alpha
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

// Derive Unit from the unit_header text
function deriveUnit(unitHeader: string | undefined): Unit | null {
  if (!unitHeader) return null;
  const m = unitHeader.match(/Unit\s*(\d)/i);
  if (!m) return null;
  switch (m[1]) {
    case "1": return Unit.UNIT1;
    case "2": return Unit.UNIT2;
    case "3": return Unit.UNIT3;
    case "4": return Unit.UNIT4;
    default: return null;
  }
}

// Girls/Boys file hint is the only gender signal these cabin sheets carry —
// used only when creating a brand-new camper with no prior-session record to
// copy the real (verified) gender field from.
function deriveGender(fileGenderHint: string | undefined): Gender {
  return fileGenderHint === "BOYS_FILE" ? Gender.MALE : Gender.FEMALE;
}

// Grades should go up by ~1 per year, never down. Two unrelated kids sharing
// an exact first+last name is rare but not impossible at 500+ campers, and a
// grade that doesn't line up is the cheapest signal available (from these
// sheets alone) that an exact name match might not actually be the same
// person. This never blocks the auto-create — it only adds a note so Mike
// can spot-check the specific row before trusting the copied profile.
function gradeNumber(grade: string | null | undefined): number | null {
  const m = grade?.match(/\d+/);
  return m ? Number(m[0]) : null;
}
function gradeMismatchNote(sheetGrade: string | undefined, priorGrade: string | null): string | null {
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
  score: number;             // 0-100, higher = better
  reason: string;            // "Last name match", "Phonetic first name", "Substring"
  inTargetSession: boolean;  // false = this candidate lives in a different session (camper only) — picking it creates a copy instead of updating in place
  sessionName?: string;      // which session the candidate currently belongs to, when not the target session
};

export type DiffEntry = {
  importIndex: number;
  role: "staff" | "camper";
  importName: string;          // "First Last"
  desiredCabinName: string;    // e.g. "G6"
  desiredUnit: Unit | null;
  match: null | {
    id: string;
    currentCabinName: string | null;
    currentCabinId: string | null;
    currentUnit?: Unit | null;
    currentHousingLabel?: string | null;
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
  // Populated only for "will-create-new" / "will-create-from-prior" camper rows —
  // everything applyQ2Diff needs to actually create the record, computed once
  // here so apply doesn't have to re-derive it from the raw sheet row.
  createFromPriorId?: string;   // camper id in another session to copy the profile from
  createGender?: Gender;        // used when there's no prior record to copy gender from
  createGrade?: string | null;
};

export type DiffResult = {
  generatedAt: string;
  sessionName: string;
  sessionYear: number;
  sessionCycle: string;
  sessionsOverview: { id: string; name: string; cycle: string; year: number; active: boolean; camperCount: number }[];
  activeStaffCount: number;
  totalStaffCount: number;
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
  };
  entries: DiffEntry[];
  unmatchedPeople: { role: string; name: string; cabin: string; roles?: string[] }[];
  missingCabins: string[];
  duplicateNameConflicts: { role: string; name: string; cabins: string[] }[];
  possibleStaleCaStaffRecords: { name: string; staffId: string; currentCabinName: string | null }[];
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

// Score how similar two normalized names are. Higher = better.
// 100 = exact, 0 = unrelated.
function fuzzyScore(importFirst: string, importLast: string, dbFirst: string, dbLast: string): { score: number; reason: string } {
  const iF = norm(importFirst);
  const iL = norm(importLast);
  const dF = norm(dbFirst);
  const dL = norm(dbLast);

  // Exact last name match → strong signal
  if (iL === dL) {
    if (iF === dF) return { score: 100, reason: "Exact match" };
    // First name is close
    const fDist = editDistance(iF, dF);
    if (fDist <= 1) return { score: 95, reason: "Same last name, near-exact first" };
    if (fDist <= 2) return { score: 88, reason: "Same last name, similar first" };
    // First name starts with the same letter or is contained
    if (dF.startsWith(iF) || iF.startsWith(dF)) return { score: 80, reason: "Same last name, first-name prefix" };
    if (dF.includes(iF) || iF.includes(dF)) return { score: 75, reason: "Same last name, first-name contains" };
    return { score: 65, reason: "Same last name only" };
  }

  // Exact first name match
  if (iF === dF) {
    const lDist = editDistance(iL, dL);
    if (lDist <= 1) return { score: 90, reason: "Same first, near-exact last" };
    if (lDist <= 2) return { score: 78, reason: "Same first, similar last" };
    return { score: 55, reason: "Same first name only" };
  }

  // Near misses on full name
  const fullA = `${iF} ${iL}`;
  const fullB = `${dF} ${dL}`;
  const totalDist = editDistance(fullA, fullB);
  if (totalDist <= 2) return { score: 70, reason: "Near-exact full name" };
  if (totalDist <= 4) return { score: 50, reason: "Similar full name" };

  // Reversed (first<->last swap)
  if (iF === dL && iL === dF) return { score: 85, reason: "First/last name swapped" };

  return { score: 0, reason: "" };
}

export async function generateQ2Diff(): Promise<DiffResult> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const assignments = loadAssignments();

  // Load current state
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, year: true, cycle: true } });
  if (!session) {
    throw new Error("No active session");
  }

  const [cabins, campers, otherSessionCampers, staff, allSessions, camperCountsBySession, activeStaffCount, totalStaffCount] = await Promise.all([
    prisma.cabin.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, unit: true, counselorAssistant: true }
    }),
    // Campers that exist in the DB but under a DIFFERENT session (almost
    // certainly Q1 today). These are never updated directly — they're only
    // used as a data source: if a Q2-sheet camper matches one of these by
    // name, we copy their real profile (swim level, age, allergies, etc.)
    // into a brand-new Q2-scoped row instead of creating a blank one.
    prisma.camper.findMany({
      where: { sessionId: { not: session.id } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cabinId: true,
        cabin: { select: { name: true } },
        gender: true,
        genderIdentity: true,
        age: true,
        campGrade: true,
        swimLevel: true,
        medicalFlags: true,
        counselorAssistant: true,
        externalId: true,
        session: { select: { name: true } },
        allergies: { select: { allergyLabelId: true, notes: true } }
      }
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, housingLabel: true, nickname: true }
    }),
    prisma.session.findMany({ select: { id: true, name: true, cycle: true, year: true, active: true } }),
    prisma.camper.groupBy({ by: ["sessionId"], _count: { _all: true } }),
    prisma.staff.count({ where: { active: true } }),
    prisma.staff.count()
  ]);

  const camperCountMap = new Map<string | null, number>();
  for (const row of camperCountsBySession) camperCountMap.set(row.sessionId, row._count._all);
  const sessionsOverview: DiffResult["sessionsOverview"] = allSessions.map((s) => ({
    id: s.id,
    name: s.name,
    cycle: s.cycle,
    year: s.year,
    active: s.active,
    camperCount: camperCountMap.get(s.id) ?? 0
  }));

  // Build lookup maps
  const cabinByName = new Map<string, { id: string; name: string; unit: Unit }>();
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

  const staffByName = new Map<string, typeof staff>();
  for (const s of staff) {
    const key = `${norm(s.firstName)} ${norm(s.lastName)}`;
    if (!staffByName.has(key)) staffByName.set(key, []);
    staffByName.get(key)!.push(s);
  }

  const staffByNickname = new Map<string, typeof staff>();
  for (const s of staff) {
    if (!s.nickname) continue;
    const key = norm(s.nickname);
    if (!staffByNickname.has(key)) staffByNickname.set(key, []);
    staffByNickname.get(key)!.push(s);
  }

  const entries: DiffEntry[] = [];
  const unmatchedPeople: DiffResult["unmatchedPeople"] = [];
  const missingCabins = new Set<string>();

  assignments.forEach((p, importIndex) => {
    const key = `${norm(p.firstName)} ${norm(p.lastName)}`;
    const desiredCabin = cabinByName.get(p.cabin.toUpperCase());
    const desiredUnit = deriveUnit(p.unit_header);
    if (!desiredCabin) missingCabins.add(p.cabin);

    const candidates = p.role === "camper" ? (camperByName.get(key) ?? []) : (staffByName.get(key) ?? staffByNickname.get(key) ?? []);

    if (candidates.length === 0 && p.role === "camper") {
      // Not in the target session. Before giving up, check whether this
      // camper already exists under a different session (Q1) — if so we
      // want to copy their real profile forward instead of starting blank.
      const priorCandidates = otherCamperByName.get(key) ?? [];

      if (priorCandidates.length === 1) {
        const prior = priorCandidates[0];
        if (!desiredCabin) {
          entries.push({
            importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
            desiredCabinName: p.cabin, desiredUnit, match: null,
            cabinExists: false, cabinId: null, status: "no-cabin",
            notes: `Cabin '${p.cabin}' doesn't exist in the database — found this person in ${prior.session?.name ?? "another session"} but can't create them without a real cabin.`
          });
          return;
        }
        entries.push({
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: true, cabinId: desiredCabin.id, status: "will-create-from-prior",
          createFromPriorId: prior.id,
          notes: gradeMismatchNote(p.grade, prior.campGrade)
            ?? `Found in ${prior.session?.name ?? "another session"} (cabin ${prior.cabin?.name ?? "none"}) — will create a new record here with their existing profile.`
        });
        return;
      }

      if (priorCandidates.length > 1) {
        entries.push({
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: !!desiredCabin, cabinId: desiredCabin?.id ?? null, status: "multiple-matches",
          multipleMatches: priorCandidates.map((c) => ({
            id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: false, sessionName: c.session?.name
          }))
        });
        return;
      }

      // No exact match anywhere. Fuzzy-score against both pools — the
      // current session (unlikely to add much since it's empty of matches
      // by definition here) and every other session (where a nickname or
      // spelling variant of an existing camper would actually turn up).
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
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: !!desiredCabin, cabinId: desiredCabin?.id ?? null, status: "no-person",
          fuzzySuggestions: top
        });
        unmatchedPeople.push({ role: p.role, name: `${p.firstName} ${p.lastName}`, cabin: p.cabin, roles: p.roles });
        return;
      }

      // Genuinely new — doesn't exist anywhere in the database under any name we can find.
      if (!desiredCabin) {
        entries.push({
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: false, cabinId: null, status: "no-cabin",
          notes: `Cabin '${p.cabin}' doesn't exist in the database — this is a brand-new camper with nowhere to put them yet.`
        });
        return;
      }
      entries.push({
        importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin, desiredUnit, match: null,
        cabinExists: true, cabinId: desiredCabin.id, status: "will-create-new",
        createGender: deriveGender(p.file_gender_hint),
        createGrade: p.grade ?? null,
        notes: "No matching camper found anywhere in the database — will create a brand-new record. Swim level defaults to \"pending test\" since these sheets don't carry it."
      });
      return;
    }

    if (candidates.length === 0) {
      // Staff branch (unchanged pool — staff aren't session-scoped).
      const scored: FuzzyMatch[] = [];
      for (const person of staff) {
        const { score, reason } = fuzzyScore(p.firstName, p.lastName, person.firstName, person.lastName);
        if (score >= 50) scored.push({ id: person.id, name: `${person.firstName} ${person.lastName}`, currentCabinName: person.cabin?.name ?? null, score, reason, inTargetSession: true });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 3);

      if (top.length > 0) {
        entries.push({
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: !!desiredCabin, cabinId: desiredCabin?.id ?? null, status: "no-person",
          fuzzySuggestions: top
        });
        unmatchedPeople.push({ role: p.role, name: `${p.firstName} ${p.lastName}`, cabin: p.cabin, roles: p.roles });
        return;
      }

      // Brand-new staff member — nothing required beyond first/last name.
      if (!desiredCabin) {
        entries.push({
          importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
          desiredCabinName: p.cabin, desiredUnit, match: null,
          cabinExists: false, cabinId: null, status: "no-cabin",
          notes: `Cabin '${p.cabin}' doesn't exist in the database — this is a new staff member with nowhere to put them yet.`
        });
        return;
      }
      entries.push({
        importIndex, role: p.role, importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin, desiredUnit, match: null,
        cabinExists: true, cabinId: desiredCabin.id, status: "will-create-new",
        notes: "No matching staff member found — will create a new Staff record."
      });
      return;
    }

    if (candidates.length > 1) {
      entries.push({
        importIndex,
        role: p.role,
        importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin,
        desiredUnit,
        match: null,
        cabinExists: !!desiredCabin,
        cabinId: desiredCabin?.id ?? null,
        status: "multiple-matches",
        multipleMatches: candidates.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: true }))
      });
      return;
    }

    const person = candidates[0];
    const currentCabinId = person.cabinId;
    const currentCabinName = person.cabin?.name ?? null;
    const currentUnit = p.role === "camper" ? (person as typeof campers[number]).unit : null;
    const currentHousingLabel = p.role === "staff" ? (person as typeof staff[number]).housingLabel : null;

    if (!desiredCabin) {
      entries.push({
        importIndex,
        role: p.role,
        importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin,
        desiredUnit,
        match: { id: person.id, currentCabinName, currentCabinId, currentUnit, currentHousingLabel },
        cabinExists: false,
        cabinId: null,
        status: "no-cabin",
        notes: `Cabin '${p.cabin}' doesn't exist in the database`
      });
      return;
    }

    const cabinChange = currentCabinId !== desiredCabin.id;
    const unitChange = p.role === "camper" && desiredUnit !== null && currentUnit !== desiredUnit;
    let status: DiffEntry["status"];
    if (cabinChange && unitChange) status = "match-both-change";
    else if (cabinChange) status = "match-cabin-change";
    else if (unitChange) status = "match-unit-change";
    else status = "match-no-change";

    entries.push({
      importIndex,
      role: p.role,
      importName: `${p.firstName} ${p.lastName}`,
      desiredCabinName: p.cabin,
      desiredUnit,
      match: { id: person.id, currentCabinName, currentCabinId, currentUnit, currentHousingLabel },
      cabinExists: true,
      cabinId: desiredCabin.id,
      status
    });
  });

  // Flag people who appear more than once in the source file with different desired cabins —
  // this happens when a name is left in a stale cabin block while also added to a new one.
  // The apply step would silently let the later row win, so surface it for manual resolution.
  const byImportName = new Map<string, { role: string; name: string; cabins: Set<string> }>();
  for (const p of assignments) {
    const dupKey = `${p.role}:${norm(p.firstName)} ${norm(p.lastName)}`;
    if (!byImportName.has(dupKey)) {
      byImportName.set(dupKey, { role: p.role, name: `${p.firstName} ${p.lastName}`, cabins: new Set() });
    }
    byImportName.get(dupKey)!.cabins.add(p.cabin);
  }
  const duplicateNameConflicts: DiffResult["duplicateNameConflicts"] = [];
  const conflictKeys = new Set<string>();
  for (const [dupKey, { role, name, cabins }] of byImportName.entries()) {
    if (cabins.size > 1) {
      duplicateNameConflicts.push({ role, name, cabins: Array.from(cabins).sort() });
      conflictKeys.add(dupKey);
    }
  }

  // Any entry whose (role, name) landed in a conflict gets flagged and pulled out
  // of the auto-apply path — the file disagrees with itself about this person's
  // cabin, so it needs a human to pick one before either can be written.
  for (const entry of entries) {
    const src = assignments[entry.importIndex];
    const entryKey = `${src.role}:${norm(src.firstName)} ${norm(src.lastName)}`;
    if (conflictKeys.has(entryKey)) {
      entry.status = "duplicate-conflict";
    }
  }

  // CAs used to be routed through the staff pipeline (matching Q1's own
  // precedent) until this was corrected — registration eligibility runs
  // entirely on Camper.counselorAssistant, so a CA only "exists" for
  // registration purposes as a Camper record. Anyone flagged CA in this
  // sheet who ALSO exactly matches an existing Staff record is worth a
  // second look: that Staff row may be a stray created by the old logic
  // before this fix, sitting there disconnected from anything registration
  // actually reads.
  const possibleStaleCaStaffRecords: DiffResult["possibleStaleCaStaffRecords"] = [];
  for (const p of assignments) {
    if (!p.counselorAssistant) continue;
    const staffKey = `${norm(p.firstName)} ${norm(p.lastName)}`;
    const staffMatches = staffByName.get(staffKey) ?? [];
    for (const s of staffMatches) {
      possibleStaleCaStaffRecords.push({ name: `${p.firstName} ${p.lastName}`, staffId: s.id, currentCabinName: s.cabin?.name ?? null });
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
    grade_mismatch_flags: entries.filter((e) => e.status === "will-create-from-prior" && e.notes?.startsWith("⚠")).length
  };

  return {
    generatedAt: new Date().toISOString(),
    sessionName: session.name,
    sessionYear: session.year,
    sessionCycle: session.cycle,
    sessionsOverview,
    activeStaffCount,
    totalStaffCount,
    totals,
    entries,
    unmatchedPeople,
    missingCabins: Array.from(missingCabins).sort(),
    duplicateNameConflicts,
    possibleStaleCaStaffRecords
  };
}

/**
 * Apply the diff. Optionally accepts manual overrides — a map of importIndex
 * → dbPersonId — to handle fuzzy-matched names (or ambiguous multiple-match
 * candidates) that the user confirmed. If the confirmed candidate lives in a
 * different session (camper only), the override creates a fresh Q2 record
 * copying that candidate's profile rather than updating it in place.
 */
export async function applyQ2Diff(overrides?: Record<number, string>): Promise<{ ok: true; applied: number; overrideApplied: number; created: number } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const diff = await generateQ2Diff();
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) return { ok: false, error: "No active session" };
  const overrideMap = overrides ?? {};

  // Clean single matches with real cabins, that need a change
  const cleanChanges = diff.entries.filter((e) =>
    e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change"
  );

  const createNew = diff.entries.filter((e) => e.status === "will-create-new");
  const createFromPrior = diff.entries.filter((e) => e.status === "will-create-from-prior");

  // Manual-override targets: importIndex → dbId, for no-person / multiple-matches rows.
  // Split into plain updates (candidate already lives in the target session) vs
  // creates (candidate lives elsewhere — camper only — so we copy its profile).
  const overrideUpdateTargets: { importIndex: number; dbId: string; role: "camper" | "staff"; cabinId: string; desiredUnit: Unit | null }[] = [];
  const overrideCreateTargets: { importIndex: number; fromId: string; cabinId: string; desiredUnit: Unit | null }[] = [];
  for (const [importIndexStr, dbId] of Object.entries(overrideMap)) {
    const importIndex = Number(importIndexStr);
    const entry = diff.entries.find((e) => e.importIndex === importIndex);
    if (!entry) continue;
    if (entry.status !== "no-person" && entry.status !== "multiple-matches") continue;
    if (!entry.cabinExists || !entry.cabinId) continue;

    const candidate = entry.fuzzySuggestions?.find((s) => s.id === dbId) ?? entry.multipleMatches?.find((m) => m.id === dbId);
    if (!candidate) continue;

    if (entry.role === "staff" || candidate.inTargetSession) {
      overrideUpdateTargets.push({ importIndex, dbId, role: entry.role, cabinId: entry.cabinId, desiredUnit: entry.desiredUnit });
    } else {
      overrideCreateTargets.push({ importIndex, fromId: dbId, cabinId: entry.cabinId, desiredUnit: entry.desiredUnit });
    }
  }

  const totalToApply = cleanChanges.length + overrideUpdateTargets.length + createNew.length + createFromPrior.length + overrideCreateTargets.length;
  if (totalToApply === 0) {
    return { ok: true, applied: 0, overrideApplied: 0, created: 0 };
  }

  const assignments = loadAssignments();
  let createdCount = 0;

  // Fetch every "copy forward" source profile ONE time, up front, outside the
  // transaction. The original version did a tx.camper.findUnique() per record
  // *inside* the transaction — with ~230 of these in one batch that blew past
  // Prisma's default interactive-transaction time budget and failed with
  // P2028 ("transaction not found") partway through. Batching this into a
  // single findMany before the transaction starts turns ~230 extra round
  // trips into 1, and the transaction body below is now pure writes.
  const priorIds = Array.from(new Set([
    ...createFromPrior.map((e) => e.createFromPriorId).filter((id): id is string => !!id),
    ...overrideCreateTargets.map((o) => o.fromId)
  ]));
  const priorProfiles = priorIds.length > 0
    ? await prisma.camper.findMany({
        where: { id: { in: priorIds } },
        include: { allergies: { select: { allergyLabelId: true, notes: true } } }
      })
    : [];
  const priorById = new Map(priorProfiles.map((p) => [p.id, p]));

  await prisma.$transaction(async (tx) => {
    // 1. Clean matches — plain updates
    for (const entry of cleanChanges) {
      if (!entry.match || !entry.cabinId) continue;
      if (entry.role === "camper") {
        const data: { cabinId: string; unit?: Unit; counselorAssistant?: boolean } = { cabinId: entry.cabinId };
        if (entry.desiredUnit !== null && entry.match.currentUnit !== entry.desiredUnit) {
          data.unit = entry.desiredUnit;
        }
        if (assignments[entry.importIndex].counselorAssistant) data.counselorAssistant = true;
        await tx.camper.update({ where: { id: entry.match.id }, data });
      } else {
        await tx.staff.update({
          where: { id: entry.match.id },
          data: { cabinId: entry.cabinId, housingLabel: null }
        });
      }
    }

    // 2. Manual overrides that resolve to an existing in-session record — plain updates.
    // For campers, also correct the name to the sheet's spelling: if this
    // override is confirming "yes, this existing Q2 record IS the person on
    // my sheet," the record should carry the name Mike actually wrote down,
    // both so it reads right on rosters and so future diff runs recognize it
    // as an exact match instead of asking to reconfirm the same override
    // every single time.
    for (const o of overrideUpdateTargets) {
      if (o.role === "camper") {
        const data: { cabinId: string; unit?: Unit; firstName: string; lastName: string; counselorAssistant?: boolean } = {
          cabinId: o.cabinId,
          firstName: assignments[o.importIndex].firstName,
          lastName: assignments[o.importIndex].lastName
        };
        if (o.desiredUnit !== null) data.unit = o.desiredUnit;
        if (assignments[o.importIndex].counselorAssistant) data.counselorAssistant = true;
        await tx.camper.update({ where: { id: o.dbId }, data });
      } else {
        // Staff records predate this tool and are shared across quarters, so
        // the canonical firstName/lastName stay untouched — but per Mike,
        // most of these confirmations really are just a nickname or a typo
        // that was already corrected, so record the sheet's spelling as a
        // nickname alias. Future diffs match on nickname too, so this
        // specific override won't need reconfirming next time.
        await tx.staff.update({
          where: { id: o.dbId },
          data: {
            cabinId: o.cabinId,
            housingLabel: null,
            nickname: `${assignments[o.importIndex].firstName} ${assignments[o.importIndex].lastName}`
          }
        });
      }
    }

    // 3. Brand-new campers/staff with no prior record anywhere
    for (const entry of createNew) {
      if (!entry.cabinId) continue;
      if (entry.role === "camper") {
        await tx.camper.create({
          data: {
            firstName: assignments[entry.importIndex].firstName,
            lastName: assignments[entry.importIndex].lastName,
            gender: entry.createGender ?? Gender.UNSPECIFIED,
            campGrade: entry.createGrade ?? null,
            unit: entry.desiredUnit ?? Unit.UNIT1,
            cabinId: entry.cabinId,
            swimLevel: SwimLevel.PENDING_SWIM_TEST,
            counselorAssistant: assignments[entry.importIndex].counselorAssistant ?? false,
            active: true,
            sessionId: session.id
          }
        });
      } else {
        await tx.staff.create({
          data: {
            firstName: assignments[entry.importIndex].firstName,
            lastName: assignments[entry.importIndex].lastName,
            cabinId: entry.cabinId,
            active: true
          }
        });
      }
      createdCount += 1;
    }

    // 4. New Q2 campers copied forward from a matching record in another session.
    // Name comes from the SHEET, not the prior record — this is an exact
    // normalized-name match so they're the same in practice, but keeping this
    // consistent with #5 below matters more than it looks like it should.
    for (const entry of createFromPrior) {
      if (!entry.cabinId || !entry.createFromPriorId) continue;
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
          cabinId: entry.cabinId,
          swimLevel: prior.swimLevel,
          medicalFlags: prior.medicalFlags,
          counselorAssistant: Boolean(assignments[entry.importIndex].counselorAssistant) || prior.counselorAssistant,
          active: true,
          sessionId: session.id,
          externalId: prior.externalId
        }
      });
      if (prior.allergies.length > 0) {
        await tx.camperAllergy.createMany({
          data: prior.allergies.map((a) => ({ camperId: created.id, allergyLabelId: a.allergyLabelId, notes: a.notes }))
        });
      }
      createdCount += 1;
    }

    // 5. Manual overrides that resolve to a record in a different session — same copy-forward as #4.
    //
    // BUGFIX: this used to write prior.firstName/prior.lastName here. Since this
    // path only exists because the name DIDN'T exactly match (that's why it
    // needed a manual confirmation), the created record ended up spelled like
    // the OTHER session's record instead of the sheet — e.g. confirming "Joey
    // Chaplan" against a fuzzy match on Q1's "Joey Caplan" created a camper
    // named "Joey Caplan", which can never satisfy the sheet's "Joey Chaplan"
    // entry on a future diff. It would show as unmatched forever, look like
    // the override never took, and offer to match itself against itself.
    // Using the sheet's name here fixes that.
    for (const o of overrideCreateTargets) {
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
          cabinId: o.cabinId,
          swimLevel: prior.swimLevel,
          medicalFlags: prior.medicalFlags,
          counselorAssistant: Boolean(assignments[o.importIndex].counselorAssistant) || prior.counselorAssistant,
          active: true,
          sessionId: session.id,
          externalId: prior.externalId
        }
      });
      if (prior.allergies.length > 0) {
        await tx.camperAllergy.createMany({
          data: prior.allergies.map((a) => ({ camperId: created.id, allergyLabelId: a.allergyLabelId, notes: a.notes }))
        });
      }
      createdCount += 1;
    }
  }, { timeout: 120_000, maxWait: 15_000 });

  for (const p of ["/dashboard", "/registration", "/scream-session", "/rosters", "/cards", "/admin/campers", "/admin/staff", "/admin/staff/cabins", "/admin/cabins", "/switches", "/area-dashboard"]) {
    revalidatePath(p);
  }

  return {
    ok: true,
    applied: cleanChanges.length,
    overrideApplied: overrideUpdateTargets.length + overrideCreateTargets.length,
    created: createdCount
  };
}
