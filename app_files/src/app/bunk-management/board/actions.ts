"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
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
