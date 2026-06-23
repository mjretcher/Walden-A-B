"use server";

import { LimitType, Period, SwimLevel, Unit, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { DEFAULT_STAFF_TARGET, periodsForMenuSelection } from "@/lib/menu-builder-behavior";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { writeStringArray } from "@/lib/local-arrays";
import { TWILIGHT_PERIODS, UNIT_LABEL } from "@/lib/periods";

export async function createOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const menu = session ? await prisma.menu.findFirst({ where: { sessionId: session.id, active: true } }) : null;
  if (!session || !menu) throw new Error("Active session and menu are required.");

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
      preAssigned: formData.get("preAssigned") === "on",
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
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const rosterLimitRaw = String(formData.get("rosterLimit") ?? "").trim();
  const certificationIds = await activeCertificationIds(formData.getAll("certificationIds").map(String));
  const offering = await prisma.activityOffering.findUnique({
    where: { id },
    select: { activityId: true, areaId: true, period: true, eligibleUnits: true, eligibleSwimLevels: true }
  });
  if (!offering) throw new Error("Offering is required.");
  const submittedPeriod = formData.get("period");
  const submittedUnits = formData.getAll("eligibleUnits") as Unit[];
  const submittedSwimLevels = formData.getAll("eligibleSwimLevels") as SwimLevel[];
  const swimLevels = await swimLevelsForArea(offering.areaId, formData, submittedSwimLevels.length ? submittedSwimLevels : null, offering.eligibleSwimLevels);

  await prisma.$transaction([
    prisma.activityOffering.update({
      where: { id },
      data: {
        period: submittedPeriod ? (String(submittedPeriod) as Period) : offering.period,
        eligibleUnits: submittedUnits.length ? writeStringArray(submittedUnits) : offering.eligibleUnits,
        eligibleSwimLevels: writeStringArray(swimLevels),
        rosterLimit: rosterLimitRaw ? Number(rosterLimitRaw) : null,
        limitType: String(formData.get("limitType")) as LimitType,
        staffTarget: readStaffTarget(formData),
        active: formData.get("active") === "on",
        preAssigned: formData.get("preAssigned") === "on",
        visibleForCamperRegistration: readCamperRegistrationVisibility(
          formData,
          submittedPeriod ? (String(submittedPeriod) as Period) : offering.period,
          false
        ),
        visibleOnMenu: readCheckbox(formData, "visibleOnMenu", false),
        visibleOnMasterMenu: readCheckbox(formData, "visibleOnMasterMenu", false),
        includeInPrint: readCheckbox(formData, "includeInPrint", false),
        allowOverride: formData.get("allowOverride") === "on",
        notes: String(formData.get("notes") ?? "").trim() || null
      }
    }),
    ...menuRowUpdates(formData),
    prisma.activity.update({
      where: { id: offering.activityId },
      data: { requiredCertifications: { set: certificationIds.map((certificationId) => ({ id: certificationId })) } }
    })
  ]);

  revalidateMenuPaths();
}

export async function deleteOffering(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();
  if (!id || confirm !== "DELETE") return;

  await prisma.activityOffering.delete({ where: { id } });

  revalidateMenuPaths();
}

export async function deleteOfferings(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = formData.getAll("offeringId").map(String).filter(Boolean);
  const confirm = String(formData.get("confirmMassDelete") ?? "").trim().toUpperCase();
  if (!ids.length || confirm !== "DELETE SELECTED") return;

  await prisma.activityOffering.deleteMany({ where: { id: { in: ids } } });
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
        preAssigned: source.preAssigned,
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
  const value = Number(formData.get("staffTarget") ?? DEFAULT_STAFF_TARGET);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_STAFF_TARGET;
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
