import { NextRequest, NextResponse } from "next/server";
import { Gender, SwimLevel, Unit, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { csv, commit } = await request.json();
  const rows = parseCsv(String(csv ?? ""));
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return NextResponse.json({ error: "No active session." }, { status: 422 });

  const preview = [];
  for (const row of rows) {
    const unit = parseUnit(row.unit);
    const gender = parseGender(row.gender);
    const swimLevel = parseSwim(row.swimLevel);
    const duplicate = await prisma.camper.findFirst({
      where: { firstName: row.firstName, lastName: row.lastName, sessionId: session.id }
    });

    preview.push({
      row,
      valid: Boolean(row.firstName && row.lastName && unit && gender && swimLevel),
      duplicate: Boolean(duplicate),
      errors: [
        !row.firstName ? "Missing firstName" : "",
        !row.lastName ? "Missing lastName" : "",
        !unit ? "Invalid unit" : "",
        !gender ? "Invalid gender" : "",
        !swimLevel ? "Invalid swimLevel" : ""
      ].filter(Boolean)
    });
  }

  if (!commit) return NextResponse.json({ preview });

  let imported = 0;
  for (const item of preview) {
    if (!item.valid) continue;
    const row = item.row;
    const cabin = row.cabin
      ? await prisma.cabin.upsert({
          where: { name: row.cabin },
          create: { name: row.cabin, unit: parseUnit(row.unit)!, gender: parseGender(row.gender)! },
          update: {}
        })
      : null;

    const existing = await prisma.camper.findFirst({
      where: { firstName: row.firstName, lastName: row.lastName, sessionId: session.id }
    });

    if (existing) {
      await prisma.camper.update({
        where: { id: existing.id },
        data: {
          gender: parseGender(row.gender)!,
          unit: parseUnit(row.unit)!,
          cabinId: cabin?.id,
          swimLevel: parseSwim(row.swimLevel)!,
          medicalFlags: row.medicalFlags || null,
          active: true
        }
      });
    } else {
      await prisma.camper.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName,
          gender: parseGender(row.gender)!,
          unit: parseUnit(row.unit)!,
          cabinId: cabin?.id,
          swimLevel: parseSwim(row.swimLevel)!,
          medicalFlags: row.medicalFlags || null,
          sessionId: session.id
        }
      });
    }
    imported += 1;
  }

  return NextResponse.json({ preview, imported });
}

function parseUnit(value?: string) {
  const normalized = value?.replace(/[^0-9]/g, "");
  if (normalized === "1") return Unit.UNIT1;
  if (normalized === "2") return Unit.UNIT2;
  if (normalized === "3") return Unit.UNIT3;
  if (normalized === "4") return Unit.UNIT4;
  return null;
}

function parseGender(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (normalized?.startsWith("F")) return Gender.FEMALE;
  if (normalized?.startsWith("M")) return Gender.MALE;
  if (normalized?.startsWith("N")) return Gender.NON_BINARY;
  if (normalized) return Gender.UNSPECIFIED;
  return null;
}

function parseSwim(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (normalized?.startsWith("B")) return SwimLevel.BLUEGILL;
  if (normalized?.startsWith("W")) return SwimLevel.WALLEYE;
  if (normalized?.startsWith("M")) return SwimLevel.MUSKIE;
  return null;
}
