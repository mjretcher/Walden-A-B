"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const staffHousingPaths = [
  "/bunk-management/staff-housing",
  "/admin/staff",
  "/admin/staff/cabins",
  "/scream-session",
  "/rosters",
  "/search",
  "/reports/registration-assignments"
];

function revalidateStaffHousing() {
  for (const path of staffHousingPaths) revalidatePath(path);
}

function parseBedCount(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Computes the housingLabel display string kept in sync for every other
 * screen (search, scream session board, reports, imports) that only reads
 * Staff.housingLabel. */
function housingLabelFor(locationName: string, roomName: string | null) {
  return roomName ? `${locationName} — ${roomName}` : locationName;
}

export async function createHousingLocation(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Name is required." };

  const existing = await prisma.housingLocation.findUnique({ where: { name } });
  if (existing) return { ok: false as const, error: "A location with that name already exists." };

  const count = await prisma.housingLocation.count();
  await prisma.housingLocation.create({ data: { name, sortOrder: count } });

  revalidateStaffHousing();
  return { ok: true as const };
}

export async function renameHousingLocation(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { ok: false as const, error: "Name is required." };

  const location = await prisma.housingLocation.findUnique({ where: { id } });
  if (!location) return { ok: false as const, error: "Location not found." };
  if (location.name === name) return { ok: true as const };

  const clash = await prisma.housingLocation.findUnique({ where: { name } });
  if (clash) return { ok: false as const, error: "A location with that name already exists." };

  await prisma.$transaction(async (tx) => {
    await tx.housingLocation.update({ where: { id }, data: { name } });
    // Re-sync housingLabel for every staff attached directly to this
    // location or to one of its rooms, since the label embeds the name.
    const directStaff = await tx.staff.findMany({ where: { housingLocationId: id, housingRoomId: null }, select: { id: true } });
    if (directStaff.length) {
      await tx.staff.updateMany({ where: { id: { in: directStaff.map((s) => s.id) } }, data: { housingLabel: name } });
    }
    const rooms = await tx.housingRoom.findMany({ where: { locationId: id }, select: { id: true, name: true } });
    for (const room of rooms) {
      await tx.staff.updateMany({ where: { housingRoomId: room.id }, data: { housingLabel: housingLabelFor(name, room.name) } });
    }
  });

  revalidateStaffHousing();
  return { ok: true as const };
}

export async function deleteHousingLocation(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Missing location." };

  const location = await prisma.housingLocation.findUnique({
    where: { id },
    include: { rooms: true, staff: { select: { id: true } } }
  });
  if (!location) return { ok: false as const, error: "Location not found." };
  if (location.rooms.length > 0) return { ok: false as const, error: "Remove all rooms from this location first." };
  if (location.staff.length > 0) return { ok: false as const, error: "Move staff out of this location first." };

  await prisma.housingLocation.delete({ where: { id } });
  logAudit({ action: "housing_location.delete", actorId: actor.id, targetType: "housing_location", targetId: id, metadata: { name: location.name } });

  revalidateStaffHousing();
  return { ok: true as const };
}

export async function createHousingRoom(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const locationId = String(formData.get("locationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const bedCount = parseBedCount(formData.get("bedCount"));
  if (!locationId || !name) return { ok: false as const, error: "Room name is required." };

  const location = await prisma.housingLocation.findUnique({ where: { id: locationId } });
  if (!location) return { ok: false as const, error: "Location not found." };

  const clash = await prisma.housingRoom.findUnique({ where: { locationId_name: { locationId, name } } });
  if (clash) return { ok: false as const, error: "A room with that name already exists in this location." };

  const count = await prisma.housingRoom.count({ where: { locationId } });
  await prisma.housingRoom.create({ data: { locationId, name, bedCount, sortOrder: count } });

  revalidateStaffHousing();
  return { ok: true as const };
}

export async function renameHousingRoom(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const bedCount = parseBedCount(formData.get("bedCount"));
  if (!id || !name) return { ok: false as const, error: "Room name is required." };

  const room = await prisma.housingRoom.findUnique({ where: { id }, include: { location: true } });
  if (!room) return { ok: false as const, error: "Room not found." };

  if (room.name !== name) {
    const clash = await prisma.housingRoom.findUnique({ where: { locationId_name: { locationId: room.locationId, name } } });
    if (clash) return { ok: false as const, error: "A room with that name already exists in this location." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.housingRoom.update({ where: { id }, data: { name, bedCount } });
    if (room.name !== name) {
      await tx.staff.updateMany({ where: { housingRoomId: id }, data: { housingLabel: housingLabelFor(room.location.name, name) } });
    }
  });

  revalidateStaffHousing();
  return { ok: true as const };
}

export async function deleteHousingRoom(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Missing room." };

  const room = await prisma.housingRoom.findUnique({ where: { id }, include: { staff: { select: { id: true } } } });
  if (!room) return { ok: false as const, error: "Room not found." };
  if (room.staff.length > 0) return { ok: false as const, error: "Move staff out of this room first." };

  await prisma.housingRoom.delete({ where: { id } });
  logAudit({ action: "housing_room.delete", actorId: actor.id, targetType: "housing_room", targetId: id, metadata: { name: room.name, locationId: room.locationId } });

  revalidateStaffHousing();
  return { ok: true as const };
}

/**
 * Assigns a staff member to "" (unassign), a flat location ("location:ID"),
 * or a specific room ("room:ID") -- one instant-save dropdown, matching the
 * existing single-select feel of this page. Bed capacity is soft-enforced:
 * an over-capacity save still succeeds but returns a warning string for the
 * UI to surface, rather than blocking the change.
 */
export async function assignStaffHousing(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  const target = String(formData.get("target") ?? "").trim();
  if (!staffId) return { ok: false as const, error: "Missing staff member." };

  if (!target) {
    await prisma.staff.update({ where: { id: staffId }, data: { housingLocationId: null, housingRoomId: null, housingLabel: null } });
    revalidateStaffHousing();
    return { ok: true as const, warning: null };
  }

  const [kind, id] = target.split(":");

  if (kind === "location") {
    const location = await prisma.housingLocation.findUnique({ where: { id } });
    if (!location) return { ok: false as const, error: "Location not found." };
    await prisma.staff.update({
      where: { id: staffId },
      data: { housingLocationId: location.id, housingRoomId: null, housingLabel: housingLabelFor(location.name, null) }
    });
    revalidateStaffHousing();
    return { ok: true as const, warning: null };
  }

  if (kind === "room") {
    const room = await prisma.housingRoom.findUnique({ where: { id }, include: { location: true, staff: { select: { id: true } } } });
    if (!room) return { ok: false as const, error: "Room not found." };

    await prisma.staff.update({
      where: { id: staffId },
      data: { housingLocationId: room.locationId, housingRoomId: room.id, housingLabel: housingLabelFor(room.location.name, room.name) }
    });

    revalidateStaffHousing();

    const alreadyThere = room.staff.some((s) => s.id === staffId);
    const nextCount = alreadyThere ? room.staff.length : room.staff.length + 1;
    if (room.bedCount != null && nextCount > room.bedCount) {
      return { ok: true as const, warning: `${room.location.name} — ${room.name} is now over capacity (${nextCount}/${room.bedCount}).` };
    }
    return { ok: true as const, warning: null };
  }

  return { ok: false as const, error: "Invalid target." };
}

const DEFAULT_HOUSING_LABELS = ["Staff House", "Nurse Cabin", "Health Center", "Out of Cabin", "Office", "Leadership House"];

/** Idempotent: seeds the historical default location names if missing.
 * Safe to call on every page load (skipDuplicates on the unique name). */
export async function ensureDefaultHousingLocations() {
  await prisma.housingLocation.createMany({
    data: DEFAULT_HOUSING_LABELS.map((name, i) => ({ name, sortOrder: i })),
    skipDuplicates: true
  });
}

/** One-click migration for legacy free-text housingLabel values that predate
 * this feature: creates a flat HousingLocation per distinct legacy label
 * still in use, and links those staff to it. Never invents room structure --
 * the old data has no room information to migrate. */
export async function migrateLegacyHousingLabels() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const unmigrated = await prisma.staff.findMany({
    where: { active: true, housingLocationId: null, housingLabel: { not: null } },
    select: { id: true, housingLabel: true }
  });
  const labels = Array.from(new Set(unmigrated.map((s) => s.housingLabel).filter((l): l is string => Boolean(l))));
  if (!labels.length) return { ok: true as const, migrated: 0 };

  await prisma.$transaction(async (tx) => {
    const count = await tx.housingLocation.count();
    await tx.housingLocation.createMany({
      data: labels.map((name, i) => ({ name, sortOrder: count + i })),
      skipDuplicates: true
    });
    const locations = await tx.housingLocation.findMany({ where: { name: { in: labels } }, select: { id: true, name: true } });
    const byName = new Map(locations.map((l) => [l.name, l.id]));
    for (const staff of unmigrated) {
      const locationId = staff.housingLabel ? byName.get(staff.housingLabel) : undefined;
      if (locationId) {
        await tx.staff.update({ where: { id: staff.id }, data: { housingLocationId: locationId } });
      }
    }
  });

  revalidateStaffHousing();
  return { ok: true as const, migrated: unmigrated.length };
}
