"use server";

import { revalidatePath } from "next/cache";
import { Gender, SwimLevel, Unit, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCabinWorkbook, type ParsedCamper } from "@/lib/bunk-import-parser";

const importConsumerPaths = [
  "/bunk-management",
  "/bunk-management/board",
  "/bunk-management/print",
  "/dashboard",
  "/registration",
  "/rosters",
  "/cards",
  "/admin/campers"
];

function revalidateImportConsumers() {
  for (const path of importConsumerPaths) revalidatePath(path);
}

// Same normalize-for-matching convention as q1-cabins/q2-cabins.
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

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
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
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
    return { score: 65, reason: "Same last name only" };
  }
  if (iF === dF) {
    const lDist = editDistance(iL, dL);
    if (lDist <= 1) return { score: 90, reason: "Same first, near-exact last" };
    if (lDist <= 2) return { score: 78, reason: "Same first, similar last" };
    return { score: 55, reason: "Same first name only" };
  }
  const totalDist = editDistance(`${iF} ${iL}`, `${dF} ${dL}`);
  if (totalDist <= 2) return { score: 70, reason: "Near-exact full name" };
  if (totalDist <= 4) return { score: 50, reason: "Similar full name" };
  if (iF === dL && iL === dF) return { score: 85, reason: "First/last name swapped" };
  return { score: 0, reason: "" };
}

export type FuzzyMatch = { id: string; name: string; currentCabinName: string | null; score: number; reason: string; inTargetSession: boolean; sessionName?: string };

export type ImportDiffEntry = {
  parsedIndex: number;
  importName: string;
  desiredCabinName: string;
  cabinExists: boolean;
  cabinId: string | null;
  desiredUnit: Unit | null;
  grade: string | null;
  session: string | null;
  match: null | { id: string; currentCabinName: string | null; currentUnit: Unit };
  status: "match-no-change" | "match-cabin-change" | "no-cabin" | "no-person" | "multiple-matches" | "will-create-new" | "will-create-from-prior";
  multipleMatches?: { id: string; currentCabinName: string | null; inTargetSession: boolean; sessionName?: string }[];
  fuzzySuggestions?: FuzzyMatch[];
  createFromPriorId?: string;
  notes?: string;
};

export type ImportDiffResult = {
  generatedAt: string;
  sessionName: string;
  sessionCycle: string;
  sessionYear: number;
  gender: Gender;
  sessionId: string;
  sheetsParsed: string[];
  skippedStaffCa: { name: string; tag: string; cabinName: string }[];
  missingCabins: string[];
  totals: { in_file: number; matched: number; will_change: number; unmatched: number; ambiguous: number; cabin_missing: number; will_create_new: number; will_create_from_prior: number };
  entries: ImportDiffEntry[];
};

export async function generateImportDiff(formData: FormData): Promise<{ ok: true; campers: ParsedCamper[]; diff: ImportDiffResult } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const file = formData.get("file");
  const genderRaw = String(formData.get("gender") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
  if (genderRaw !== "MALE" && genderRaw !== "FEMALE") return { ok: false, error: "Select Boys or Girls." };
  const gender = genderRaw as Gender;

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true } });
  if (!session) return { ok: false, error: "No active session." };

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseCabinWorkbook(buffer);
  } catch (err) {
    return { ok: false, error: `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (parsed.campers.length === 0) {
    return { ok: false, error: "No campers found in that file — double check it's the cabin sheet, not something else." };
  }

  const [cabins, sessionCampers, otherCampers] = await Promise.all([
    prisma.cabin.findMany({ where: { gender }, select: { id: true, name: true, unit: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, unit: true, cabin: { select: { name: true } } }
    }),
    prisma.camper.findMany({
      where: { sessionId: { not: session.id } },
      select: {
        id: true, firstName: true, lastName: true, cabinId: true, unit: true, gender: true, genderIdentity: true,
        age: true, campGrade: true, swimLevel: true, medicalFlags: true, counselorAssistant: true, externalId: true,
        cabin: { select: { name: true } }, session: { select: { name: true } },
        allergies: { select: { allergyLabelId: true, notes: true } },
        weekEnrollments: { select: { weekBlock: true, cabinId: true, cabinName: true } }
      }
    })
  ]);

  const cabinByName = new Map(cabins.map((c) => [c.name.toUpperCase(), c]));
  const missingCabins = new Set<string>();
  for (const name of parsed.cabinNames) {
    if (!cabinByName.has(name.toUpperCase())) missingCabins.add(name);
  }

  const sessionCamperByName = new Map<string, typeof sessionCampers>();
  for (const c of sessionCampers) {
    const key = `${norm(c.firstName)} ${norm(c.lastName)}`;
    if (!sessionCamperByName.has(key)) sessionCamperByName.set(key, []);
    sessionCamperByName.get(key)!.push(c);
  }
  const otherCamperByName = new Map<string, typeof otherCampers>();
  for (const c of otherCampers) {
    const key = `${norm(c.firstName)} ${norm(c.lastName)}`;
    if (!otherCamperByName.has(key)) otherCamperByName.set(key, []);
    otherCamperByName.get(key)!.push(c);
  }

  const entries: ImportDiffEntry[] = [];

  parsed.campers.forEach((p, parsedIndex) => {
    const key = `${norm(p.firstName)} ${norm(p.lastName)}`;
    const desiredCabin = cabinByName.get(p.cabinName.toUpperCase());
    const desiredUnit = desiredCabin?.unit ?? null;
    const base = {
      parsedIndex,
      importName: `${p.firstName} ${p.lastName}`,
      desiredCabinName: p.cabinName,
      cabinExists: !!desiredCabin,
      cabinId: desiredCabin?.id ?? null,
      desiredUnit,
      grade: p.grade,
      session: p.session
    };

    const inSession = sessionCamperByName.get(key) ?? [];
    if (inSession.length > 1) {
      entries.push({ ...base, match: null, status: "multiple-matches", multipleMatches: inSession.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: true })) });
      return;
    }
    if (inSession.length === 1) {
      const c = inSession[0];
      if (!desiredCabin) {
        entries.push({ ...base, match: { id: c.id, currentCabinName: c.cabin?.name ?? null, currentUnit: c.unit }, status: "no-cabin", notes: `Cabin "${p.cabinName}" doesn't exist yet — create it on the Cabins screen first.` });
        return;
      }
      const noChange = c.cabinId === desiredCabin.id;
      entries.push({ ...base, match: { id: c.id, currentCabinName: c.cabin?.name ?? null, currentUnit: c.unit }, status: noChange ? "match-no-change" : "match-cabin-change" });
      return;
    }

    // Not in the active session. Check other sessions for a copy-forward candidate.
    const elsewhere = otherCamperByName.get(key) ?? [];
    if (elsewhere.length > 1) {
      entries.push({ ...base, match: null, status: "multiple-matches", multipleMatches: elsewhere.map((c) => ({ id: c.id, currentCabinName: c.cabin?.name ?? null, inTargetSession: false, sessionName: c.session?.name })) });
      return;
    }
    if (elsewhere.length === 1) {
      if (!desiredCabin) {
        entries.push({ ...base, match: null, status: "no-cabin", notes: `Found in ${elsewhere[0].session?.name ?? "another session"}, but cabin "${p.cabinName}" doesn't exist yet.` });
        return;
      }
      entries.push({ ...base, match: null, status: "will-create-from-prior", createFromPriorId: elsewhere[0].id, notes: `Found in ${elsewhere[0].session?.name ?? "another session"} — will create here with their existing profile.` });
      return;
    }

    // Genuinely no exact match anywhere -- try fuzzy suggestions.
    const scored: FuzzyMatch[] = [];
    for (const c of sessionCampers) {
      const { score, reason } = fuzzyScore(p.firstName, p.lastName, c.firstName, c.lastName);
      if (score >= 50) scored.push({ id: c.id, name: `${c.firstName} ${c.lastName}`, currentCabinName: c.cabin?.name ?? null, score, reason, inTargetSession: true });
    }
    for (const c of otherCampers) {
      const { score, reason } = fuzzyScore(p.firstName, p.lastName, c.firstName, c.lastName);
      if (score >= 50) scored.push({ id: c.id, name: `${c.firstName} ${c.lastName}`, currentCabinName: c.cabin?.name ?? null, score, reason, inTargetSession: false, sessionName: c.session?.name });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);
    if (top.length > 0) {
      entries.push({ ...base, match: null, status: "no-person", fuzzySuggestions: top });
      return;
    }
    if (!desiredCabin) {
      entries.push({ ...base, match: null, status: "no-cabin", notes: `Cabin "${p.cabinName}" doesn't exist yet, and this is a brand-new camper — create the cabin first.` });
      return;
    }
    entries.push({ ...base, match: null, status: "will-create-new", notes: "No matching camper found anywhere — will create a brand-new record. Swim level defaults to \"pending test\" since this sheet doesn't carry it." });
  });

  const totals = {
    in_file: entries.length,
    matched: entries.filter((e) => e.match !== null).length,
    will_change: entries.filter((e) => e.status === "match-cabin-change").length,
    unmatched: entries.filter((e) => e.status === "no-person").length,
    ambiguous: entries.filter((e) => e.status === "multiple-matches").length,
    cabin_missing: entries.filter((e) => e.status === "no-cabin").length,
    will_create_new: entries.filter((e) => e.status === "will-create-new").length,
    will_create_from_prior: entries.filter((e) => e.status === "will-create-from-prior").length
  };

  return {
    ok: true,
    campers: parsed.campers,
    diff: {
      generatedAt: new Date().toISOString(),
      sessionName: session.name,
      sessionCycle: session.cycle,
      sessionYear: session.year,
      gender,
      sessionId: session.id,
      sheetsParsed: parsed.sheetsParsed,
      skippedStaffCa: parsed.skipped.map((s) => ({ name: `${s.firstName} ${s.lastName}`, tag: s.tag, cabinName: s.cabinName })),
      missingCabins: Array.from(missingCabins).sort(),
      totals,
      entries
    }
  };
}

export async function applyImportDiff(
  campers: ParsedCamper[],
  gender: Gender,
  sessionId: string,
  overrides: Record<number, string>
): Promise<{ ok: true; applied: number; created: number; overrideApplied: number } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  // Re-verify the target session is still the active one rather than
  // trusting whatever the browser held onto since the preview was
  // generated -- the active session can change between preview and apply.
  const session = await prisma.session.findFirst({ where: { id: sessionId, active: true }, select: { id: true } });
  if (!session) return { ok: false, error: "That session is no longer active — regenerate the preview and try again." };

  const [cabins, sessionCampers, otherCampers] = await Promise.all([
    prisma.cabin.findMany({ where: { gender }, select: { id: true, name: true, unit: true } }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, cabinId: true, unit: true }
    }),
    prisma.camper.findMany({
      where: { sessionId: { not: session.id } },
      select: {
        id: true, firstName: true, lastName: true, gender: true, genderIdentity: true, age: true, campGrade: true,
        swimLevel: true, medicalFlags: true, counselorAssistant: true, externalId: true, unit: true,
        allergies: { select: { allergyLabelId: true, notes: true } },
        weekEnrollments: { select: { weekBlock: true, cabinId: true, cabinName: true } }
      }
    })
  ]);
  const cabinByName = new Map(cabins.map((c) => [c.name.toUpperCase(), c]));
  const sessionCamperByName = new Map<string, typeof sessionCampers>();
  for (const c of sessionCampers) {
    const key = `${norm(c.firstName)} ${norm(c.lastName)}`;
    if (!sessionCamperByName.has(key)) sessionCamperByName.set(key, []);
    sessionCamperByName.get(key)!.push(c);
  }
  const otherById = new Map(otherCampers.map((c) => [c.id, c]));

  let applied = 0;
  let created = 0;
  let overrideApplied = 0;

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < campers.length; i++) {
        const p = campers[i];
        const desiredCabin = cabinByName.get(p.cabinName.toUpperCase());
        const key = `${norm(p.firstName)} ${norm(p.lastName)}`;
        const overrideId = overrides[i];

        if (overrideId) {
          const inSession = sessionCamperByName.get(key)?.find((c) => c.id === overrideId);
          if (inSession && desiredCabin) {
            await tx.camper.update({ where: { id: inSession.id }, data: { cabinId: desiredCabin.id, unit: desiredCabin.unit } });
            overrideApplied++;
            continue;
          }
          const prior = otherById.get(overrideId);
          if (prior && desiredCabin) {
            const c = await tx.camper.create({
              data: {
                firstName: p.firstName, lastName: p.lastName, gender: prior.gender, genderIdentity: prior.genderIdentity,
                age: prior.age, campGrade: p.grade ?? prior.campGrade, unit: desiredCabin.unit, cabinId: desiredCabin.id,
                swimLevel: prior.swimLevel, medicalFlags: prior.medicalFlags, counselorAssistant: prior.counselorAssistant,
                active: true, sessionId: session.id, externalId: prior.externalId
              }
            });
            if (prior.allergies.length) await tx.camperAllergy.createMany({ data: prior.allergies.map((a) => ({ camperId: c.id, allergyLabelId: a.allergyLabelId, notes: a.notes })) });
            if (prior.weekEnrollments.length) await tx.camperWeekEnrollment.createMany({ data: prior.weekEnrollments.map((w) => ({ camperId: c.id, sessionId: session.id, weekBlock: w.weekBlock, cabinId: w.cabinId, cabinName: w.cabinName })) });
            overrideApplied++;
            created++;
          }
          continue;
        }

        if (!desiredCabin) continue; // no-cabin rows always need a manual fix, never auto-applied

        const inSession = sessionCamperByName.get(key) ?? [];
        if (inSession.length === 1) {
          const c = inSession[0];
          if (c.cabinId !== desiredCabin.id) {
            await tx.camper.update({ where: { id: c.id }, data: { cabinId: desiredCabin.id, unit: desiredCabin.unit } });
            applied++;
          }
          continue;
        }
        if (inSession.length > 1) continue; // ambiguous, needs a manual pick

        const elsewhere = otherCampers.filter((c) => norm(c.firstName) === norm(p.firstName) && norm(c.lastName) === norm(p.lastName));
        if (elsewhere.length === 1) {
          const prior = elsewhere[0];
          const c = await tx.camper.create({
            data: {
              firstName: p.firstName, lastName: p.lastName, gender: prior.gender, genderIdentity: prior.genderIdentity,
              age: prior.age, campGrade: p.grade ?? prior.campGrade, unit: desiredCabin.unit, cabinId: desiredCabin.id,
              swimLevel: prior.swimLevel, medicalFlags: prior.medicalFlags, counselorAssistant: prior.counselorAssistant,
              active: true, sessionId: session.id, externalId: prior.externalId
            }
          });
          if (prior.allergies.length) await tx.camperAllergy.createMany({ data: prior.allergies.map((a) => ({ camperId: c.id, allergyLabelId: a.allergyLabelId, notes: a.notes })) });
          if (prior.weekEnrollments.length) await tx.camperWeekEnrollment.createMany({ data: prior.weekEnrollments.map((w) => ({ camperId: c.id, sessionId: session.id, weekBlock: w.weekBlock, cabinId: w.cabinId, cabinName: w.cabinName })) });
          created++;
          continue;
        }
        if (elsewhere.length > 1) continue; // ambiguous, needs a manual pick

        // Genuinely new, no fuzzy override given -- only auto-create when
        // there was no fuzzy suggestion at all (mirrors generateImportDiff:
        // a "no-person" row with suggestions needs a human's yes/no, it's
        // never auto-created).
        const hasFuzzy = otherCampers.some((c) => fuzzyScore(p.firstName, p.lastName, c.firstName, c.lastName).score >= 50)
          || sessionCampers.some((c) => fuzzyScore(p.firstName, p.lastName, c.firstName, c.lastName).score >= 50);
        if (hasFuzzy) continue;

        await tx.camper.create({
          data: {
            firstName: p.firstName, lastName: p.lastName, gender, campGrade: p.grade ?? null,
            unit: desiredCabin.unit, cabinId: desiredCabin.id, swimLevel: SwimLevel.PENDING_SWIM_TEST,
            active: true, sessionId: session.id
          }
        });
        created++;
      }
    },
    { timeout: 120_000, maxWait: 15_000 }
  );

  revalidateImportConsumers();
  return { ok: true, applied, created, overrideApplied };
}
