// @ts-nocheck
// TEMPORARY read-only verification endpoint — removed immediately after use.
// Runs the exact query shapes /reports/final-week-sizes depends on so a bad
// Prisma filter surfaces here instead of in Mike's face on the report page.
import { NextResponse } from "next/server";
import { Period, RegistrationRole, RegistrationStatus, WeekBlock } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inferCurrentRegistrationWindow } from "@/lib/registration-windows";

export const dynamic = "force-dynamic";

const TOKEN = "wk7-check-9182";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== TOKEN) return NextResponse.json({ error: "nope" }, { status: 404 });

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true }
  });
  if (!session) return NextResponse.json({ error: "no active session" }, { status: 404 });

  const registrationWindow = inferCurrentRegistrationWindow(session);

  const staysThroughFinalWeek = {
    OR: [
      { weekEnrollments: { some: { sessionId: session.id, weekBlock: WeekBlock.WK7 } } },
      { weekEnrollments: { none: { sessionId: session.id } } }
    ]
  };

  const baseRegistrationWhere = {
    sessionId: session.id,
    registrationWindow,
    registrationRole: RegistrationRole.CAMPER,
    status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
  };

  const [offeringCount, nowRows, finalRows, campersTotal, campersStaying, campersNoWeekData] = await Promise.all([
    prisma.activityOffering.count({
      where: {
        sessionId: session.id,
        active: true,
        visibleForCamperRegistration: true,
        period: { notIn: [Period.P5A, Period.P5B] },
        NOT: { rosterLimit: 0 },
        area: { active: true },
        activity: { active: true }
      }
    }),
    prisma.registration.groupBy({ by: ["offeringId"], where: baseRegistrationWhere, _count: { _all: true } }),
    prisma.registration.groupBy({
      by: ["offeringId"],
      where: { ...baseRegistrationWhere, camper: staysThroughFinalWeek },
      _count: { _all: true }
    }),
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.camper.count({ where: { sessionId: session.id, active: true, ...staysThroughFinalWeek } }),
    prisma.camper.count({
      where: { sessionId: session.id, active: true, weekEnrollments: { none: { sessionId: session.id } } }
    })
  ]);

  const now = nowRows.reduce((sum, row) => sum + row._count._all, 0);
  const final = finalRows.reduce((sum, row) => sum + row._count._all, 0);

  const weekBlockSpread = await prisma.camperWeekEnrollment.groupBy({
    by: ["weekBlock"],
    where: { sessionId: session.id },
    _count: { _all: true }
  });

  return NextResponse.json({
    session: session.name,
    registrationWindow,
    offeringCount,
    offeringsWithRegistrations: nowRows.length,
    seatsNow: now,
    seatsFinalWeek: final,
    campersTotal,
    campersStaying,
    campersLeaving: campersTotal - campersStaying,
    campersNoWeekData,
    weekBlockSpread: weekBlockSpread.map((row) => ({ weekBlock: row.weekBlock, campers: row._count._all }))
  });
}
