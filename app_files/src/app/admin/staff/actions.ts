"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function values(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => String(value)).filter(Boolean);
}

export async function updateStaffProfile(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return;

  const cabinId = String(formData.get("cabinId") ?? "");
  const primaryAreaId = String(formData.get("primaryAreaId") ?? "");
  const secondaryAreaIds = values(formData, "secondaryAreaId");
  const certificationIds = values(formData, "certificationId");
  const skillIds = values(formData, "skillId");

  await prisma.staff.update({
    where: { id: staffId },
    data: {
      cabinId: cabinId || null,
      primaryAreaId: primaryAreaId || null,
      secondaryAreas: { set: secondaryAreaIds.map((id) => ({ id })) },
      certifications: { set: certificationIds.map((id) => ({ id })) },
      skills: { set: skillIds.map((id) => ({ id })) }
    }
  });

  revalidatePath("/admin/staff");
}
