"use server";

import { revalidatePath } from "next/cache";
import { Gender, Unit, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const cabinConsumerPaths = [
  "/dashboard",
  "/registration",
  "/scream-session",
  "/rosters",
  "/cards",
  "/admin/campers",
  "/admin/staff",
  "/admin/staff/cabins",
  "/admin/cabins",
  "/switches",
  "/area-dashboard",
  "/outages",
  "/bunk-management",
  "/bunk-management/board",
  "/bunk-management/cabins",
  "/bunk-management/print",
  "/bunk-management/staff-housing"
];

function revalidateCabinConsumers() {
  for (const path of cabinConsumerPaths) revalidatePath(path);
}

function isUnit(value: string): value is Unit {
  return Object.values(Unit).includes(value as Unit);
}

function isGender(value: string): value is Gender {
  return Object.values(Gender).includes(value as Gender);
}

/**
 * Update a single cabin's name, unit, gender, and/or bed count.
 *
 * Cascades:
 *  - If name changes → CamperWeekEnrollment.cabinName snapshots that reference
 *    this cabin are updated to match.
 *  - If unit changes → every camper currently assigned to this cabin via
 *    cabinId gets their unit field set to match (Option A: cabin's unit
 *    is the source of truth for their primary unit).
 *  - Gender change does NOT cascade to Camper.gender — campers keep their
 *    own gender field regardless of which cabin they're in this session.
 *  - Bed count is a plain field update — it never cascades anywhere. It's
 *    read by Bunk Management to compute the significant over-capacity
 *    warning (assigned headcount vs. beds); a warning, never a hard block.
 */
export async function updateCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const cabinId = String(formData.get("cabinId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const unitRaw = String(formData.get("unit") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const bedsRaw = formData.get("beds");
  const beds = bedsRaw === null || bedsRaw === "" ? undefined : Number(bedsRaw);

  if (!cabinId || !name) {
    return { ok: false as const, error: "Cabin id and name are required." };
  }
  if (!isUnit(unitRaw)) {
    return { ok: false as const, error: "Invalid unit." };
  }
  if (!isGender(genderRaw)) {
    return { ok: false as const, error: "Invalid gender." };
  }
  if (beds !== undefined && (!Number.isFinite(beds) || beds < 0 || !Number.isInteger(beds))) {
    return { ok: false as const, error: "Beds must be a whole number, 0 or greater." };
  }

  const current = await prisma.cabin.findUnique({
    where: { id: cabinId },
    select: { id: true, name: true, unit: true, gender: true, beds: true }
  });
  if (!current) {
    return { ok: false as const, error: "Cabin not found." };
  }

  // Check for name collision before attempting the rename
  if (name !== current.name) {
    const collision = await prisma.cabin.findFirst({
      where: { name, NOT: { id: cabinId } },
      select: { id: true }
    });
    if (collision) {
      return { ok: false as const, error: `Another cabin already uses the name "${name}".` };
    }
  }

  const nameChanged = name !== current.name;
  const unitChanged = unitRaw !== current.unit;
  // gender change tracked but does not cascade
  // const genderChanged = genderRaw !== current.gender;

  // Apply everything in one transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update the cabin itself
    await tx.cabin.update({
      where: { id: cabinId },
      data: { name, unit: unitRaw, gender: genderRaw, ...(beds !== undefined ? { beds } : {}) }
    });

    // 2. If name changed → update week-enrollment snapshots that pointed at this cabin
    if (nameChanged) {
      await tx.camperWeekEnrollment.updateMany({
        where: { cabinId },
        data: { cabinName: name }
      });
    }

    // 3. If unit changed → update Camper.unit for every camper currently in this cabin
    if (unitChanged) {
      await tx.camper.updateMany({
        where: { cabinId },
        data: { unit: unitRaw }
      });
    }
  });

  revalidateCabinConsumers();
  return { ok: true as const };
}

/**
 * Create a new cabin (needed for cabins like G37 that exist in the file
 * but were never imported into the DB).
 */
export async function createCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const name = String(formData.get("name") ?? "").trim();
  const unitRaw = String(formData.get("unit") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const bedsRaw = formData.get("beds");
  const beds = bedsRaw === null || bedsRaw === "" ? 0 : Number(bedsRaw);

  if (!name) {
    return { ok: false as const, error: "Cabin name is required." };
  }
  if (!isUnit(unitRaw)) {
    return { ok: false as const, error: "Invalid unit." };
  }
  if (!isGender(genderRaw)) {
    return { ok: false as const, error: "Invalid gender." };
  }
  if (!Number.isFinite(beds) || beds < 0 || !Number.isInteger(beds)) {
    return { ok: false as const, error: "Beds must be a whole number, 0 or greater." };
  }

  const existing = await prisma.cabin.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    return { ok: false as const, error: `A cabin named "${name}" already exists.` };
  }

  await prisma.cabin.create({
    data: { name, unit: unitRaw, gender: genderRaw, beds }
  });

  revalidateCabinConsumers();
  return { ok: true as const };
}

/**
 * Delete a cabin outright. Blocked (not just discouraged) if anything LIVE
 * still points at it — current-session campers (named in the error so
 * they're findable), actively-housed staff, or a bunk assignment for the
 * currently-active session. Past-session campers do NOT block: they're
 * detached on delete with their week-enrollment history intact (see the
 * comment inside). There's still no force-delete for live data.
 */
export async function deleteCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const cabinId = String(formData.get("cabinId") ?? "").trim();
  if (!cabinId) {
    return { ok: false as const, error: "Cabin id is required." };
  }

  // Blockers are scoped to the CURRENTLY-ACTIVE session (and to real,
  // currently-housed staff). The old guard counted active campers across
  // ALL sessions, which produced an unsolvable dead-end: a cabin retired
  // after Q1/Q2 stayed permanently undeletable, blocked by campers from a
  // past session who are invisible in every current-session view — "it
  // still has 10 active campers" with no way to find them (this is exactly
  // what happened with G37b). Past-session campers are history, not live
  // occupants: on delete they're explicitly detached (week-enrollment rows
  // keep their denormalized cabinName snapshot, so past rosters still read
  // correctly).
  const [cabin, activeCampers] = await Promise.all([
    prisma.cabin.findUnique({
      where: { id: cabinId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            staff: { where: { active: true } },
            cabinStaffAssignments: { where: { session: { active: true } } }
          }
        }
      }
    }),
    prisma.camper.findMany({
      where: { cabinId, active: true },
      select: { firstName: true, lastName: true, session: { select: { name: true, active: true } } }
    })
  ]);
  if (!cabin) {
    return { ok: false as const, error: "Cabin not found." };
  }

  const currentCampers = activeCampers.filter((camper) => camper.session.active);
  const historicalCampers = activeCampers.filter((camper) => !camper.session.active);

  const blockers: string[] = [];
  if (currentCampers.length > 0) {
    // Name names — "10 active campers" you can't locate is a dead-end;
    // a list of who they are is an action item.
    const names = currentCampers.slice(0, 10).map((camper) => `${camper.firstName} ${camper.lastName}`).join(", ");
    const overflow = currentCampers.length > 10 ? ` +${currentCampers.length - 10} more` : "";
    blockers.push(`${currentCampers.length} camper${currentCampers.length === 1 ? "" : "s"} in the current session (${names}${overflow})`);
  }
  if (cabin._count.staff > 0) blockers.push(`${cabin._count.staff} active staff member${cabin._count.staff === 1 ? "" : "s"} housed here`);
  if (cabin._count.cabinStaffAssignments > 0) blockers.push(`${cabin._count.cabinStaffAssignments} current bunk assignment${cabin._count.cabinStaffAssignments === 1 ? "" : "s"}`);

  if (blockers.length > 0) {
    return {
      ok: false as const,
      error: `Can't delete ${cabin.name} — it still has ${blockers.join(" and ")}. Move them out first.`
    };
  }

  await prisma.$transaction([
    // Explicit detach of past-session campers (the FK's SetNull would do
    // this anyway; doing it by hand makes the intent auditable and never
    // depends on the FK definition staying that way).
    prisma.camper.updateMany({ where: { cabinId }, data: { cabinId: null } }),
    prisma.cabin.delete({ where: { id: cabinId } })
  ]);

  revalidateCabinConsumers();
  return {
    ok: true as const,
    notice:
      historicalCampers.length > 0
        ? `Deleted. ${historicalCampers.length} camper${historicalCampers.length === 1 ? "" : "s"} from past sessions (${Array.from(new Set(historicalCampers.map((camper) => camper.session.name))).join(", ")}) were unlinked — their week-by-week history keeps the cabin name.`
        : undefined
  };
}

/**
 * Preview which cabins would be renamed by stripping dashes, and detect
 * any collisions where a no-dash version already exists.
 */
export async function previewDashStrip() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const cabins = await prisma.cabin.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  const renames: { id: string; oldName: string; newName: string }[] = [];
  const allNames = new Set(cabins.map((c) => c.name));
  const collisions: { oldName: string; newName: string }[] = [];

  for (const cabin of cabins) {
    if (!cabin.name.includes("-")) continue;
    const newName = cabin.name.replace(/-/g, "");
    if (allNames.has(newName)) {
      collisions.push({ oldName: cabin.name, newName });
    } else {
      renames.push({ id: cabin.id, oldName: cabin.name, newName });
    }
  }

  return { renames, collisions };
}

/**
 * Strip dashes from all cabin names + update week-enrollment snapshots.
 * Refuses to run if any collision would occur.
 */
export async function applyDashStrip() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const { renames, collisions } = await previewDashStrip();

  if (collisions.length > 0) {
    return {
      ok: false as const,
      error: `Cannot strip dashes — these would collide with existing cabin names: ${collisions.map((c) => `${c.oldName}→${c.newName}`).join(", ")}`
    };
  }

  if (renames.length === 0) {
    return { ok: true as const, applied: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const r of renames) {
      // Update week-enrollment snapshots that reference this cabin
      await tx.camperWeekEnrollment.updateMany({
        where: { cabinId: r.id },
        data: { cabinName: r.newName }
      });
      // Then rename the cabin itself
      await tx.cabin.update({
        where: { id: r.id },
        data: { name: r.newName }
      });
    }
  });

  revalidateCabinConsumers();
  return { ok: true as const, applied: renames.length };
}
