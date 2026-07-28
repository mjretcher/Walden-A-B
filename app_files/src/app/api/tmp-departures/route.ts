// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, WeekBlock } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";

// TEMPORARY read-only diagnostic endpoint. Removed immediately after use.
const TOKEN = "wk56-departures-9f2c81";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ error: "no" }, { status: 403 });
  }

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true, startsAt: true, endsAt: true }
  });
  if (!session) return NextResponse.json({ error: "no active session" }, { status: 404 });

  const calendarDays = await prisma.sessionCalendarDay.findMany({
    where: { sessionId: session.id },
    orderBy: { date: "asc" }
  });

  // Campers whose LAST enrolled week block is not WK7 — same rule as
  // lib/week-enrollment.ts departureNote(). Campers with no week-enrollment
  // rows count as STAYING and are reported separately.
  const campers = await prisma.camper.findMany({
    where: {
      sessionId: session.id,
      active: true,
      weekEnrollments: { some: { sessionId: session.id } },
      NOT: { weekEnrollments: { some: { sessionId: session.id, weekBlock: WeekBlock.WK7 } } }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      gender: true,
      age: true,
      campGrade: true,
      unit: true,
      counselorAssistant: true,
      status: true,
      buddyNumber: true,
      cabin: { select: { name: true, unit: true } },
      weekEnrollments: {
        where: { sessionId: session.id },
        select: { weekBlock: true, cabinName: true }
      },
      registrations: {
        where: {
          sessionId: session.id,
          status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
        },
        select: {
          period: true,
          registrationWindow: true,
          registrationRole: true,
          offering: {
            select: {
              id: true,
              rosterLimit: true,
              notes: true,
              activity: { select: { name: true } },
              area: { select: { name: true } }
            }
          }
        }
      }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const noWeekData = await prisma.camper.count({
    where: { sessionId: session.id, active: true, weekEnrollments: { none: { sessionId: session.id } } }
  });

  const totalActive = await prisma.camper.count({ where: { sessionId: session.id, active: true } });

  // Staff departures are driven by employmentEnd (there is no staff
  // week-enrollment model). Return everyone active with an end date plus
  // their sessionAvailability label so the two-week group is identifiable.
  const staffRaw = await prisma.staff.findMany({
    where: { active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      age: true,
      position: true,
      position2: true,
      employmentStart: true,
      employmentEnd: true,
      sessionAvailability: true,
      screamEligible: true,
      keepDespiteCaMatch: true,
      housingLabel: true,
      cabin: { select: { name: true, unit: true } },
      primaryArea: { select: { name: true } },
      cabinStaffAssignments: {
        where: { sessionId: session.id },
        select: { cabin: { select: { name: true } } }
      },
      assignments: {
        where: { sessionId: session.id },
        select: {
          period: true,
          offering: {
            select: { activity: { select: { name: true } }, area: { select: { name: true } } }
          }
        }
      }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const caNames = await buildCaNameSet(session.id);
  const staff = staffRaw.filter((person) => !isCaStaffRecord(person, caNames));

  // Per-offering totals so departures can be shown as a fraction of the
  // current roster for each class.
  const offeringTotals = await prisma.registration.groupBy({
    by: ["offeringId"],
    where: {
      sessionId: session.id,
      registrationRole: RegistrationRole.CAMPER,
      status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
    },
    _count: { _all: true }
  });

  return NextResponse.json({
    session,
    calendarDays,
    totals: { totalActive, departing: campers.length, noWeekData },
    campers,
    staff,
    offeringTotals
  });
}
