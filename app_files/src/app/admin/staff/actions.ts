"use server";

import { Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffAssignmentWarnings } from "@/lib/staff-assignment-warnings";
import { logAudit } from "@/lib/audit";

const staffPaths = ["/admin/staff", "/admin/staff/cabins", "/bunk-management/staff-housing", "/bunk-management/board", "/scream-session", "/switches", "/rosters", "/area-dashboard", "/exports"];

function revalidateStaffConsumers() {
  for (const path of staffPaths) revalidatePath(path);
}

async function activeIds(model: "area" | "skill" | "certification", ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return [];

  if (model === "area") {
    return (await prisma.area.findMany({ where: { id: { in: uniqueIds }, active: true }, select: { id: true } })).map((item) => item.id);
  }
  if (model === "skill") {
    return (await prisma.skill.findMany({ where: { id: { in: uniqueIds }, active: true }, select: { id: true } })).map((item) => item.id);
  }
  return (await prisma.certification.findMany({ where: { id: { in: uniqueIds }, active: true }, select: { id: true } })).map((item) => item.id);
}

export async function updateStaffProfile(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("id"));
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  const primaryAreaIdRaw = String(formData.get("primaryAreaId") ?? "");
  if (!firstName || !lastName) return;
  const current = await prisma.staff.findUnique({
    where: { id },
    include: { primaryArea: true, secondaryAreas: true, skills: true, certifications: true }
  });
  if (!current) throw new Error("Staff member not found.");

  const [primaryAreaId] = await activeIds("area", primaryAreaIdRaw ? [primaryAreaIdRaw] : []);
  const secondaryAreaIds = await activeIds("area", formData.getAll("secondaryAreaIds").map(String));
  const skillIds = await activeIds("skill", formData.getAll("skillIds").map(String));
  const certificationIds = await activeIds("certification", formData.getAll("certificationIds").map(String));
  const preservedSecondaryAreaIds = current.secondaryAreas.filter((area) => !area.active).map((area) => area.id);
  const preservedSkillIds = current.skills.filter((skill) => !skill.active).map((skill) => skill.id);
  const preservedCertificationIds = current.certifications.filter((certification) => !certification.active).map((certification) => certification.id);
  const nextPrimaryAreaId = primaryAreaId ?? (!primaryAreaIdRaw && current.primaryArea && !current.primaryArea.active ? current.primaryArea.id : null);

  // NOTE: cabinId is deliberately NOT touched here. Real cabin assignment
  // has its own confirmed action (setStaffCabinAssignment, below) so that
  // routine profile edits (name, position, availability, etc.) can never
  // silently change or clear someone's cabin as a side effect of saving
  // this form.
  //
  // If the free-text housingLabel actually changed on this save, clear the
  // structured housingLocationId/housingRoomId (set from the Staff Housing
  // page) so a manual text edit here can't leave a stale room link behind.
  // Only clear when it *changed* -- this form saves every profile field on
  // every submit, so unconditionally clearing would wipe a valid room
  // assignment any time an admin edited an unrelated field like position.
  const housingLabelChanged = (housingLabel || null) !== (current.housingLabel ?? null);

  await prisma.staff.update({
    where: { id },
    data: {
      firstName,
      lastName,
      housingLabel: housingLabel || null,
      ...(housingLabelChanged ? { housingLocationId: null, housingRoomId: null } : {}),
      primaryAreaId: nextPrimaryAreaId,
      age: parseNumber(String(formData.get("age") ?? "")),
      position: String(formData.get("position") ?? "").trim() || null,
      position2: String(formData.get("position2") ?? "").trim() || null,
      employmentStart: parseDate(String(formData.get("employmentStart") ?? "")),
      employmentEnd: parseDate(String(formData.get("employmentEnd") ?? "")),
      screamEligible: formData.get("screamEligible") === "on",
      keepDespiteCaMatch: formData.get("keepDespiteCaMatch") === "on",
      statusCertification: String(formData.get("statusCertification") ?? "").trim() || null,
      availabilityNotes: String(formData.get("availabilityNotes") ?? "").trim() || null,
      sessionAvailability: String(formData.get("sessionAvailability") ?? "").trim() || null,
      secondaryAreas: { set: Array.from(new Set([...secondaryAreaIds, ...preservedSecondaryAreaIds])).map((areaId) => ({ id: areaId })) },
      skills: { set: Array.from(new Set([...skillIds, ...preservedSkillIds])).map((skillId) => ({ id: skillId })) },
      certifications: { set: Array.from(new Set([...certificationIds, ...preservedCertificationIds])).map((certificationId) => ({ id: certificationId })) }
    }
  });

  revalidateStaffConsumers();
  revalidatePath(`/admin/staff/${id}`);
}

/**
 * Change a staff member's real cabin assignment on their profile page.
 * Requires typing the staff member's exact name to unlock the submit
 * button, mirroring the same confirmed pattern already used for camper
 * cabin changes (updateCamperCabin in app/admin/campers/actions.ts) --
 * a real cabin change is exactly the kind of thing that shouldn't happen
 * as a side effect of an unrelated field edit, so it's split out from
 * updateStaffProfile into its own explicit, confirmed action.
 */
export async function setStaffCabinAssignment(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  if (!staffId) return;

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, firstName: true, lastName: true, cabinId: true }
  });
  if (!staff) return;

  const expectedName = `${staff.firstName} ${staff.lastName}`;
  if (String(formData.get("confirmStaffName") ?? "").trim().toLowerCase() !== expectedName.toLowerCase()) return;

  const nextCabinId = cabinId || null;
  if (nextCabinId) {
    const cabin = await prisma.cabin.findUnique({ where: { id: nextCabinId }, select: { id: true } });
    if (!cabin) return;
  }
  if (staff.cabinId === nextCabinId) return;

  await prisma.staff.update({
    where: { id: staffId },
    // Setting a real cabin clears any custom housing label, and vice versa
    // (the same mutual-exclusivity already enforced everywhere else this
    // pair of fields is written).
    data: { cabinId: nextCabinId, housingLabel: nextCabinId ? null : undefined }
  });

  logAudit({
    action: "staff.cabin_change",
    actorId: actor.id,
    targetType: "staff",
    targetId: staffId,
    metadata: { staffName: expectedName, fromCabinId: staff.cabinId, toCabinId: nextCabinId }
  });

  revalidateStaffConsumers();
  revalidatePath(`/admin/staff/${staffId}`);
}

export async function createStaff(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const [primaryAreaId] = await activeIds("area", [String(formData.get("primaryAreaId") ?? "")]);
  const certificationIds = await activeIds("certification", formData.getAll("certificationIds").map(String));
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  // No cabinId here on purpose -- a brand-new staff member starts with no
  // real cabin assignment. Assign one afterward via the confirmed editor
  // on their profile page (setStaffCabinAssignment), same as everyone else.
  await prisma.staff.create({
    data: {
      firstName,
      lastName,
      housingLabel: housingLabel || null,
      age: parseNumber(String(formData.get("age") ?? "")),
      position: String(formData.get("position") ?? "").trim() || null,
      position2: String(formData.get("position2") ?? "").trim() || null,
      employmentStart: parseDate(String(formData.get("employmentStart") ?? "")),
      employmentEnd: parseDate(String(formData.get("employmentEnd") ?? "")),
      sessionAvailability: String(formData.get("sessionAvailability") ?? "").trim() || null,
      primaryAreaId: primaryAreaId ?? null,
      screamEligible: formData.get("screamEligible") === "on",
      keepDespiteCaMatch: formData.get("keepDespiteCaMatch") === "on",
      ...(certificationIds.length ? { certifications: { connect: certificationIds.map((certificationId) => ({ id: certificationId })) } } : {}),
      active: true
    }
  });

  revalidateStaffConsumers();
}

export async function setStaffActive(formData: FormData) {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("staffId") ?? "");
  if (!id) return;
  const nextActive = formData.get("active") === "true";

  if (nextActive) {
    // Reactivation restores the profile ONLY -- class staffing and cabin
    // assignments were removed on deactivation and must be re-assigned by
    // hand (staffing has usually moved on by the time someone comes back).
    await prisma.staff.update({ where: { id }, data: { active: true } });
    revalidateStaffConsumers();
    revalidatePath(`/admin/staff/${id}`);
    return;
  }

  // Deactivation = "departed camp": one transaction pulls the staff member
  // off everything current, without touching the Staff row's history.
  //   - active=false     -> off staff lists, duty sheets, schedule, prescream,
  //                         scream session, and every surface filtering active
  //   - cabinId/housing kept as text history, but cabin FK cleared
  //   - staffAssignments deleted for active session(s) -> off class staffing,
  //     area dashboards, block plans, period-cabin reports
  //   - cabinStaffAssignments deleted for active session(s) -> off bunk
  //     sheets and cabin staff counts
  // Assignments are current-state rows (menu-builder already deletes them
  // freely on releases), so deleting here matches existing practice -- the
  // durable history lives in the audit log entry below.
  const staff = await prisma.staff.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cabinId: true,
      assignments: {
        where: { session: { active: true } },
        select: { id: true, sessionId: true, offeringId: true, period: true }
      },
      cabinStaffAssignments: {
        where: { session: { active: true } },
        select: { id: true, cabinId: true }
      }
    }
  });
  if (!staff) return;

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: staff.id }, data: { active: false, cabinId: null } });
    if (staff.assignments.length) {
      await tx.staffAssignment.deleteMany({ where: { id: { in: staff.assignments.map((assignment) => assignment.id) } } });
    }
    if (staff.cabinStaffAssignments.length) {
      await tx.cabinStaffAssignment.deleteMany({ where: { id: { in: staff.cabinStaffAssignments.map((assignment) => assignment.id) } } });
    }
  });

  logAudit({
    action: "staff.deactivated",
    actorId: actor.id,
    targetType: "staff",
    targetId: staff.id,
    metadata: {
      staffName: `${staff.firstName} ${staff.lastName}`,
      clearedCabinId: staff.cabinId,
      removedStaffAssignments: staff.assignments.map((assignment) => ({ offeringId: assignment.offeringId, period: assignment.period })),
      removedCabinStaffAssignments: staff.cabinStaffAssignments.map((assignment) => assignment.cabinId)
    }
  });

  // Printed rosters show staff in the header, so any class they were staffing
  // has a stale sheet now. camperId/direction stay null -- the reprint flag's
  // denormalized fields exist exactly so a non-camper reason still reads
  // correctly on the Rosters page.
  const staffName = `${staff.firstName} ${staff.lastName}`;
  const flagsBySession = new Map<string, Set<string>>();
  for (const assignment of staff.assignments) {
    if (!flagsBySession.has(assignment.sessionId)) flagsBySession.set(assignment.sessionId, new Set());
    flagsBySession.get(assignment.sessionId)!.add(assignment.offeringId);
  }
  for (const [sessionId, offeringIds] of flagsBySession) {
    try {
      await prisma.rosterReprintFlag.createMany({
        data: Array.from(offeringIds).map((offeringId) => ({
          sessionId,
          offeringId,
          reason: `Staff ${staffName} removed from this class (deactivated)`,
          camperName: staffName,
          decidedByName: actor.name ?? null
        }))
      });
    } catch (flagErr) {
      console.error("Failed to flag rosters for staff deactivation", flagErr);
    }
  }

  revalidateStaffConsumers();
  for (const path of [`/admin/staff/${id}`, "/bunk-management/print", "/bunk-management/print-staff", "/bunk-management/cabins", "/reports/staff-period-cabins", "/reports/staff-schedule", "/right-now", "/reports/area-block-plan"]) {
    revalidatePath(path);
  }
}

export async function updateStaffCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  if (!staffId) return;

  // This action is dedicated entirely to setting housing/cabin (never a
  // general profile save), so it's always safe to clear the structured
  // housingLocationId/housingRoomId here -- a manual text edit through this
  // quick-edit popover means the Staff Housing page's room link is no
  // longer accurate.
  await prisma.staff.update({
    where: { id: staffId },
    data: housingLabel
      ? { cabinId: null, housingLabel, housingLocationId: null, housingRoomId: null }
      : { cabinId: cabinId || null, housingLabel: null, housingLocationId: null, housingRoomId: null }
  });

  revalidateStaffConsumers();
  revalidatePath(`/admin/staff/${staffId}`);
}

export async function deleteStaff(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("staffId") ?? "");
  const confirm = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();
  if (!id || confirm !== "DELETE") return;

  await prisma.staff.delete({ where: { id } });

  revalidateStaffConsumers();
  redirect("/admin/staff");
}

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string) {
  return value.trim() ? new Date(`${value}T12:00:00`) : null;
}

export async function assignStaffToOffering(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId"));
  const offeringId = String(formData.get("offeringId"));
  const role = String(formData.get("role") ?? "Lead").trim() || "Lead";

  const [staff, offering] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, include: { skills: true, certifications: true, primaryArea: true } }),
    prisma.activityOffering.findFirst({
      where: { id: offeringId, active: true, area: { active: true }, activity: { active: true } },
      include: { area: true, activity: { include: { requiredSkills: true, requiredCertifications: true } } }
    })
  ]);

  if (!staff || !offering) throw new Error("Staff member or active offering not found.");
  const validation = staffAssignmentWarnings({ staff, offering, userRole: user.role });
  const existing = await prisma.staffAssignment.findUnique({
    where: { staffId_sessionId_period: { staffId, sessionId: offering.sessionId, period: offering.period } }
  });

  if (existing) {
    await prisma.staffAssignment.update({
      where: { id: existing.id },
      data: { offeringId, role, createdByUserId: user.id, notes: validation.warnings.join(" ") || null }
    });
  } else {
    await prisma.staffAssignment.create({
      data: { staffId, offeringId, sessionId: offering.sessionId, period: offering.period, role, createdByUserId: user.id, notes: validation.warnings.join(" ") || null }
    });
  }

  revalidateStaffConsumers();
}

export async function removeStaffAssignment(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const assignmentId = String(formData.get("assignmentId"));
  await prisma.staffAssignment.delete({ where: { id: assignmentId } });
  revalidateStaffConsumers();
}

export async function removeStaffPeriodAssignment(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) throw new Error("Active session is required.");

  await prisma.staffAssignment.deleteMany({
    where: {
      staffId: String(formData.get("staffId")),
      sessionId: session.id,
      period: String(formData.get("period")) as Period
    }
  });

  revalidateStaffConsumers();
}
