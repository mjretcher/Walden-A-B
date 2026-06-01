import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

function namesFromCell(value?: string) {
  return value ? value.split(/[;,]/).map((name) => name.trim()).filter(Boolean) : [];
}

async function findActiveArea(name?: string) {
  return name
    ? prisma.area.findFirst({ where: { name: { equals: name, mode: "insensitive" }, active: true } })
    : Promise.resolve(null);
}

async function findActiveSkills(names: string[]) {
  const records = await Promise.all(names.map((name) => prisma.skill.findFirst({ where: { name: { equals: name, mode: "insensitive" }, active: true } })));
  return records.filter(Boolean) as NonNullable<(typeof records)[number]>[];
}

async function findActiveCertifications(names: string[]) {
  const records = await Promise.all(
    names.map((name) => prisma.certification.findFirst({ where: { name: { equals: name, mode: "insensitive" }, active: true } }))
  );
  return records.filter(Boolean) as NonNullable<(typeof records)[number]>[];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { csv, commit } = await request.json();
  const rows = parseCsv(String(csv ?? ""));

  const preview = [];
  for (const row of rows) {
    const skillNames = namesFromCell(row.skills);
    const certificationNames = namesFromCell(row.certifications);
    const [area, skills, certifications] = await Promise.all([
      findActiveArea(row.primaryArea),
      findActiveSkills(skillNames),
      findActiveCertifications(certificationNames)
    ]);
    const duplicate = await prisma.staff.findFirst({ where: { firstName: row.firstName, lastName: row.lastName } });
    const matchedSkills = new Set(skills.map((skill) => skill.name.toLowerCase()));
    const matchedCertifications = new Set(certifications.map((certification) => certification.name.toLowerCase()));
    preview.push({
      row,
      valid: Boolean(row.firstName && row.lastName),
      duplicate: Boolean(duplicate),
      warnings: [
        area || !row.primaryArea ? "" : `Primary area "${row.primaryArea}" is not active in Camp Structure.`,
        ...skillNames.map((name) => (matchedSkills.has(name.toLowerCase()) ? "" : `Skill "${name}" is not active in Camp Structure.`)),
        ...certificationNames.map((name) => (matchedCertifications.has(name.toLowerCase()) ? "" : `Certification "${name}" is not active in Camp Structure.`))
      ].filter(Boolean),
      errors: [!row.firstName ? "Missing firstName" : "", !row.lastName ? "Missing lastName" : ""].filter(Boolean)
    });
  }

  if (!commit) return NextResponse.json({ preview });

  let imported = 0;
  for (const item of preview) {
    if (!item.valid) continue;
    const row = item.row;
    const [area, skills, certifications, existing] = await Promise.all([
      findActiveArea(row.primaryArea),
      findActiveSkills(namesFromCell(row.skills)),
      findActiveCertifications(namesFromCell(row.certifications)),
      prisma.staff.findFirst({
        where: { firstName: row.firstName, lastName: row.lastName },
        include: { primaryArea: true, skills: true, certifications: true }
      })
    ]);
    if (existing) {
      const inactiveSkillIds = existing.skills.filter((skill) => !skill.active).map((skill) => ({ id: skill.id }));
      const inactiveCertificationIds = existing.certifications.filter((certification) => !certification.active).map((certification) => ({ id: certification.id }));
      await prisma.staff.update({
        where: { id: existing.id },
        data: {
          primaryAreaId: area?.id ?? (row.primaryArea && existing.primaryArea && !existing.primaryArea.active ? existing.primaryArea.id : null),
          availabilityNotes: row.availabilityNotes || null,
          sessionAvailability: row.sessionAvailability || null,
          skills: { set: [...skills.map((skill) => ({ id: skill.id })), ...inactiveSkillIds] },
          certifications: { set: [...certifications.map((certification) => ({ id: certification.id })), ...inactiveCertificationIds] }
        }
      });
    } else {
      await prisma.staff.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName,
          primaryAreaId: area?.id,
          availabilityNotes: row.availabilityNotes || null,
          sessionAvailability: row.sessionAvailability || null,
          skills: { connect: skills.map((skill) => ({ id: skill.id })) },
          certifications: { connect: certifications.map((certification) => ({ id: certification.id })) }
        }
      });
    }
    imported += 1;
  }

  return NextResponse.json({ preview, imported });
}
