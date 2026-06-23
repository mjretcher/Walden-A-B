import { NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { parseRegistrationWindow } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const registrationWindow = parseRegistrationWindow(searchParams.get("window"));

  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) {
    return NextResponse.json({ registrations: [] });
  }

  const registrations = await prisma.registration.findMany({
    where: {
      camperId: id,
      sessionId: session.id,
      registrationWindow,
      status: { in: activeRegistration }
    },
    include: {
      offering: { include: { area: true, activity: true } }
    },
    orderBy: { period: "asc" }
  });

  return NextResponse.json({
    registrations: registrations.map((registration) => ({
      id: registration.id,
      period: PERIOD_LABEL[registration.period],
      activity: registration.offering.activity.name,
      area: registration.offering.area.name,
      role: registration.registrationRole,
      approval: registration.counselorApproval ?? "",
      isTeachingAssistant: registration.registrationRole === RegistrationRole.TEACHING_ASSISTANT
    }))
  });
}
