"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { Unit, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const boardConsumerPaths = [
  "/bunk-management",
  "/bunk-management/board",
  "/bunk-management/cabins",
  "/bunk-management/print",
  "/dashboard",
  "/scream-session"
];

function revalidateBoard() {
  for (const path of boardConsumerPaths) revalidatePath(path);
}

/**
 * Assign a staff member to a cabin for the given session. This is always
 * an upsert on [staffId, sessionId] -- a staff member can only ever hold
 * one cabin per session (see CabinStaffAssignment.@@unique in the schema),
 * so dragging someone already assigned this session onto a different
 * cabin MOVES them rather than creating a second row. That's also what
 * makes "never double-booked" hold: there is structurally only one row
 * per (staff, session) ever.
 *
 * No role is written here -- "Unit Head" / "Unit Programmer" is always
 * derived live from Staff.position/position2 at render time (see
 * lib/bunk-staff-tags.ts), never stored on the assignment.
 *
 * Never touches Camper -- CAs are assigned to a cabin via Camper.cabinId
 * on the existing camper-management flows, not here. This action is
 * Staff-only, on purpose (see lib/ca-staff-exclusion.ts for why CAs must
 * never get a Staff-side assignment).
 */
export async function assignStaffToCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const staffId = String(formData.get("staffId") ?? "").trim();
  const cabinId = String(formData.get("cabinId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();

  if (!staffId || !cabinId || !sessionId) {
    return { ok: false as const, error: "staffId, cabinId, and sessionId are all required." };
  }

  const [staff, cabin] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } }),
    prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true } })
  ]);
  if (!staff) return { ok: false as const, error: "Staff member not found." };
  if (!cabin) return { ok: false as const, error: "Cabin not found." };

  await prisma.cabinStaffAssignment.upsert({
    where: { staffId_sessionId: { staffId, sessionId } },
    create: { staffId, cabinId, sessionId },
    update: { cabinId }
  });

  revalidateBoard();
  return { ok: true as const };
}

/** Remove a staff member's cabin assignment for a session — returns them to the unassigned pool. */
export async function unassignStaff(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const staffId = String(formData.get("staffId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!staffId || !sessionId) {
    return { ok: false as const, error: "staffId and sessionId are required." };
  }

  await prisma.cabinStaffAssignment.deleteMany({ where: { staffId, sessionId } });

  revalidateBoard();
  return { ok: true as const };
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

type ImportFileStaffRow = { role?: string; firstName: string; lastName: string; cabin?: string };

function loadStaffCabinsFromImportFile(filename: string): { firstName: string; lastName: string; cabin: string }[] {
  const filePath = path.join(process.cwd(), "data", filename);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  const rows = JSON.parse(raw) as ImportFileStaffRow[];
  return rows
    .filter((r) => r.role === "staff" && r.cabin && r.cabin.trim() !== "")
    .map((r) => ({ firstName: r.firstName, lastName: r.lastName, cabin: r.cabin!.trim() }));
}

/**
 * Seeds StaffUnitPreference from the ACTUAL Q1/Q2 cabin assignments -- not
 * from CabinStaffAssignment (which turned out to have essentially nothing
 * real in it; staff cabin placement for Q1/Q2 was never done through the
 * Assignment Board), but from the original data/q1-assignments.json and
 * data/q2-assignments.json files -- the same source files the Q1/Q2 cabin
 * sync import tools read from, which already contain every staff member's
 * actual cabin for those quarters. Matches by normalized first+last name
 * against the live Staff table (Staff isn't session-scoped, so the same
 * record persists across quarters), then looks up each cabin's unit from
 * the live Cabin table.
 *
 * Q2's cabin becomes rank 1 (more recent), Q1's becomes rank 2 only if it
 * was a DIFFERENT unit (same unit in both just reinforces rank 1). Staff
 * who only appear in one file get a single rank-1 entry from whichever one
 * that is. Staff not found in either file (new hires, or a name that
 * doesn't match) simply get no preference -- nothing is guessed for them.
 *
 * Upserts on the existing [staffId, unit] unique constraint, so safe to
 * re-run.
 */
export async function seedUnitPreferencesFromHistory(): Promise<
  { ok: true; staffUpdated: number; unmatchedNames: string[] } | { ok: false; error: string }
> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const q1Rows = loadStaffCabinsFromImportFile("q1-assignments.json");
  const q2Rows = loadStaffCabinsFromImportFile("q2-assignments.json");
  if (q1Rows.length === 0 && q2Rows.length === 0) {
    return { ok: false, error: "No staff rows with a cabin found in data/q1-assignments.json or data/q2-assignments.json." };
  }

  const [liveStaff, liveCabins] = await Promise.all([
    prisma.staff.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.cabin.findMany({ select: { name: true, unit: true } })
  ]);

  const staffByName = new Map<string, string>(); // normalized name -> staffId
  for (const s of liveStaff) staffByName.set(`${norm(s.firstName)} ${norm(s.lastName)}`, s.id);
  const cabinUnitByName = new Map<string, Unit>(); // uppercased cabin name -> unit
  for (const c of liveCabins) cabinUnitByName.set(c.name.toUpperCase(), c.unit);

  // rank 2 = Q1 (older), rank 1 = Q2 (more recent) -- built in that order so a
  // staff member's later entry naturally overwrites/reinforces rank 1 below.
  const byStaff = new Map<string, Unit[]>(); // staffId -> units in [Q1-if-present, Q2-if-present] push order
  const unmatchedNames = new Set<string>();

  function ingest(rows: { firstName: string; lastName: string; cabin: string }[]) {
    for (const r of rows) {
      const staffId = staffByName.get(`${norm(r.firstName)} ${norm(r.lastName)}`);
      const unit = cabinUnitByName.get(r.cabin.toUpperCase());
      if (!staffId) {
        unmatchedNames.add(`${r.firstName} ${r.lastName}`);
        continue;
      }
      if (!unit) continue; // cabin from the old file no longer exists -- skip rather than guess
      if (!byStaff.has(staffId)) byStaff.set(staffId, []);
      // Each call to ingest() represents one "round" (Q1 first, Q2 second) --
      // within a round a person appears once, so just push; recency across
      // rounds is handled by calling ingest(q1) before ingest(q2) and later
      // reversing + de-duplicating with "first-seen-after-reverse wins."
      byStaff.get(staffId)!.push(unit);
    }
  }
  ingest(q1Rows);
  ingest(q2Rows);

  let staffUpdated = 0;
  await prisma.$transaction(async (tx) => {
    for (const [staffId, units] of byStaff.entries()) {
      // units is in [Q1-if-present, Q2-if-present] order (chronological);
      // reverse so the MOST recent (Q2) is considered first, then de-dupe to
      // distinct units keeping first-seen (=most recent) position.
      const mostRecentFirst = [...units].reverse();
      const distinct: Unit[] = [];
      for (const u of mostRecentFirst) if (!distinct.includes(u)) distinct.push(u);

      for (let i = 0; i < Math.min(2, distinct.length); i++) {
        const unit = distinct[i];
        await tx.staffUnitPreference.upsert({
          where: { staffId_unit: { staffId, unit } },
          create: { staffId, unit, rank: i + 1 },
          update: { rank: i + 1 }
        });
      }
      staffUpdated += 1;
    }
  }, { timeout: 120_000, maxWait: 15_000 });

  revalidateBoard();
  return { ok: true, staffUpdated, unmatchedNames: Array.from(unmatchedNames).sort() };
}

/**
 * Applies a whole batch of staff→cabin placements in one transaction --
 * backs the "Auto-fill remaining" preview/apply flow, where the client
 * computes a proposed assignment client-side (it already has every staff
 * member's preferences and every cabin's current headcount in memory) and
 * this just commits whatever Mike confirmed after reviewing it. Same
 * upsert-on-[staffId,sessionId] semantics as assignStaffToCabin, just batched
 * instead of one request per person.
 */
export async function bulkAssignStaff(
  sessionId: string,
  placements: { staffId: string; cabinId: string }[]
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  if (!sessionId) return { ok: false, error: "Missing sessionId." };
  if (placements.length === 0) return { ok: true, applied: 0 };

  await prisma.$transaction(
    placements.map((p) =>
      prisma.cabinStaffAssignment.upsert({
        where: { staffId_sessionId: { staffId: p.staffId, sessionId } },
        create: { staffId: p.staffId, cabinId: p.cabinId, sessionId },
        update: { cabinId: p.cabinId }
      })
    ),
    { timeout: 120_000, maxWait: 15_000 }
  );

  revalidateBoard();
  return { ok: true, applied: placements.length };
}
