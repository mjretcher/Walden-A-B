import { NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UNIT_LABEL } from "@/lib/periods";
import { departureNote } from "@/lib/week-enrollment";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function GET(request: Request) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const { searchParams } = new URL(request.url);
  const offeringId = searchParams.get("offeringId")?.trim();
  if (!offeringId) return NextResponse.json({ error: "Missing offeringId." }, { status: 400 });

  const offering = await prisma.activityOffering.findUnique({ where: { id: offeringId }, select: { areaId: true } });
  if (!offering) return NextResponse.json({ error: "Offering not found." }, { status: 404 });

  // Area heads may only inspect rosters for offerings in their own area.
  if (user.role === UserRole.AREA_HEAD && user.areaId && offering.areaId !== user.areaId) {
    return NextResponse.json({ error: "You can only view rosters in your own area." }, { status: 403 });
  }

  const registrations = await prisma.registration.findMany({
    where: { offeringId, status: { in: activeRegistration }, registrationRole: RegistrationRole.CAMPER },
    include: { camper: { include: { cabin: true, weekEnrollments: true } } },
    orderBy: [{ camper: { lastName: "asc" } }, { camper: { firstName: "asc" } }]
  });

  const campers = registrations.map((registration) => ({
    id: registration.camper.id,
    name: `${registration.camper.firstName} ${registration.camper.lastName}`,
    cabinName: registration.camper.cabin?.name ?? null,
    unitLabel: UNIT_LABEL[registration.camper.unit],
    departureNote: departureNote(registration.camper.weekEnrollments)
  }));

  return NextResponse.json({ count: campers.length, campers });
}
