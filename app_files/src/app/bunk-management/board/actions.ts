"use server";

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

/**
 * One-time (but safe to re-run) seed of StaffUnitPreference from ACTUAL
 * historical cabin assignments, rather than the paper-survey transcription
 * the schema comment describes -- that transcription tool was never built,
 * so the table has been empty. Where someone actually worked is at least as
 * good a signal as a stated preference, and for most staff it's the only
 * signal that exists at all.
 *
 * Looks at every session OTHER than the one currently being built out
 * (excludeSessionId -- so seeding Q3's board never uses Q3's own in-progress
 * placements as history), ranked by session recency. For each staff member,
 * the most recent session's unit becomes rank 1; if an earlier session had
 * them in a DIFFERENT unit, that becomes rank 2 (same unit in both sessions
 * just reinforces rank 1, it doesn't add a second entry). Capped at the two
 * most recent distinct units -- a third or older unit is unlikely to still
 * be a meaningful preference and would just clutter the board.
 *
 * Upserts on the existing [staffId, unit] unique constraint, so this can be
 * re-run after Q1/Q2 data changes without creating duplicates -- it always
 * overwrites rank with the freshly-computed one rather than leaving stale
 * numbers behind.
 */
export async function seedUnitPreferencesFromHistory(excludeSessionId: string): Promise<
  { ok: true; staffUpdated: number } | { ok: false; error: string }
> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  if (!excludeSessionId) return { ok: false, error: "Missing sessionId." };

  const [sessions, historicalAssignments] = await Promise.all([
    prisma.session.findMany({ where: { id: { not: excludeSessionId } }, select: { id: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.cabinStaffAssignment.findMany({
      where: { sessionId: { not: excludeSessionId } },
      select: { staffId: true, sessionId: true, cabin: { select: { unit: true } } }
    })
  ]);
  if (sessions.length === 0 || historicalAssignments.length === 0) {
    return { ok: false, error: "No prior-session cabin assignment history found to seed from." };
  }

  const sessionRecency = new Map(sessions.map((s, index) => [s.id, index])); // 0 = most recent

  const byStaff = new Map<string, { sessionId: string; unit: Unit }[]>();
  for (const a of historicalAssignments) {
    if (!byStaff.has(a.staffId)) byStaff.set(a.staffId, []);
    byStaff.get(a.staffId)!.push({ sessionId: a.sessionId, unit: a.cabin.unit });
  }

  let staffUpdated = 0;
  await prisma.$transaction(async (tx) => {
    for (const [staffId, records] of byStaff.entries()) {
      const sorted = [...records].sort((a, b) => (sessionRecency.get(a.sessionId) ?? 999) - (sessionRecency.get(b.sessionId) ?? 999));
      const distinctUnitsMostRecentFirst: Unit[] = [];
      for (const r of sorted) {
        if (!distinctUnitsMostRecentFirst.includes(r.unit)) distinctUnitsMostRecentFirst.push(r.unit);
      }
      for (let i = 0; i < Math.min(2, distinctUnitsMostRecentFirst.length); i++) {
        const unit = distinctUnitsMostRecentFirst[i];
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
  return { ok: true, staffUpdated };
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
