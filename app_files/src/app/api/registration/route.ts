import { NextRequest, NextResponse } from "next/server";
import { RegistrationStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { canOverrideCapacity } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { validateRegistration } from "@/lib/eligibility";
import { parseRegistrationWindow } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const camperId = String(body.camperId ?? "");
  const offeringId = String(body.offeringId ?? "");
  const counselorApproval = String(body.counselorApproval ?? "").trim();
  const wantsOverride = Boolean(body.override);
  const canOverride = canOverrideCapacity(user.role);
  const registrationWindow = parseRegistrationWindow(body.registrationWindow);

  const [camper, offering] = await Promise.all([
    prisma.camper.findUnique({ where: { id: camperId }, include: { cabin: true } }),
    prisma.activityOffering.findFirst({
      where: { id: offeringId, active: true, area: { active: true }, activity: { active: true } },
      include: { activity: true, area: true }
    })
  ]);

  if (!camper || !offering) return NextResponse.json({ error: "Camper or offering not found." }, { status: 404 });
  if (user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== offering.areaId && wantsOverride) {
    return NextResponse.json({ error: "Area Heads can only override into their area." }, { status: 403 });
  }

  const [existingRegistration, enrollmentCount] = await Promise.all([
    prisma.registration.findFirst({
      where: { camperId, sessionId: offering.sessionId, registrationWindow, period: offering.period, status: { in: activeRegistration } }
    }),
    prisma.registration.count({
      where: { offeringId, registrationWindow, status: { in: activeRegistration } }
    })
  ]);

  const result = validateRegistration({
    camper,
    offering,
    existingRegistration,
    enrollmentCount,
    override: wantsOverride && canOverride
  });

  if (!result.allowed) {
    return NextResponse.json({ ...result, error: result.errors[0] }, { status: 422 });
  }

  const registration = await prisma.registration.create({
    data: {
      camperId,
      offeringId,
      sessionId: offering.sessionId,
      menuId: offering.menuId,
      period: offering.period,
      registrationWindow,
      counselorApproval: counselorApproval || user.name,
      approvedByUserId: user.id,
      status: wantsOverride && canOverride ? RegistrationStatus.OVERRIDDEN : RegistrationStatus.ACTIVE,
      overrideReason: wantsOverride && canOverride ? "Manual capacity/special approval override." : null
    },
    include: {
      camper: { include: { cabin: true } },
      offering: { include: { activity: true, area: true } }
    }
  });

  return NextResponse.json({ registration, warnings: result.warnings });
}
