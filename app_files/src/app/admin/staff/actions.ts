"use server";

import { Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffAssignmentWarnings } from "@/lib/staff-assignment-warnings";

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
  const cabinId = String(formData.get("cabinId") ?? "");
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

  await prisma.staff.update({
    where: { id },
    data: {
      firstName,
      lastName,
      cabinId: housingLabel ? null : cabinId || null,
      housingLabel: housingLabel || null,
      primaryAreaId: nextPrimaryAreaId,
      age: parseNumber(String(formData.get("age") ?? "")),
      position: String(formData.get("position") ?? "").trim() || null,
      position2: String(formData.get("position2") ?? "").trim() || null,
      employmentStart: parseDate(String(formData.get("employmentStart") ?? "")),
      employmentEnd: parseDate(String(formData.get("employmentEnd") ?? "")),
      screamEligible: formData.get("screamEligible") === "on",
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

export async function createStaff(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return;

  const [primaryAreaId] = await activeIds("area", [String(formData.get("primaryAreaId") ?? "")]);
  const certificationIds = await activeIds("certification", formData.getAll("certificationIds").map(String));
  const cabinId = String(formData.get("cabinId") ?? "");
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  await prisma.staff.create({
    data: {
      firstName,
      lastName,
      cabinId: housingLabel ? null : cabinId || null,
      housingLabel: housingLabel || null,
      age: parseNumber(String(formData.get("age") ?? "")),
      position: String(formData.get("position") ?? "").trim() || null,
      position2: String(formData.get("position2") ?? "").trim() || null,
      employmentStart: parseDate(String(formData.get("employmentStart") ?? "")),
      employmentEnd: parseDate(String(formData.get("employmentEnd") ?? "")),
      sessionAvailability: String(formData.get("sessionAvailability") ?? "").trim() || null,
      primaryAreaId: primaryAreaId ?? null,
      screamEligible: formData.get("screamEligible") === "on",
      ...(certificationIds.length ? { certifications: { connect: certificationIds.map((certificationId) => ({ id: certificationId })) } } : {}),
      active: true
    }
  });

  revalidateStaffConsumers();
}

export async function setStaffActive(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("staffId") ?? "");
  if (!id) return;
  await prisma.staff.update({
    where: { id },
    data: { active: formData.get("active") === "true" }
  });
  revalidateStaffConsumers();
}

export async function updateStaffCabin(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const staffId = String(formData.get("staffId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  const housingLabel = String(formData.get("housingLabel") ?? "").trim();
  if (!staffId) return;

  await prisma.staff.update({
    where: { id: staffId },
    data: housingLabel ? { cabinId: null, housingLabel } : { cabinId: cabinId || null, housingLabel: null }
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
