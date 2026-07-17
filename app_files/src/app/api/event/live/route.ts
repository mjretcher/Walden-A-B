import { NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN, RegistrationStatus.WAITLISTED];

/**
 * Live dashboard payload for the Registration Day admin panel, polled every
 * few seconds during the event: who's joined (and who's gone quiet), the
 * most recent registrations camp-wide, and per-offering fill. Exec-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.registrationEvent.findFirst({
    where: { active: true },
    include: { guests: { orderBy: { joinedAt: "asc" } } }
  });
  if (!event) return NextResponse.json({ event: null });

  const [recent, offerings] = await Promise.all([
    prisma.registration.findMany({
      where: {
        sessionId: event.sessionId,
        registrationWindow: event.registrationWindow,
        status: { in: activeRegistration }
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        camper: { select: { firstName: true, lastName: true } },
        offering: { include: { activity: { select: { name: true } }, area: { select: { name: true } } } },
        eventGuest: { select: { name: true } }
      }
    }),
    prisma.activityOffering.findMany({
      where: {
        sessionId: event.sessionId,
        active: true,
        visibleForCamperRegistration: true,
        area: { active: true },
        activity: { active: true }
      },
      include: {
        activity: { select: { name: true } },
        area: { select: { name: true } },
        _count: {
          select: {
            registrations: {
              where: {
                registrationWindow: event.registrationWindow,
                registrationRole: RegistrationRole.CAMPER,
                status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
              }
            }
          }
        }
      },
      orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
    })
  ]);

  const now = Date.now();
  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      code: event.code,
      registrationWindow: event.registrationWindow,
      createdAt: event.createdAt
    },
    guests: event.guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      joinedAt: guest.joinedAt,
      lastSeenAt: guest.lastSeenAt,
      // "online" = seen within the last 2 minutes (lastSeen bumps are
      // throttled to 30s server-side, so 2m tolerates a quiet-but-open tab).
      online: now - guest.lastSeenAt.getTime() < 2 * 60_000
    })),
    recent: recent.map((registration) => ({
      id: registration.id,
      camper: `${registration.camper.firstName} ${registration.camper.lastName}`,
      activity: registration.offering.activity.name,
      area: registration.offering.area.name,
      period: PERIOD_LABEL[registration.period],
      status: registration.status,
      overridden: registration.status === RegistrationStatus.OVERRIDDEN,
      by: registration.eventGuest?.name ?? registration.counselorApproval ?? "—",
      at: registration.createdAt
    })),
    offerings: offerings.map((offering) => ({
      id: offering.id,
      period: PERIOD_LABEL[offering.period],
      activity: offering.activity.name,
      area: offering.area.name,
      count: offering._count.registrations,
      limit: offering.rosterLimit
    }))
  });
}
