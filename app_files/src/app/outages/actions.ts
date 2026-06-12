"use server";

import { OutageReason, OutageSubjectType, Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeStringArray } from "@/lib/local-arrays";
import { prisma } from "@/lib/prisma";

const paths = ["/outages", "/attendance", "/scream-session", "/area-dashboard", "/reports/area-block-plan"];

function refreshOutageConsumers() {
  for (const path of paths) revalidatePath(path);
}

export async function createOutage(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) throw new Error("Active session required.");

  const subjectType = String(formData.get("subjectType")) as OutageSubjectType;
  const reason = String(formData.get("reason")) as OutageReason;
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!startDate || !endDate) throw new Error("Start and end dates are required.");

  await prisma.outage.create({
    data: {
      sessionId: session.id,
      subjectType,
      reason,
      camperId: subjectType === OutageSubjectType.CAMPER ? String(formData.get("camperId") ?? "") || null : null,
      staffId: subjectType === OutageSubjectType.STAFF ? String(formData.get("staffId") ?? "") || null : null,
      cabinId: subjectType === OutageSubjectType.CABIN ? String(formData.get("cabinId") ?? "") || null : null,
      manualTitle: subjectType === OutageSubjectType.MANUAL_TRIP ? String(formData.get("manualTitle") ?? "").trim() || null : null,
      startDate: new Date(`${startDate}T12:00:00`),
      endDate: new Date(`${endDate}T12:00:00`),
      fullDay: formData.get("fullDay") === "on",
      periods: writeStringArray(formData.getAll("periods") as Period[]),
      notes: String(formData.get("notes") ?? "").trim() || null,
      createdByUserId: user.id
    }
  });

  refreshOutageConsumers();
}

export async function resolveOutage(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  await prisma.outage.update({
    where: { id: String(formData.get("id") ?? "") },
    data: { status: "RESOLVED", resolvedAt: new Date() }
  });
  refreshOutageConsumers();
}
