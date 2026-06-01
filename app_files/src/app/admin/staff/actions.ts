"use server";

import { Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffAssignmentWarnings } from "@/lib/staff-assignment-warnings";

const staffPaths = ["/admin/staff", "/scream-session", "/switches", "/rosters", "/area-dashboard", "/exports"];

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
  const cabinId = String(formData.get("cabinId") ?? "");
  const primaryAreaIdRaw = String(formData.get("primaryAreaId") ?? "");
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
      cabinId: cabinId || null,
      primaryAreaId: nextPrimaryAreaId,
      statusCertification: String(formData.get("statusCertification") ?? "").trim() || null,
      availabilityNotes: String(formData.get("availabilityNotes") ?? "").trim() || null,
      sessionAvailability: String(formData.get("sessionAvailability") ?? "").trim() || null,
      secondaryAreas: { set: Array.from(new Set([...secondaryAreaIds, ...preservedSecondaryAreaIds])).map((areaId) => ({ id: areaId })) },
      skills: { set: Array.from(new Set([...skillIds, ...preservedSkillIds])).map((skillId) => ({ id: skillId })) },
      certifications: { set: Array.from(new Set([...certificationIds, ...preservedCertificationIds])).map((certificationId) => ({ id: certificationId })) }
    }
  });

  revalidateStaffConsumers();
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
