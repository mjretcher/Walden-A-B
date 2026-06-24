import { NextResponse } from "next/server";
import { OutageStatus, RegistrationStatus, UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

function abbreviate(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 5);
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
        },
        outages: {
          where: { status: OutageStatus.ACTIVE, startDate: { lte: today }, endDate: { gte: today } },
          select: { reason: true },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 6
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
      include: {
        primaryArea: true,
        cabin: true,
        assignments: {
          where: { sessionId: session.id },
          include: { offering: { include: { activity: true } } }
        },
        offPeriods: {
          where: { sessionId: session.id },
          select: { period: true }
        },
        outages: {
          where: { status: OutageStatus.ACTIVE, startDate: { lte: today }, endDate: { gte: today } },
          select: { reason: true },
          take: 1
        }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 4
    })
  ]);

  const results = [
    ...campers.map((camper) => {
      const byPeriod = new Map(camper.registrations.map((r) => [PERIOD_LABEL[r.period], r.offering.activity.name]));
      return {
        id: `camper-${camper.id}`,
        type: "Camper" as const,
        title: `${camper.firstName} ${camper.lastName}`,
        camperId: camper.id,
        cabin: camper.cabin?.name ?? null,
        unit: camper.unit,
        swimLevel: camper.swimLevel,
        medicalFlag: Boolean(camper.medicalFlags?.trim()),
        outageReason: camper.outages[0]?.reason ?? null,
        scheduleByPeriod: Object.fromEntries(byPeriod),
        registrationCount: camper.registrations.length
      };
    }),
    ...staff.map((person) => {
      const assignmentMap = new Map(
        person.assignments.map((a) => [
          PERIOD_LABEL[a.period],
          { full: a.offering.activity.name, abv: abbreviate(a.offering.activity.name) }
        ])
      );
      const offPeriodSet = new Set(person.offPeriods.map((op) => PERIOD_LABEL[op.period]));
      const periodCells = STAFF_PERIODS.map((p) => {
        const label = PERIOD_LABEL[p];
        const assignment = assignmentMap.get(label);
        const isOff = offPeriodSet.has(label);
        return {
          period: label,
          state: assignment ? "assigned" : isOff ? "off" : "empty",
          full: assignment?.full ?? null,
          abv: assignment?.abv ?? null
        };
      });
      return {
        id: `staff-${person.id}`,
        type: "Staff" as const,
        title: `${person.firstName} ${person.lastName}`,
        staffId: person.id,
        housing: person.housingLabel ?? person.cabin?.name ?? null,
        primaryArea: person.primaryArea?.name ?? null,
        outageReason: person.outages[0]?.reason ?? null,
        periodCells
      };
    })
  ];

  return NextResponse.json({ results });
}
