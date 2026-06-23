import { NextRequest, NextResponse } from "next/server";
import { Period, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, TWILIGHT_PERIODS } from "@/lib/periods";
import { staffingActivityLabel } from "@/lib/staffing-groups";
import { staffAssignmentWarnings } from "@/lib/staff-assignment-warnings";

const aDayPeriods: Period[] = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A];
const bDayPeriods: Period[] = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B];

function dayPeriods(period: Period) {
  return aDayPeriods.includes(period) ? aDayPeriods : bDayPeriods;
}

function dayLabel(period: Period) {
  return aDayPeriods.includes(period) ? "A day" : "B day";
}

function isPeriod(value: string): value is Period {
  return Object.values(Period).includes(value as Period);
}

function otherTwilightPeriod(period: Period) {
  if (period === Period.P5A) return Period.P5B;
  if (period === Period.P5B) return Period.P5A;
  return null;
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
  const requestedPeriod = String(body.period ?? "");
  const role = String(body.role ?? "Lead");
  const approveDoubleTwilight = body.approveDoubleTwilight === true;

  if (body.offPeriod === true) {
    if (!isPeriod(requestedPeriod)) return NextResponse.json({ error: "Valid period is required for an off period." }, { status: 400 });

    const [staff, session] = await Promise.all([
      prisma.staff.findUnique({ where: { id: staffId }, include: { primaryArea: true } }),
      prisma.session.findFirst({ where: { active: true } })
    ]);
    if (!staff || !session) return NextResponse.json({ error: "Staff member or active session not found." }, { status: 404 });

    const period = requestedPeriod;
    const offPeriod = await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.deleteMany({ where: { staffId, sessionId: session.id, period } });
      await tx.staffOffPeriod.deleteMany({ where: { staffId, sessionId: session.id, period } });
      return tx.staffOffPeriod.create({
        data: { staffId, sessionId: session.id, period, createdByUserId: user.id }
      });
    });

    return NextResponse.json({
      offPeriod,
      label: `${PERIOD_LABEL[period]} Off Period`,
      warnings: [`${staff.firstName} ${staff.lastName} now has ${PERIOD_LABEL[period]} marked as the ${dayLabel(period)} off period.`]
    });
  }

  const [staff, offering] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId }, include: { skills: true, certifications: true, primaryArea: true } }),
    prisma.activityOffering.findFirst({
      where: { id: offeringId, active: true, area: { active: true }, activity: { active: true } },
      include: { area: true, activity: { include: { requiredSkills: true, requiredCertifications: true } } }
    })
  ]);

  if (!staff || !offering) return NextResponse.json({ error: "Staff member or offering not found." }, { status: 404 });
  if (!isPeriod(requestedPeriod)) return NextResponse.json({ error: "Valid period is required for this assignment." }, { status: 400 });
  if (offering.period !== requestedPeriod) {
    return NextResponse.json({
      error: `Period mismatch: ${staffingActivityLabel(offering.activity.name)} belongs to ${PERIOD_LABEL[offering.period]}, not ${PERIOD_LABEL[requestedPeriod]}. Refresh Scream Session and try again.`
    }, { status: 409 });
  }

  const validation = staffAssignmentWarnings({ staff, offering, userRole: user.role });
  const warnings = [...validation.warnings];
  const otherTwilight = otherTwilightPeriod(offering.period);

  if (otherTwilight && TWILIGHT_PERIODS.includes(offering.period)) {
    const otherTwilightAssignment = await prisma.staffAssignment.findUnique({
      where: {
        staffId_sessionId_period: {
          staffId,
          sessionId: offering.sessionId,
          period: otherTwilight
        }
      },
      include: { offering: { include: { activity: true } } }
    });

    if (otherTwilightAssignment) {
      const warning = `${staff.firstName} ${staff.lastName} is already assigned to ${PERIOD_LABEL[otherTwilight]} ${staffingActivityLabel(otherTwilightAssignment.offering.activity.name)}. Approve assigning both twilight periods?`;
      if (!approveDoubleTwilight) {
        return NextResponse.json({ error: warning, warning, needsApproval: "DOUBLE_TWILIGHT" }, { status: 409 });
      }
      warnings.push(`Approved double twilight: ${PERIOD_LABEL[otherTwilight]} and ${PERIOD_LABEL[offering.period]}.`);
    }
  }

  const existing = await prisma.staffAssignment.findUnique({
    where: {
      staffId_sessionId_period: {
        staffId,
        sessionId: offering.sessionId,
        period: offering.period
      }
    }
  });

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.staffOffPeriod.deleteMany({ where: { staffId, sessionId: offering.sessionId, period: offering.period } });
    return existing
      ? tx.staffAssignment.update({
          where: { id: existing.id },
          data: { offeringId, role, createdByUserId: user.id, notes: warnings.join(" ") || null },
          include: { offering: { include: { activity: true, area: true } }, staff: true }
        })
      : tx.staffAssignment.create({
          data: { staffId, offeringId, sessionId: offering.sessionId, period: offering.period, role, createdByUserId: user.id, notes: warnings.join(" ") || null },
          include: { offering: { include: { activity: true, area: true } }, staff: true }
        });
  });

  const relevantPeriods = dayPeriods(offering.period);
  const [assignedPeriods, offPeriods] = await Promise.all([
    prisma.staffAssignment.findMany({
      where: { staffId, sessionId: offering.sessionId, period: { in: relevantPeriods } },
      select: { period: true }
    }),
    prisma.staffOffPeriod.findMany({
      where: { staffId, sessionId: offering.sessionId, period: { in: relevantPeriods } },
      select: { period: true }
    })
  ]);
  const assignedPeriodSet = new Set(assignedPeriods.map((item) => item.period));
  const offPeriodSet = new Set(offPeriods.map((item) => item.period));
  const hasNoOffPeriod = relevantPeriods.every((period) => assignedPeriodSet.has(period)) && !relevantPeriods.some((period) => offPeriodSet.has(period));

  if (hasNoOffPeriod && !isLeadershipStaff(staff)) {
    warnings.push(`${staff.firstName} ${staff.lastName} is assigned all periods on ${dayLabel(offering.period)} and currently has no off period.`);
  }

  return NextResponse.json({
    assignment,
    label: `${PERIOD_LABEL[offering.period]} ${staffingActivityLabel(offering.activity.name)}`,
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

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({
      where: {
        staffId: String(body.staffId ?? ""),
        sessionId: session.id,
        period: String(body.period ?? "") as Period
      }
    }),
    prisma.staffOffPeriod.deleteMany({
      where: {
        staffId: String(body.staffId ?? ""),
        sessionId: session.id,
        period: String(body.period ?? "") as Period
      }
    })
  ]);

  return NextResponse.json({ ok: true });
}
