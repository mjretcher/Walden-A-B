import { NextResponse } from "next/server";
import { RegistrationStatus, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function GET(request: Request) {
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });

  if (!session) {
    return NextResponse.json({ results: [] });
  }

  const [campers, staff] = await Promise.all([
    prisma.camper.findMany({
      where: {
        sessionId: session.id,
        active: true,
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { cabin: { name: { contains: query, mode: "insensitive" } } }
        ]
      },
      include: {
        cabin: true,
        registrations: {
          where: { status: { in: activeRegistration } },
          include: { offering: { include: { area: true, activity: true } } },
          orderBy: { period: "asc" }
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 8
    }),
    prisma.staff.findMany({
      where: {
        active: true,
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { primaryArea: { name: { contains: query, mode: "insensitive" } } },
          { housingLabel: { contains: query, mode: "insensitive" } },
          { cabin: { name: { contains: query, mode: "insensitive" } } }
        ]
      },
      include: { primaryArea: true, cabin: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 8
    })
  ]);

  const results = [
    ...campers.map((camper) => ({
      id: `camper-${camper.id}`,
      type: "Camper",
      title: `${camper.firstName} ${camper.lastName}`,
      subtitle: `${camper.cabin?.name ?? "No cabin"} · ${camper.unit} · ${camper.registrations.length} active registration${camper.registrations.length === 1 ? "" : "s"}`,
      href: `/admin/campers?q=${encodeURIComponent(`${camper.firstName} ${camper.lastName}`)}`,
      medicalFlag: Boolean(camper.medicalFlags?.trim()),
      schedule: camper.registrations.slice(0, 10).map((registration) => ({
        period: PERIOD_LABEL[registration.period],
        area: registration.offering.area.name,
        activity: registration.offering.activity.name,
        window: registration.registrationWindow
      }))
    })),
    ...staff.map((person) => ({
      id: `staff-${person.id}`,
      type: "Staff",
      title: `${person.firstName} ${person.lastName}`,
      subtitle: `${person.primaryArea?.name ?? "No primary area"} · ${person.housingLabel ?? person.cabin?.name ?? "No cabin"}`,
      href: `/admin/staff/${person.id}`
    }))
  ].slice(0, 10);

  return NextResponse.json({ results });
}
