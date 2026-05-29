import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { csv, commit } = await request.json();
  const rows = parseCsv(String(csv ?? ""));

  const preview = [];
  for (const row of rows) {
    const area = row.primaryArea ? await prisma.area.findFirst({ where: { name: { equals: row.primaryArea, mode: "insensitive" } } }) : null;
    const duplicate = await prisma.staff.findFirst({ where: { firstName: row.firstName, lastName: row.lastName } });
    preview.push({
      row,
      valid: Boolean(row.firstName && row.lastName),
      duplicate: Boolean(duplicate),
      warnings: area || !row.primaryArea ? [] : [`Primary area "${row.primaryArea}" will be created.`],
      errors: [!row.firstName ? "Missing firstName" : "", !row.lastName ? "Missing lastName" : ""].filter(Boolean)
    });
  }

  if (!commit) return NextResponse.json({ preview });

  let imported = 0;
  for (const item of preview) {
    if (!item.valid) continue;
    const row = item.row;
    const area = row.primaryArea
      ? await prisma.area.upsert({
          where: { slug: slugify(row.primaryArea) },
          create: { name: row.primaryArea, slug: slugify(row.primaryArea) },
          update: {}
        })
      : null;

    const skills = row.skills ? row.skills.split(/[;,]/).map((name) => name.trim()).filter(Boolean) : [];
    const certifications = row.certifications ? row.certifications.split(/[;,]/).map((name) => name.trim()).filter(Boolean) : [];

    for (const name of skills) await prisma.skill.upsert({ where: { name }, create: { name }, update: {} });
    for (const name of certifications) await prisma.certification.upsert({ where: { name }, create: { name }, update: {} });

    const existing = await prisma.staff.findFirst({ where: { firstName: row.firstName, lastName: row.lastName } });
    if (existing) {
      await prisma.staff.update({
        where: { id: existing.id },
        data: {
          primaryAreaId: area?.id,
          availabilityNotes: row.availabilityNotes || null,
          sessionAvailability: row.sessionAvailability || null,
          skills: { set: skills.map((name) => ({ name })) },
          certifications: { set: certifications.map((name) => ({ name })) }
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
          skills: { connect: skills.map((name) => ({ name })) },
          certifications: { connect: certifications.map((name) => ({ name })) }
        }
      });
    }
    imported += 1;
  }

  return NextResponse.json({ preview, imported });
}
