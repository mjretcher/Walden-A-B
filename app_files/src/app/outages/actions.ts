"use server";

import { OutageReason, Period, UserRole } from "@prisma/client";
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

  const reason = String(formData.get("reason")) as OutageReason;
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!startDate || !endDate) throw new Error("Start and end dates are required.");

  const camperIds = Array.from(new Set(formData.getAll("camperIds").map((value) => String(value)).filter(Boolean)));
  const staffEntries = formData
    .getAll("staffEntries")
    .map((value) => {
      try {
        const parsed = JSON.parse(String(value)) as { id?: string; phone?: string };
        return parsed.id ? { id: parsed.id, phone: parsed.phone?.trim() || null } : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { id: string; phone: string | null } => Boolean(entry));
  const dedupedStaffEntries = Array.from(new Map(staffEntries.map((entry) => [entry.id, entry])).values());

  if (!camperIds.length && !dedupedStaffEntries.length) {
    throw new Error("Add at least one camper or staff member.");
  }

  await prisma.outage.create({
    data: {
      sessionId: session.id,
      reason,
      manualTitle: String(formData.get("manualTitle") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      startDate: new Date(`${startDate}T12:00:00`),
      endDate: new Date(`${endDate}T12:00:00`),
      fullDay: formData.get("fullDay") === "on",
      periods: writeStringArray(formData.getAll("periods") as Period[]),
      notes: String(formData.get("notes") ?? "").trim() || null,
      createdByUserId: user.id,
      campers: { create: camperIds.map((camperId) => ({ camperId })) },
      staffLinks: { create: dedupedStaffEntries.map((entry) => ({ staffId: entry.id, phone: entry.phone })) }
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

export async function reopenOutage(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  await prisma.outage.update({
    where: { id: String(formData.get("id") ?? "") },
    data: { status: "ACTIVE", resolvedAt: null }
  });
  refreshOutageConsumers();
}

export async function deleteOutage(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Camper/staff links cascade automatically (onDelete: Cascade on
  // OutageCamper/OutageStaff), so this is a single clean delete -- no
  // orphaned join rows left behind.
  await prisma.outage.delete({ where: { id } });
  refreshOutageConsumers();
}

// One-time cleanup for outages created before the July 2026 multi-camper/
// multi-staff redesign. Backfills the new OutageCamper/OutageStaff join
// tables from the legacy subjectType/camperId/staffId/cabinId columns so
// old records display and report identically to new ones. Safe to run
// more than once -- createMany with skipDuplicates makes every insert a
// no-op the second time around, and rows that already have links are
// skipped outright.
export async function migrateLegacyOutages() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const candidates = await prisma.outage.findMany({
    where: { subjectType: { not: null } },
    include: { campers: true, staffLinks: true }
  });

  let camperLinksAdded = 0;
  let staffLinksAdded = 0;
  let cabinsExpanded = 0;

  for (const outage of candidates) {
    if (outage.campers.length || outage.staffLinks.length) continue; // already migrated

    if (outage.camperId) {
      await prisma.outageCamper.createMany({ data: [{ outageId: outage.id, camperId: outage.camperId }], skipDuplicates: true });
      camperLinksAdded += 1;
    }

    if (outage.staffId) {
      await prisma.outageStaff.createMany({ data: [{ outageId: outage.id, staffId: outage.staffId, phone: null }], skipDuplicates: true });
      staffLinksAdded += 1;
    }

    if (outage.cabinId) {
      const cabinCampers = await prisma.camper.findMany({ where: { cabinId: outage.cabinId, active: true }, select: { id: true } });
      if (cabinCampers.length) {
        await prisma.outageCamper.createMany({
          data: cabinCampers.map((camper) => ({ outageId: outage.id, camperId: camper.id })),
          skipDuplicates: true
        });
        cabinsExpanded += 1;
        await prisma.outage.update({
          where: { id: outage.id },
          data: {
            notes: `${outage.notes ? `${outage.notes} ` : ""}[Migrated: camper list reconstructed from current cabin roster at migration time, not a historical snapshot.]`.trim()
          }
        });
      }
    }
  }

  refreshOutageConsumers();
  return { scanned: candidates.length, camperLinksAdded, staffLinksAdded, cabinsExpanded };
}
