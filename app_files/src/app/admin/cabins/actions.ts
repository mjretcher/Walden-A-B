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
  "/outages"
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
 * Update a single cabin's name, unit, and/or gender.
 *
 * Cascades:
 *  - If name changes → CamperWeekEnrollment.cabinName snapshots that reference
 *    this cabin are updated to match.
 *  - If unit changes → every camper currently assigned to this cabin via
 *    cabinId gets their unit field set to match (Option A: cabin's unit
 *    is the source of truth for their primary unit).
 *  - Gender change does NOT cascade to Camper.gender — campers keep their
 *    own gender field regardless of which cabin they're in this session.
 */
export async function updateCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const cabinId = String(formData.get("cabinId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const unitRaw = String(formData.get("unit") ?? "").trim();
  const genderRaw = String(formData.get("gender") ?? "").trim();

  if (!cabinId || !name) {
    return { ok: false as const, error: "Cabin id and name are required." };
  }
  if (!isUnit(unitRaw)) {
    return { ok: false as const, error: "Invalid unit." };
  }
  if (!isGender(genderRaw)) {
    return { ok: false as const, error: "Invalid gender." };
  }

  const current = await prisma.cabin.findUnique({
    where: { id: cabinId },
    select: { id: true, name: true, unit: true, gender: true }
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
      data: { name, unit: unitRaw, gender: genderRaw }
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

  if (!name) {
    return { ok: false as const, error: "Cabin name is required." };
  }
  if (!isUnit(unitRaw)) {
    return { ok: false as const, error: "Invalid unit." };
  }
  if (!isGender(genderRaw)) {
    return { ok: false as const, error: "Invalid gender." };
  }

  const existing = await prisma.cabin.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    return { ok: false as const, error: `A cabin named "${name}" already exists.` };
  }

  await prisma.cabin.create({
    data: { name, unit: unitRaw, gender: genderRaw }
  });

  revalidateCabinConsumers();
  return { ok: true as const };
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
