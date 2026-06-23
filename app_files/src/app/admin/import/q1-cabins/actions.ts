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
  const filePath = path.join(process.cwd(), "data", "q1-assignments.json");
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
  status: "match-no-change" | "match-cabin-change" | "match-unit-change" | "match-both-change" | "no-cabin" | "no-person" | "multiple-matches";
  multipleMatches?: { id: string; currentCabinName: string | null }[];
  notes?: string;
};

export type DiffResult = {
  generatedAt: string;
  totals: { in_file: number; matched: number; will_change: number; unmatched: number; ambiguous: number; cabin_missing: number };
  entries: DiffEntry[];
  unmatchedPeople: { role: string; name: string; cabin: string; roles?: string[] }[];
  missingCabins: string[];
};

export async function generateQ1Diff(): Promise<DiffResult> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const assignments = loadAssignments();

  // Load current state
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) {
    throw new Error("No active session");
  }

  const [cabins, campers, staff] = await Promise.all([
    prisma.cabin.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, unit: true }
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, cabin: { select: { name: true } }, housingLabel: true }
    })
  ]);

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
      entries.push({
        importIndex,
        role: p.role,
        importName: `${p.firstName} ${p.lastName}`,
        desiredCabinName: p.cabin,
        desiredUnit,
        match: null,
        cabinExists: !!desiredCabin,
        cabinId: desiredCabin?.id ?? null,
        status: "no-person"
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

  const totals = {
    in_file: assignments.length,
    matched: entries.filter((e) => e.match !== null).length,
    will_change: entries.filter((e) => e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change").length,
    unmatched: entries.filter((e) => e.status === "no-person").length,
    ambiguous: entries.filter((e) => e.status === "multiple-matches").length,
    cabin_missing: entries.filter((e) => e.status === "no-cabin").length
  };

  return {
    generatedAt: new Date().toISOString(),
    totals,
    entries,
    unmatchedPeople,
    missingCabins: Array.from(missingCabins).sort()
  };
}

export async function applyQ1Diff(): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const diff = await generateQ1Diff();

  // Only apply entries with a clean single match and a real cabin
  const toApply = diff.entries.filter((e) =>
    e.status === "match-cabin-change" || e.status === "match-unit-change" || e.status === "match-both-change"
  );

  if (toApply.length === 0) {
    return { ok: true, applied: 0 };
  }

  // Apply in a transaction, batched per person
  await prisma.$transaction(async (tx) => {
    for (const entry of toApply) {
      if (!entry.match || !entry.cabinId) continue;

      if (entry.role === "camper") {
        const data: { cabinId: string; unit?: Unit } = { cabinId: entry.cabinId };
        if (entry.desiredUnit !== null && entry.match.currentUnit !== entry.desiredUnit) {
          data.unit = entry.desiredUnit;
        }
        await tx.camper.update({ where: { id: entry.match.id }, data });
      } else {
        // Staff: cabin change only (clear housingLabel if we're setting a real cabin)
        await tx.staff.update({
          where: { id: entry.match.id },
          data: { cabinId: entry.cabinId, housingLabel: null }
        });
      }
    }
  });

  // Revalidate everything
  for (const path of ["/dashboard", "/registration", "/scream-session", "/rosters", "/cards", "/admin/campers", "/admin/staff", "/admin/staff/cabins", "/switches", "/area-dashboard"]) {
    revalidatePath(path);
  }

  return { ok: true, applied: toApply.length };
}
