import { NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentEventGuest } from "@/lib/event-auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { parseRegistrationWindow } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Any logged-in role may read a camper's schedule (previous behavior),
  // and so may a Registration Day event guest — their window is forced to
  // the event's window, ignoring the query param, so the mess-hall screen
  // can only ever show/act on the window being registered.
  const user = await getCurrentUser();
  const guestCtx = user ? null : await getCurrentEventGuest();
  if (!user && !guestCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const registrationWindow = guestCtx ? guestCtx.event.registrationWindow : parseRegistrationWindow(searchParams.get("window"));

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
