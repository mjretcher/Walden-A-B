import { NextRequest, NextResponse } from "next/server";
import { Period, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { staffAssignmentWarnings } from "@/lib/staff-assignment-warnings";

const aDayPeriods: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A];
const bDayPeriods: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B];

function dayPeriods(period: Period) {
  return aDayPeriods.includes(period) ? aDayPeriods : bDayPeriods;
}

function dayLabel(period: Period) {
  return aDayPeriods.includes(period) ? "A day" : "B day";
}

function isLeadershipStaff(staff: { statusCertification?: string | null; primaryArea?: { name: string } | null }) {
  const text = `${staff.statusCertification ?? ""} ${staff.primaryArea?.name ?? ""}`.toLowerCase();
  return /assistant\s*area\s*head|junior\s*admin|area\s*head|admin|leadership/.test(text);
}

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
    prisma.activityOffering.findFirst({
      where: { id: offeringId, active: true, area: { active: true }, activity: { active: true } },
      include: { area: true, activity: { include: { requiredSkills: true, requiredCertifications: true } } }
    })
  ]);

  if (!staff || !offering) return NextResponse.json({ error: "Staff member or offering not found." }, { status: 404 });

  const validation = staffAssignmentWarnings({ staff, offering, userRole: user.role });

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
        data: { offeringId, role, createdByUserId: user.id, notes: validation.warnings.join(" ") || null },
        include: { offering: { include: { activity: true, area: true } }, staff: true }
      })
    : await prisma.staffAssignment.create({
        data: { staffId, offeringId, sessionId: offering.sessionId, period: offering.period, role, createdByUserId: user.id, notes: validation.warnings.join(" ") || null },
        include: { offering: { include: { activity: true, area: true } }, staff: true }
      });

  const warnings = [...validation.warnings];
  const relevantPeriods = dayPeriods(offering.period);
  const assignedPeriods = await prisma.staffAssignment.findMany({
    where: { staffId, sessionId: offering.sessionId, period: { in: relevantPeriods } },
    select: { period: true }
  });
  const assignedPeriodSet = new Set(assignedPeriods.map((item) => item.period));
  const hasNoOffPeriod = relevantPeriods.every((period) => assignedPeriodSet.has(period));

  if (hasNoOffPeriod && !isLeadershipStaff(staff)) {
    warnings.push(`${staff.firstName} ${staff.lastName} is assigned all periods on ${dayLabel(offering.period)} and currently has no off period.`);
  }

  return NextResponse.json({
    assignment,
    label: `${PERIOD_LABEL[offering.period]} ${offering.activity.name}`,
    warnings
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const body = await request.json();
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return NextResponse.json({ error: "Active session is required." }, { status: 400 });

  await prisma.staffAssignment.deleteMany({
    where: {
      staffId: String(body.staffId ?? ""),
      sessionId: session.id,
      period: String(body.period ?? "") as Period
    }
  });

  return NextResponse.json({ ok: true });
}
