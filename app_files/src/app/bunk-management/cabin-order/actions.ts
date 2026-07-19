"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Persist a hand-set print order for one unit: cabinIds arrives in the
 * exact top-to-bottom order the exec arranged, and each cabin gets its
 * index written to Cabin.sortOrder. Whole-unit writes only (never a
 * single row) so a unit is always either fully hand-ordered or fully
 * automatic — lib/cabin-print-order.ts treats "any sortOrder present"
 * as hand-ordered, and partial writes would silently demote the
 * untouched cabins to the end.
 *
 * Validated against the DB (all ids exist, all belong to ONE unit and
 * gender, and the list covers that unit completely) rather than trusting
 * the client — concurrent cabin renames/moves from another machine are
 * routine here, and a stale browser must fail loudly, not scramble paper.
 */
export async function saveUnitCabinOrder(cabinIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireBunkManagementAccess("read");
  if (user.role !== UserRole.EXECUTIVE_ADMIN) return { ok: false, error: "Exec Admin only." };

  if (!Array.isArray(cabinIds) || cabinIds.length === 0) return { ok: false, error: "No cabins given." };
  if (new Set(cabinIds).size !== cabinIds.length) return { ok: false, error: "Duplicate cabin in order list." };

  const cabins = await prisma.cabin.findMany({
    where: { id: { in: cabinIds } },
    select: { id: true, unit: true, gender: true }
  });
  if (cabins.length !== cabinIds.length) return { ok: false, error: "A cabin in the list no longer exists — reload the page." };

  const units = new Set(cabins.map((c) => `${c.gender}:${c.unit}`));
  if (units.size !== 1) return { ok: false, error: "Cabins span more than one unit — reload the page." };

  const [gender, unit] = [...units][0].split(":");
  const unitCount = await prisma.cabin.count({ where: { gender: gender as never, unit: unit as never } });
  if (unitCount !== cabinIds.length) {
    return { ok: false, error: "The unit's cabins changed since this page loaded — reload and re-order." };
  }

  await prisma.$transaction(
    cabinIds.map((id, index) => prisma.cabin.update({ where: { id }, data: { sortOrder: index } }))
  );

  revalidatePath("/bunk-management/cabin-order");
  revalidatePath("/bunk-management/print");
  revalidatePath("/bunk-management/print-staff");
  return { ok: true };
}

/**
 * Clear a unit's hand-set order (all sortOrder -> null), returning it to
 * the automatic order (coded overrides + natural name sort).
 */
export async function clearUnitCabinOrder(cabinIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireBunkManagementAccess("read");
  if (user.role !== UserRole.EXECUTIVE_ADMIN) return { ok: false, error: "Exec Admin only." };
  if (!Array.isArray(cabinIds) || cabinIds.length === 0) return { ok: false, error: "No cabins given." };

  await prisma.cabin.updateMany({ where: { id: { in: cabinIds } }, data: { sortOrder: null } });

  revalidatePath("/bunk-management/cabin-order");
  revalidatePath("/bunk-management/print");
  revalidatePath("/bunk-management/print-staff");
  return { ok: true };
}
