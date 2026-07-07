"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const staffHousingPaths = ["/bunk-management/staff-housing", "/admin/staff", "/admin/staff/cabins"];

function revalidateStaffHousing() {
  for (const path of staffHousingPaths) revalidatePath(path);
}

/**
 * Sets or clears a staff member's non-cabin housing label (Nurse Cabin,
 * Staff House, etc.). Deliberately never touches Staff.cabinId -- real
 * cabin/bunk assignment for a quarter lives entirely in
 * CabinStaffAssignment now (see /bunk-management/board), and this screen
 * only covers the staff who aren't bunking with campers at all. Keeping
 * the two mechanisms fully separate is what prevents them from drifting
 * out of sync with each other.
 */
export async function setStaffHousing(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const staffId = String(formData.get("staffId") ?? "").trim();
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  if (!staffId) {
    return { ok: false as const, error: "staffId is required." };
  }

  await prisma.staff.update({
    where: { id: staffId },
    data: { housingLabel: housingLabel || null }
  });

  revalidateStaffHousing();
  return { ok: true as const };
}
