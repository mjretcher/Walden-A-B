"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { Unit, UserRole } from "@prisma/client";
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

export type FuzzyMatch = {
  id: string;
  name: string;
  currentCabinName: string | null;
  score: number;             // 0-100, higher = better
  reason: string;            // "Last name match", "Phonetic first name", "Substring"
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
  status: "match-no-change" | "match-cabin-change" | "match-unit-change" | "match-both-change" | "no-cabin" | "no-person" | "multiple-matches" | "duplicate-conflict";
  multipleMatches?: { id: string; currentCabinName: string | null }[];
  fuzzySuggestions?: FuzzyMatch[];
  notes?: string;
};

export type DiffResult = {
  generatedAt: string;
  sessionName: string;
  sessionYear: number;
  sessionCycle: string;
  sessionsOverview: { id: string; name: string; cycle: string; year: number; active: boolean; camperCount: number }[];
  activeStaffCount: number;
  totalStaffCount: number;
  totals: { in_file: number; matched: number; will_change: number; unmatched: number; ambiguous: number; cabin_missing: number; duplicate_conflicts: number };
  entries: DiffEntry[];
  unmatchedPeople: { role: string; name: string; cabin: string; roles?: string[] }[];
  missingCabins: string[];
  duplicateNameConflicts: { role: string; name: string; cabins: string[] }[];
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

  const [cabins, campers, staff, allSessions, camperCountsBySession, activeStaffCount, totalStaffCount] = await Promise.all([
    prisma.cabin.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, unit: true }
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, housingLabel: true }
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

  const staffByName = new Map<string, typeof staff>();
  for (const s of staff) {
    const key = `${norm(s.firstName)} ${norm(s.lastName)}`;
    if (!staffByName.has(key)) staffByName.set(key, []);
    staffByName.get(key)!.push(s);
  }

  const entries: DiffEntry[] = [];
  const unmatchedPeople: DiffResult["unmatchedPeople"] = [];
  const missingCabins = new Set<string>();

  assignments.forEach((p, importIndex) => {
    const key = `${norm(p.firstName)} ${norm(p.lastName)}`;
    const desiredCabin = cabinByName.get(p.cabin.toUpperCase());
    const desiredUnit = deriveUnit(p.unit_header);
    if (!desiredCabin) missingCabins.add(p.cabin);

    const candidates = p.role === "camper" ? (camperByName.get(key) ?? []) : (staffByName.get(key) ?? []);

    if (candidates.length === 0) {
      // No exact match — score the entire pool for similarity
      const pool = p.role === "camper" ? campers : staff;
      const scored: FuzzyMatch[] = [];
      for (const person of pool) {
        const { score, reason } = fuzzyScore(p.firstName, p.lastName, person.firstName, person.lastName);
        if (score >= 50) {
          scored.push({
            id: person.id,
            name: `${person.firstName} ${person.lastName}`,
            currentCabinName: person.cabin?.name ?? null,
            score,
            reason
          });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 3);

      entries.push({
        importIndex,
        role: p.role,
        importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin,
        desiredUnit,
        match: null,
        cabinExists: !!desiredCabin,
        cabinId: desiredCabin?.id ?? null,
        status: "no-person",
        fuzzySuggestions: top.length > 0 ? top : undefined
      });
      unmatchedPeople.push({ role: p.role, name: `${p.firstName} ${p.lastName}`, cabin: p.cabin, roles: p.roles });
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
        multipleMatches: candidates.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null }))
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

  const totals = {
    in_file: assignments.length,
    matched: entries.filter((e) => e.match !== null).length,
    will_change: entries.filter((e) => e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change").length,
    unmatched: entries.filter((e) => e.status === "no-person").length,
    ambiguous: entries.filter((e) => e.status === "multiple-matches").length,
    cabin_missing: entries.filter((e) => e.status === "no-cabin").length,
    duplicate_conflicts: entries.filter((e) => e.status === "duplicate-conflict").length
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
    duplicateNameConflicts
  };
}

/**
 * Apply the diff. Optionally accepts manual overrides — a map of importIndex
 * → dbPersonId — to handle fuzzy-matched names that the user confirmed.
 * For each override, we look up that person and apply the desired cabin/unit
 * from the file as if it had been a clean match.
 */
export async function applyQ2Diff(overrides?: Record<number, string>): Promise<{ ok: true; applied: number; overrideApplied: number } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const diff = await generateQ2Diff();
  const overrideMap = overrides ?? {};

  // Clean single matches with real cabins, that need a change
  const cleanChanges = diff.entries.filter((e) =>
    e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change"
  );

  // Manual-override targets: importIndex → dbId, only for no-person rows with a real cabin
  const overrideTargets: { importIndex: number; dbId: string; role: "camper" | "staff"; cabinId: string; desiredUnit: Unit | null }[] = [];
  for (const [importIndexStr, dbId] of Object.entries(overrideMap)) {
    const importIndex = Number(importIndexStr);
    const entry = diff.entries.find((e) => e.importIndex === importIndex);
    if (!entry) continue;
    if (entry.status !== "no-person") continue;          // only apply overrides where we said "no match"
    if (!entry.cabinExists || !entry.cabinId) continue;  // skip if cabin doesn't exist
    overrideTargets.push({
      importIndex,
      dbId,
      role: entry.role,
      cabinId: entry.cabinId,
      desiredUnit: entry.desiredUnit
    });
  }

  const totalToApply = cleanChanges.length + overrideTargets.length;
  if (totalToApply === 0) {
    return { ok: true, applied: 0, overrideApplied: 0 };
  }

  await prisma.$transaction(async (tx) => {
    // 1. Clean matches
    for (const entry of cleanChanges) {
      if (!entry.match || !entry.cabinId) continue;
      if (entry.role === "camper") {
        const data: { cabinId: string; unit?: Unit } = { cabinId: entry.cabinId };
        if (entry.desiredUnit !== null && entry.match.currentUnit !== entry.desiredUnit) {
          data.unit = entry.desiredUnit;
        }
        await tx.camper.update({ where: { id: entry.match.id }, data });
      } else {
        await tx.staff.update({
          where: { id: entry.match.id },
          data: { cabinId: entry.cabinId, housingLabel: null }
        });
      }
    }

    // 2. Manual overrides
    for (const o of overrideTargets) {
      if (o.role === "camper") {
        const data: { cabinId: string; unit?: Unit } = { cabinId: o.cabinId };
        if (o.desiredUnit !== null) data.unit = o.desiredUnit;
        await tx.camper.update({ where: { id: o.dbId }, data });
      } else {
        await tx.staff.update({
          where: { id: o.dbId },
          data: { cabinId: o.cabinId, housingLabel: null }
        });
      }
    }
  });

  for (const path of ["/dashboard", "/registration", "/scream-session", "/rosters", "/cards", "/admin/campers", "/admin/staff", "/admin/staff/cabins", "/admin/cabins", "/switches", "/area-dashboard"]) {
    revalidatePath(path);
  }

  return { ok: true, applied: cleanChanges.length, overrideApplied: overrideTargets.length };
}
