import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const body = await request.json();
  const staffId = String(body.staffId ?? "");
  const offeringId = String(body.offeringId ?? "");
  const role = String(body.role ?? "Lead");

  const [staff, offering] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, include: { skills: true, certifications: true, primaryArea: true } }),
    prisma.activityOffering.findUnique({ where: { id: offeringId }, include: { area: true, activity: true } })
  ]);

  if (!staff || !offering) return NextResponse.json({ error: "Staff member or offering not found." }, { status: 404 });

  const warnings: string[] = [];
  const skillNames = staff.skills.map((skill) => skill.name.toLowerCase());
  if (staff.primaryAreaId && staff.primaryAreaId !== offering.areaId) {
    warnings.push(`${staff.firstName} ${staff.lastName} primary area is ${staff.primaryArea?.name ?? "another area"}.`);
  }
  if (!skillNames.some((skill) => offering.activity.name.toLowerCase().includes(skill) || skill.includes(offering.activity.name.toLowerCase()))) {
    warnings.push(`Skill mismatch warning for ${offering.activity.name}.`);
  }
  if (!staff.active) warnings.push("Staff member is inactive.");

  const existing = await prisma.staffAssignment.findUnique({
    where: {
      staffId_sessionId_period: {
        staffId,
        sessionId: offering.sessionId,
        period: offering.period
      }
    }
  });

  const assignment = existing
    ? await prisma.staffAssignment.update({
        where: { id: existing.id },
        data: { offeringId, role, createdByUserId: user.id, notes: warnings.join(" ") || null },
        include: { offering: { include: { activity: true, area: true } }, staff: true }
      })
    : await prisma.staffAssignment.create({
        data: { staffId, offeringId, sessionId: offering.sessionId, period: offering.period, role, createdByUserId: user.id, notes: warnings.join(" ") || null },
        include: { offering: { include: { activity: true, area: true } }, staff: true }
      });

  return NextResponse.json({
    assignment,
    label: `${PERIOD_LABEL[offering.period]} ${offering.activity.name}`,
    warnings
  });
}
