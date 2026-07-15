"use server";

import { LimitType, Period, SwimLevel, Unit, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { DEFAULT_STAFF_TARGET, periodsForMenuSelection } from "@/lib/menu-builder-behavior";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { writeStringArray } from "@/lib/local-arrays";
import { TWILIGHT_PERIODS, UNIT_LABEL } from "@/lib/periods";
import { logAudit } from "@/lib/audit";

export async function createOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const requestedSessionId = String(formData.get("sessionId") ?? "").trim();
  // Falls back to whichever session is active only if the form somehow
  // didn't carry a sessionId (defensive -- every current caller sends one).
  // This is what lets a menu be built out for a session other than the
  // active one, matching how Bunk Management's board and the Q3 import
  // tool already work.
  const session = requestedSessionId
    ? await prisma.session.findUnique({ where: { id: requestedSessionId } })
    : await prisma.session.findFirst({ where: { active: true } });
  const menu = session ? await prisma.menu.findFirst({ where: { sessionId: session.id, active: true } }) : null;
  if (!session || !menu) throw new Error("A session and menu are required.");

  const requestedAreaId = String(formData.get("areaId"));
  const activity = await resolveActivity(requestedAreaId, formData);
  const certificationIds = await activeCertificationIds(formData.getAll("certificationIds").map(String));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const rosterLimit = rosterLimitRaw ? Number(rosterLimitRaw) : null;
  const eligibleUnits = formData.getAll("eligibleUnits") as Unit[];
  const swimLevels = await swimLevelsForArea(activity.areaId, formData);
  const periods = selectedPeriods(formData);

  if (certificationIds.length) {
    await prisma.activity.update({
      where: { id: activity.id },
      data: { requiredCertifications: { set: certificationIds.map((id) => ({ id })) } }
    });
  }

  await prisma.activityOffering.createMany({
    data: periods.map((period) => ({
      sessionId: session.id,
      menuId: menu.id,
      areaId: activity.areaId,
      activityId: activity.id,
      period,
      eligibleUnits: writeStringArray(eligibleUnits),
      eligibleSwimLevels: writeStringArray(swimLevels),
      rosterLimit,
      limitType: String(formData.get("limitType")) as LimitType,
      allowOverride: formData.get("allowOverride") === "on",
      allowWaitlist: formData.get("allowWaitlist") === "on",
      preAssigned: formData.get("preAssigned") === "on",
      spansTwoPeriods: formData.get("spansTwoPeriods") === "on",
      visibleForCamperRegistration: readCamperRegistrationVisibility(formData, period, true),
      visibleOnMenu: readCheckbox(formData, "visibleOnMenu", true),
      visibleOnMasterMenu: readCheckbox(formData, "visibleOnMasterMenu", true),
      includeInPrint: readCheckbox(formData, "includeInPrint", true),
      staffTarget: readStaffTarget(formData),
      notes: String(formData.get("notes") ?? "").trim() || null
    }))
  });

  const createdOfferings = await prisma.activityOffering.findMany({
    where: {
      sessionId: session.id,
      menuId: menu.id,
      activityId: activity.id,
      period: { in: periods },
      notes: String(formData.get("notes") ?? "").trim() || null
    },
    select: { id: true }
  });
  await createDefaultMenuRows(createdOfferings.map((offering) => offering.id), eligibleUnits);

  revalidateMenuPaths();
}

export async function updateOffering(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const certificationIds = await activeCertificationIds(formData.getAll("certificationIds").map(String));
  const offering = await prisma.activityOffering.findUnique({
    where: { id },
    select: { sessionId: true, activityId: true, areaId: true, period: true, eligibleUnits: true, eligibleSwimLevels: true, active: true }
  });
  if (!offering) throw new Error("Offering is required.");
  const submittedPeriod = formData.get("period");
  const submittedUnits = formData.getAll("eligibleUnits") as Unit[];
  const submittedSwimLevels = formData.getAll("eligibleSwimLevels") as SwimLevel[];
  const swimLevels = await swimLevelsForArea(offering.areaId, formData, submittedSwimLevels.length ? submittedSwimLevels : null, offering.eligibleSwimLevels);

  const nextActive = formData.get("active") === "on";
  const nextStaffTarget = readStaffTarget(formData);
  // Staffing need is driven by "active" alone — NOT staffTarget. A
  // staffTarget of 0 is a real, intentional value (occasional-coverage
  // classes like camp photo: always needs *someone*, no fixed headcount),
  // not "unstaffed." Only deactivating (or deleting, handled separately in
  // deleteOffering/deleteOfferings) means a class stops needing staffing.
  const wasStaffed = offering.active;
  const willBeStaffed = nextActive;

  await prisma.$transaction([
    prisma.activityOffering.update({
      where: { id },
      data: {
        period: submittedPeriod ? (String(submittedPeriod) as Period) : offering.period,
        eligibleUnits: submittedUnits.length ? writeStringArray(submittedUnits) : offering.eligibleUnits,
        eligibleSwimLevels: writeStringArray(swimLevels),
        rosterLimit: rosterLimitRaw ? Number(rosterLimitRaw) : null,
        limitType: String(formData.get("limitType")) as LimitType,
        staffTarget: nextStaffTarget,
        active: nextActive,
        preAssigned: formData.get("preAssigned") === "on",
        spansTwoPeriods: formData.get("spansTwoPeriods") === "on",
        visibleForCamperRegistration: readCamperRegistrationVisibility(
          formData,
          submittedPeriod ? (String(submittedPeriod) as Period) : offering.period,
          false
        ),
        visibleOnMenu: readCheckbox(formData, "visibleOnMenu", false),
        visibleOnMasterMenu: readCheckbox(formData, "visibleOnMasterMenu", false),
        includeInPrint: readCheckbox(formData, "includeInPrint", false),
        allowOverride: formData.get("allowOverride") === "on",
        allowWaitlist: formData.get("allowWaitlist") === "on",
        notes: String(formData.get("notes") ?? "").trim() || null
      }
    }),
    ...menuRowUpdates(formData),
    prisma.activity.update({
      where: { id: offering.activityId },
      data: { requiredCertifications: { set: certificationIds.map((certificationId) => ({ id: certificationId })) } }
    })
  ]);

  if (wasStaffed && !willBeStaffed) {
    await releaseStaffAssignmentsForOffering(id, offering.sessionId, actor.id, "class deactivated");
  }

  revalidateMenuPaths();
}

export async function deleteOffering(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();
  if (!id || confirm !== "DELETE") return;

  const releasedStaff = await prisma.staffAssignment.findMany({
    where: { offeringId: id },
    select: { period: true, staff: { select: { firstName: true, lastName: true } } }
  });
  const sessionId = releasedStaff.length ? (await prisma.activityOffering.findUnique({ where: { id }, select: { sessionId: true } }))?.sessionId : null;

  // onDelete: Cascade on StaffAssignment.offering already removes any
  // assignments for this offering as part of this delete — no separate
  // deleteMany needed. What cascade alone doesn't do is bump the freshness
  // signal the Scream Session board's polling relies on, so that's handled
  // explicitly below when there was anything to release.
  await prisma.activityOffering.delete({ where: { id } });

  if (releasedStaff.length && sessionId) {
    await prisma.session.update({ where: { id: sessionId }, data: { lastStaffingChangeAt: new Date() } });
    logAudit({
      action: "offering.release_staff_assignments",
      actorId: actor.id,
      targetType: "activityOffering",
      targetId: id,
      metadata: {
        reason: "class deleted",
        releasedCount: releasedStaff.length,
        releasedStaff: releasedStaff.map((row) => `${row.staff.firstName} ${row.staff.lastName} (${row.period})`)
      }
    });
  }

  revalidateMenuPaths();
}

export async function deleteOfferings(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = formData.getAll("offeringId").map(String).filter(Boolean);
  const confirm = String(formData.get("confirmMassDelete") ?? "").trim().toUpperCase();
  if (!ids.length || confirm !== "DELETE SELECTED") return;

  const releasedStaff = await prisma.staffAssignment.findMany({
    where: { offeringId: { in: ids } },
    select: { period: true, staff: { select: { firstName: true, lastName: true } }, offering: { select: { sessionId: true } } }
  });

  await prisma.activityOffering.deleteMany({ where: { id: { in: ids } } });

  if (releasedStaff.length) {
    const sessionIds = Array.from(new Set(releasedStaff.map((row) => row.offering.sessionId)));
    await prisma.session.updateMany({ where: { id: { in: sessionIds } }, data: { lastStaffingChangeAt: new Date() } });
    logAudit({
      action: "offering.release_staff_assignments",
      actorId: actor.id,
      targetType: "activityOffering",
      targetId: ids.join(","),
      metadata: {
        reason: "classes bulk-deleted",
        releasedCount: releasedStaff.length,
        releasedStaff: releasedStaff.map((row) => `${row.staff.firstName} ${row.staff.lastName} (${row.period})`)
      }
    });
  }

  revalidateMenuPaths();
}

export async function renameActivity(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const activityId = String(formData.get("activityId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  if (!activityId || !newName) return;

  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: { areaId: true, name: true } });
  if (!activity) return;
  if (activity.name === newName) return;

  const newSlug = slugify(newName);
  // Avoid colliding with an existing activity slug in the same area
  const conflict = await prisma.activity.findFirst({
    where: { areaId: activity.areaId, slug: newSlug, NOT: { id: activityId } },
    select: { id: true }
  });
  if (conflict) throw new Error(`Another activity in this area already uses the name "${newName}".`);

  await prisma.activity.update({
    where: { id: activityId },
    data: { name: newName, slug: newSlug }
  });

  revalidateMenuPaths();
}

export async function duplicateOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sourceId = String(formData.get("sourceOfferingId") ?? "");
  const periods = selectedPeriods(formData);
  const source = await prisma.activityOffering.findUnique({
    where: { id: sourceId },
    include: {
      registrations: true,
      staffAssignments: true,
      menuRows: { orderBy: { sortOrder: "asc" } }
    }
  });
  if (!source || !periods.length) return;

  for (const period of periods) {
    const created = await prisma.activityOffering.create({
      data: {
        sessionId: source.sessionId,
        menuId: source.menuId,
        areaId: source.areaId,
        activityId: source.activityId,
        period,
        eligibleUnits: source.eligibleUnits,
        eligibleSwimLevels: source.eligibleSwimLevels,
        rosterLimit: source.rosterLimit,
        limitType: source.limitType,
        allowOverride: source.allowOverride,
        allowWaitlist: source.allowWaitlist,
        preAssigned: source.preAssigned,
        spansTwoPeriods: source.spansTwoPeriods,
        staffTarget: source.staffTarget,
        active: source.active,
        visibleForCamperRegistration: source.visibleForCamperRegistration,
        visibleOnMenu: source.visibleOnMenu,
        visibleOnMasterMenu: source.visibleOnMasterMenu,
        includeInPrint: source.includeInPrint,
        notes: source.notes,
        menuRows: {
          create: source.menuRows.map((row) => ({
            label: row.label,
            visible: row.visible,
            includeInPrint: row.includeInPrint,
            sortOrder: row.sortOrder
          }))
        }
      }
    });

    if (source.registrations.length) {
      await prisma.registration.createMany({
        data: source.registrations.map((registration) => ({
          camperId: registration.camperId,
          offeringId: created.id,
          sessionId: registration.sessionId,
          menuId: registration.menuId,
          period,
          registrationWindow: registration.registrationWindow,
          registrationRole: registration.registrationRole,
          counselorApproval: registration.counselorApproval,
          approvedByUserId: registration.approvedByUserId,
          status: registration.status,
          overrideReason: registration.overrideReason
        }))
      });
    }

    if (source.staffAssignments.length) {
      await prisma.staffAssignment.createMany({
        data: source.staffAssignments.map((assignment) => ({
          staffId: assignment.staffId,
          offeringId: created.id,
          sessionId: assignment.sessionId,
          period,
          role: assignment.role,
          notes: assignment.notes,
          createdByUserId: assignment.createdByUserId
        })),
        skipDuplicates: true
      });
    }
  }

  revalidateMenuPaths();
}

async function activeCertificationIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return [];
  return (await prisma.certification.findMany({
    where: { id: { in: uniqueIds }, active: true },
    select: { id: true }
  })).map((certification) => certification.id);
}

function readCheckbox(formData: FormData, name: string, defaultValue: boolean) {
  const values = formData.getAll(name);
  return values.length === 0 ? defaultValue : values.includes("on");
}

function readCamperRegistrationVisibility(formData: FormData, period: Period, defaultHideTwilight: boolean) {
  if (formData.get("staffOnlyForCamperRegistration") === "on") return false;
  return !(defaultHideTwilight && TWILIGHT_PERIODS.includes(period));
}

function parseStoredArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function swimLevelsForArea(areaId: string, formData: FormData, submittedLevels?: SwimLevel[] | null, existingValue?: string | null) {
  const area = await prisma.area.findUnique({ where: { id: areaId }, select: { name: true } });
  if (!area?.name.toLowerCase().includes("waterfront")) return [];
  if (submittedLevels) return submittedLevels;
  const formLevels = formData.getAll("eligibleSwimLevels") as SwimLevel[];
  return formLevels.length ? formLevels : (parseStoredArray(existingValue ?? null) as SwimLevel[]);
}

function readStaffTarget(formData: FormData) {
  const raw = formData.get("staffTarget");
  // 0 is a real, intentional value here — Mike uses it for "occasional
  // coverage" classes (e.g. camp photo) that always need *someone* but have
  // no fixed headcount, so any number of staff (1, 2, 3...) is fine. Only
  // missing/blank/invalid input should fall back to the default; 0 must be
  // preserved exactly as entered.
  if (raw === null || String(raw).trim() === "") return DEFAULT_STAFF_TARGET;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_STAFF_TARGET;
}

function selectedPeriods(formData: FormData) {
  return periodsForMenuSelection({
    daySelection: String(formData.get("daySelection") ?? "SINGLE"),
    singlePeriod: String(formData.get("period") ?? Period.P1A),
    checkedPeriods: formData.getAll("periods").map(String)
  }) as Period[];
}

async function createDefaultMenuRows(offeringIds: string[], units: Unit[]) {
  if (!offeringIds.length || !units.length) return;
  await prisma.menuDisplayRow.createMany({
    data: offeringIds.flatMap((offeringId) =>
      units.map((unit, index) => ({
        offeringId,
        label: UNIT_LABEL[unit],
        visible: true,
        includeInPrint: true,
        sortOrder: index
      }))
    )
  });
}

function menuRowUpdates(formData: FormData) {
  return formData.getAll("menuRowId").map((value) => {
    const id = String(value);
    return prisma.menuDisplayRow.update({
      where: { id },
      data: {
        visible: formData.get(`menuRowVisible-${id}`) === "on",
        includeInPrint: formData.get(`menuRowPrint-${id}`) === "on"
      }
    });
  });
}

// Runs when a class's staffing need drops to nothing (deactivated, or
// staffTarget set to 0) while it previously needed staff. Frees up the
// specific staff who were on it — rather than leaving them "assigned" in
// the database to a class the Scream Session board no longer even shows —
// and logs exactly who was released and why so it's not a silent change.
async function releaseStaffAssignmentsForOffering(offeringId: string, sessionId: string, actorId: string, reason: string) {
  const released = await prisma.staffAssignment.findMany({
    where: { offeringId },
    select: { id: true, period: true, staff: { select: { firstName: true, lastName: true } } }
  });
  if (!released.length) return;

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({ where: { offeringId } }),
    // Deleting rows doesn't bump any remaining row's updatedAt, so it would
    // otherwise be invisible to the Scream Session freshness banner's
    // polling check. This explicit field gives that check a real signal —
    // see /api/scream-session/last-updated.
    prisma.session.update({ where: { id: sessionId }, data: { lastStaffingChangeAt: new Date() } })
  ]);

  logAudit({
    action: "offering.release_staff_assignments",
    actorId,
    targetType: "activityOffering",
    targetId: offeringId,
    metadata: {
      reason,
      releasedCount: released.length,
      releasedStaff: released.map((row) => `${row.staff.firstName} ${row.staff.lastName} (${row.period})`)
    }
  });
}

function revalidateMenuPaths() {
  revalidatePath("/admin/menu-builder");
  revalidatePath("/registration");
  revalidatePath("/rosters");
  revalidatePath("/reports/ab-menu");
  revalidatePath("/reports/master-ab-menu");
  revalidatePath("/dashboard");
  revalidatePath("/scream-session");
  revalidatePath("/area-dashboard");
  revalidatePath("/reports/area-block-plan");
}

async function resolveActivity(areaId: string, formData: FormData) {
  const area = await prisma.area.findFirst({ where: { id: areaId, active: true } });
  if (!area) throw new Error("Active area is required.");

  const existingActivityId = String(formData.get("activityId") ?? "");
  const newActivityName = String(formData.get("newActivityName") ?? "").trim();
  if (newActivityName) {
    const activity = await prisma.activity.upsert({
      where: { areaId_slug: { areaId, slug: slugify(newActivityName) } },
      create: { areaId, name: newActivityName, slug: slugify(newActivityName) },
      update: { active: true }
    });
    return activity;
  }
  const activity = await prisma.activity.findFirst({ where: { id: existingActivityId, active: true } });
  if (!activity) throw new Error("Active activity is required.");
  return activity;
}
