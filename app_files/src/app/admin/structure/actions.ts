"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { nextDefaultSessionColor, SESSION_COLOR_KEYS } from "@/lib/session-colors";
import { logAudit } from "@/lib/audit";

const affectedPaths = [
  "/admin/structure",
  "/admin/staff",
  "/admin/menu-builder",
  "/admin/users",
  "/dashboard",
  "/registration",
  "/scream-session",
  "/switches",
  "/area-dashboard"
];

function revalidateStructureConsumers() {
  for (const path of affectedPaths) revalidatePath(path);
}

export async function createSession(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  const year = Number(formData.get("year"));
  const cycle = String(formData.get("cycle") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name || !Number.isInteger(year)) return;

  const existingSessionCount = await prisma.session.count();
  const color = nextDefaultSessionColor(existingSessionCount);

  // Deactivate all existing sessions, then create the new one as active
  await prisma.session.updateMany({ data: { active: false } });
  const created = await prisma.session.create({
    data: {
      name,
      year,
      cycle: cycle || name,
      active: true,
      color,
      startsAt: startsAt ? new Date(`${startsAt}T12:00:00`) : null,
      endsAt: endsAt ? new Date(`${endsAt}T12:00:00`) : null,
      notes: notes || null
    }
  });

  logAudit({
    action: "session.create",
    actorId: actor.id,
    targetType: "session",
    targetId: created.id,
    metadata: { name: created.name, year: created.year, madeActive: true }
  });

  revalidateStructureConsumers();
}

export async function activateSession(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const previousActive = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true } });

  await prisma.session.updateMany({ data: { active: false } });
  const activated = await prisma.session.update({ where: { id }, data: { active: true } });

  logAudit({
    action: "session.activate",
    actorId: actor.id,
    targetType: "session",
    targetId: activated.id,
    metadata: { name: activated.name, previousActiveId: previousActive?.id ?? null, previousActiveName: previousActive?.name ?? null }
  });

  revalidateStructureConsumers();
}

export async function copyMenuToSession(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sourceSessionId = String(formData.get("sourceSessionId") ?? "");
  const targetSessionId = String(formData.get("targetSessionId") ?? "");
  if (!sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) return;

  // One-time copy, same guard as copyCampersToSession — prevents accidental
  // duplicate menus if this is clicked more than once for the same target.
  const existingMenuCount = await prisma.menu.count({ where: { sessionId: targetSessionId } });
  if (existingMenuCount > 0) return;

  // Fetch all menus + offerings from the source session
  const sourceMenus = await prisma.menu.findMany({
    where: { sessionId: sourceSessionId },
    include: {
      offerings: {
        where: { active: true },
        select: {
          areaId: true,
          activityId: true,
          period: true,
          eligibleUnits: true,
          eligibleSwimLevels: true,
          rosterLimit: true,
          limitType: true,
          allowOverride: true,
          preAssigned: true,
          spansTwoPeriods: true,
          staffTarget: true,
          visibleOnMenu: true,
          visibleForCamperRegistration: true,
          visibleOnMasterMenu: true,
          includeInPrint: true,
          notes: true
        }
      }
    }
  });

  // Recreate each menu and its offerings under the target session
  for (const menu of sourceMenus) {
    const newMenu = await prisma.menu.create({
      data: {
        sessionId: targetSessionId,
        name: menu.name,
        cycle: menu.cycle,
        notes: menu.notes
      }
    });

    if (menu.offerings.length > 0) {
      await prisma.activityOffering.createMany({
        data: menu.offerings.map((o) => ({
          sessionId: targetSessionId,
          menuId: newMenu.id,
          areaId: o.areaId,
          activityId: o.activityId,
          period: o.period,
          eligibleUnits: o.eligibleUnits,
          eligibleSwimLevels: o.eligibleSwimLevels,
          rosterLimit: o.rosterLimit,
          limitType: o.limitType,
          allowOverride: o.allowOverride,
          preAssigned: o.preAssigned,
          spansTwoPeriods: o.spansTwoPeriods,
          staffTarget: o.staffTarget,
          visibleOnMenu: o.visibleOnMenu,
          visibleForCamperRegistration: o.visibleForCamperRegistration,
          visibleOnMasterMenu: o.visibleOnMasterMenu,
          includeInPrint: o.includeInPrint,
          notes: o.notes
        }))
      });
    }
  }

  logAudit({
    action: "session.copy_menu",
    actorId: actor.id,
    targetType: "session",
    targetId: targetSessionId,
    metadata: { sourceSessionId, menuCount: sourceMenus.length }
  });

  revalidateStructureConsumers();
}

export async function copyCampersToSession(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sourceSessionId = String(formData.get("sourceSessionId") ?? "");
  const targetSessionId = String(formData.get("targetSessionId") ?? "");
  if (!sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) return;

  // One-time copy only — if the target session already has campers, do nothing.
  // This keeps the two sessions fully independent after the copy: re-running
  // this action never overwrites cabin changes already made in the target.
  const existingCount = await prisma.camper.count({ where: { sessionId: targetSessionId } });
  if (existingCount > 0) return;

  const sourceCampers = await prisma.camper.findMany({
    where: { sessionId: sourceSessionId },
    include: {
      allergies: { select: { allergyLabelId: true, notes: true } },
      sessionDesignations: { select: { label: true, source: true } },
      weekEnrollments: { select: { weekBlock: true, cabinId: true, cabinName: true } }
    }
  });

  // Recreate each camper (and their allergies, designations, week enrollments)
  // under the target session. cabinId is copied as the starting point only —
  // cabin edits made afterward in either session never affect the other.
  for (const camper of sourceCampers) {
    const newCamper = await prisma.camper.create({
      data: {
        firstName: camper.firstName,
        lastName: camper.lastName,
        gender: camper.gender,
        genderIdentity: camper.genderIdentity,
        age: camper.age,
        campGrade: camper.campGrade,
        unit: camper.unit,
        cabinId: camper.cabinId,
        swimLevel: camper.swimLevel,
        medicalFlags: camper.medicalFlags,
        counselorAssistant: camper.counselorAssistant,
        active: camper.active,
        status: camper.status,
        sessionId: targetSessionId,
        externalId: camper.externalId
      }
    });

    if (camper.allergies.length > 0) {
      await prisma.camperAllergy.createMany({
        data: camper.allergies.map((a) => ({
          camperId: newCamper.id,
          allergyLabelId: a.allergyLabelId,
          notes: a.notes
        }))
      });
    }

    if (camper.sessionDesignations.length > 0) {
      await prisma.camperSessionDesignation.createMany({
        data: camper.sessionDesignations.map((d) => ({
          camperId: newCamper.id,
          label: d.label,
          source: d.source
        }))
      });
    }

    if (camper.weekEnrollments.length > 0) {
      await prisma.camperWeekEnrollment.createMany({
        data: camper.weekEnrollments.map((w) => ({
          camperId: newCamper.id,
          sessionId: targetSessionId,
          weekBlock: w.weekBlock,
          cabinId: w.cabinId,
          cabinName: w.cabinName
        }))
      });
    }
  }

  logAudit({
    action: "session.copy_campers",
    actorId: actor.id,
    targetType: "session",
    targetId: targetSessionId,
    metadata: { sourceSessionId, camperCount: sourceCampers.length }
  });

  revalidateStructureConsumers();
}

export async function copyScreamSessionToSession(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sourceSessionId = String(formData.get("sourceSessionId") ?? "");
  const targetSessionId = String(formData.get("targetSessionId") ?? "");
  if (!sourceSessionId || !targetSessionId || sourceSessionId === targetSessionId) return;

  // One-time copy, same guard as campers/menu — no-op if the target already
  // has any staff assignments or off-periods, so this can't be re-run and
  // duplicate/clobber scream session work already done in the target.
  const [existingAssignmentCount, existingOffCount] = await Promise.all([
    prisma.staffAssignment.count({ where: { sessionId: targetSessionId } }),
    prisma.staffOffPeriod.count({ where: { sessionId: targetSessionId } })
  ]);
  if (existingAssignmentCount > 0 || existingOffCount > 0) return;

  // StaffAssignment points at a session-scoped ActivityOffering row, so a
  // straight copy of the assignment table would point at offerings that
  // don't exist in the target session. Instead, match each source
  // assignment to the equivalent offering in the target session by
  // (activityId, period, notes) — Activity/Area are global, so this holds
  // as long as the target session's menu was copied first (Copy menu
  // above). Assignments whose activity/period/notes combo isn't present in
  // the target menu are skipped rather than guessed at.
  const [sourceAssignments, targetOfferings] = await Promise.all([
    prisma.staffAssignment.findMany({
      where: { sessionId: sourceSessionId },
      select: { staffId: true, period: true, role: true, notes: true, createdByUserId: true, offering: { select: { activityId: true, period: true, notes: true } } }
    }),
    prisma.activityOffering.findMany({
      where: { sessionId: targetSessionId },
      select: { id: true, activityId: true, period: true, notes: true }
    })
  ]);

  const exactMatch = new Map<string, string>();
  const looseMatch = new Map<string, string>();
  for (const offering of targetOfferings) {
    looseMatch.set(`${offering.activityId}:${offering.period}`, offering.id);
    exactMatch.set(`${offering.activityId}:${offering.period}:${offering.notes ?? ""}`, offering.id);
  }

  let skipped = 0;
  const assignmentsToCreate: { staffId: string; offeringId: string; sessionId: string; period: (typeof sourceAssignments)[number]["period"]; role: string | null; notes: string | null; createdByUserId: string | null }[] = [];
  for (const assignment of sourceAssignments) {
    const key = `${assignment.offering.activityId}:${assignment.offering.period}:${assignment.offering.notes ?? ""}`;
    const looseKey = `${assignment.offering.activityId}:${assignment.offering.period}`;
    const targetOfferingId = exactMatch.get(key) ?? looseMatch.get(looseKey);
    if (!targetOfferingId) {
      skipped += 1;
      continue;
    }
    assignmentsToCreate.push({
      staffId: assignment.staffId,
      offeringId: targetOfferingId,
      sessionId: targetSessionId,
      period: assignment.period,
      role: assignment.role,
      notes: assignment.notes,
      createdByUserId: assignment.createdByUserId
    });
  }

  const sourceOffPeriods = await prisma.staffOffPeriod.findMany({
    where: { sessionId: sourceSessionId },
    select: { staffId: true, period: true, createdByUserId: true }
  });

  await prisma.$transaction(async (tx) => {
    if (assignmentsToCreate.length) {
      await tx.staffAssignment.createMany({ data: assignmentsToCreate, skipDuplicates: true });
    }
    if (sourceOffPeriods.length) {
      await tx.staffOffPeriod.createMany({
        data: sourceOffPeriods.map((offPeriod) => ({
          staffId: offPeriod.staffId,
          sessionId: targetSessionId,
          period: offPeriod.period,
          createdByUserId: offPeriod.createdByUserId
        })),
        skipDuplicates: true
      });
    }
  });

  logAudit({
    action: "session.copy_scream_session",
    actorId: actor.id,
    targetType: "session",
    targetId: targetSessionId,
    metadata: {
      sourceSessionId,
      assignmentsCopied: assignmentsToCreate.length,
      assignmentsSkipped: skipped,
      offPeriodsCopied: sourceOffPeriods.length
    }
  });

  revalidateStructureConsumers();
  revalidatePath("/scream-session");
}

export async function updateActiveSession(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const year = Number(formData.get("year"));
  const cycle = String(formData.get("cycle") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const colorInput = String(formData.get("color") ?? "");
  const color = (SESSION_COLOR_KEYS as readonly string[]).includes(colorInput) ? colorInput : undefined;

  if (!id || !name || !Number.isInteger(year)) return;

  await prisma.session.update({
    where: { id },
    data: {
      name,
      year,
      cycle: cycle || name,
      color,
      startsAt: startsAt ? new Date(`${startsAt}T12:00:00`) : null,
      endsAt: endsAt ? new Date(`${endsAt}T12:00:00`) : null,
      notes: notes || null
    }
  });

  revalidateStructureConsumers();
}

export async function createArea(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) throw new Error("Area name is required.");

  await prisma.area.upsert({
    where: { slug: slugify(name) },
    create: { name, slug: slugify(name), description: description || null },
    update: { name, description: description || null, active: true }
  });

  revalidateStructureConsumers();
}

export async function createSkill(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Skill name is required.");

  const existing = await prisma.skill.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    await prisma.skill.update({ where: { id: existing.id }, data: { name, active: true } });
  } else {
    await prisma.skill.create({ data: { name } });
  }

  revalidateStructureConsumers();
}

export async function createCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Certification name is required.");

  const existing = await prisma.certification.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    await prisma.certification.update({ where: { id: existing.id }, data: { name, active: true } });
  } else {
    await prisma.certification.create({ data: { name } });
  }

  revalidateStructureConsumers();
}

export async function updateCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Certification name is required.");

  const existing = await prisma.certification.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, NOT: { id } }
  });
  if (existing) throw new Error("A certification with that name already exists.");

  await prisma.certification.update({ where: { id }, data: { name } });

  revalidateStructureConsumers();
}

export async function updateCertificationActivityLinks(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id") ?? "");
  const activityIds = formData.getAll("activityIds").map(String);
  const activeActivityIds = (
    await prisma.activity.findMany({
      where: { id: { in: Array.from(new Set(activityIds)) }, active: true, area: { active: true } },
      select: { id: true }
    })
  ).map((activity) => activity.id);

  await prisma.certification.update({
    where: { id },
    data: {
      activities: { set: activeActivityIds.map((activityId) => ({ id: activityId })) }
    }
  });

  revalidateStructureConsumers();
}

export async function toggleArea(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.area.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}

export async function toggleSkill(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.skill.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}

export async function toggleCertification(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.certification.update({ where: { id }, data: { active: !active } });
  revalidateStructureConsumers();
}

/**
 * Bulk-save activity abbreviations. The form posts as paired fields:
 *   activityId[]      = ["abc", "def", ...]
 *   abbreviation[]    = ["SUP", "", ...]   (same length, same order, "" clears)
 *
 * One activity = one abbreviation, and it applies wherever that activity
 * appears (every offering in every period). Empty / whitespace-only values
 * clear the stored abbreviation.
 *
 * Also revalidates /reports/staff-schedule so the live view picks up the new
 * labels immediately.
 */
export async function updateActivityAbbreviations(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = formData.getAll("activityId").map(String);
  const values = formData.getAll("abbreviation").map(String);
  if (ids.length !== values.length) return;

  // Build a map of current abbreviations so we only write the rows that changed.
  // Avoids hitting Prisma with 100+ no-op updates when the form is submitted.
  const existing = await prisma.activity.findMany({
    where: { id: { in: ids } },
    select: { id: true, abbreviation: true }
  });
  const existingMap = new Map(existing.map((row) => [row.id, row.abbreviation ?? ""]));

  const writes: Array<Promise<unknown>> = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const next = (values[i] ?? "").trim();
    const prev = existingMap.get(id) ?? "";
    if (prev === next) continue;
    writes.push(
      prisma.activity.update({
        where: { id },
        data: { abbreviation: next || null }
      })
    );
  }

  if (writes.length) await Promise.all(writes);

  for (const path of [...affectedPaths, "/reports/staff-schedule"]) revalidatePath(path);
}
