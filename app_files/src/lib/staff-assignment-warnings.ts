import { UserRole } from "@prisma/client";

type Named = { name: string };

type StaffForAssignment = {
  active: boolean;
  firstName: string;
  lastName: string;
  primaryAreaId: string | null;
  primaryArea?: Named | null;
  skills: Named[];
  certifications: Named[];
};

type OfferingForAssignment = {
  areaId: string;
  area?: Named | null;
  activity: Named & {
    requiredSkills?: Named[];
    requiredCertifications?: Named[];
  };
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function certificationWarning(name: string) {
  return normalize(name).includes("certification") ? `Missing ${name}` : `Missing ${name} Certification`;
}

export function staffAssignmentWarnings({
  staff,
  offering,
  userRole
}: {
  staff: StaffForAssignment;
  offering: OfferingForAssignment;
  userRole: UserRole;
}) {
  const warnings: string[] = [];
  const staffName = `${staff.firstName} ${staff.lastName}`;

  if (staff.primaryAreaId && staff.primaryAreaId !== offering.areaId) {
    warnings.push(`${staffName} primary area is ${staff.primaryArea?.name ?? "another area"}.`);
  }

  const skillNames = staff.skills.map((skill) => normalize(skill.name));
  const requiredSkills = offering.activity.requiredSkills ?? [];
  if (requiredSkills.length) {
    for (const skill of requiredSkills) {
      if (!skillNames.includes(normalize(skill.name))) warnings.push(`Missing ${skill.name} skill.`);
    }
  } else if (!skillNames.some((skill) => normalize(offering.activity.name).includes(skill) || skill.includes(normalize(offering.activity.name)))) {
    warnings.push(`Skill mismatch warning for ${offering.activity.name}.`);
  }

  const certificationNames = staff.certifications.map((certification) => normalize(certification.name));
  for (const certification of offering.activity.requiredCertifications ?? []) {
    if (!certificationNames.includes(normalize(certification.name))) warnings.push(certificationWarning(certification.name));
  }

  if (!staff.active) warnings.push("Staff member is inactive.");

  return {
    allowed: true,
    executiveAdmin: userRole === UserRole.EXECUTIVE_ADMIN,
    warnings
  };
}
