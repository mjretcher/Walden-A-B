import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS } from "@/lib/periods";
import { getSlotTimes, periodSlot } from "@/lib/period-times";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";
import { StaffWorkingPeriodsBoard, type StaffWorkingPeriodsPerson } from "./board";

export const metadata: Metadata = { title: "Staff Working Periods" };

/**
 * The mirror image of Staff Off Periods: same by-period / by-staff toggle,
 * same A-day/B-day grouping, but built to answer "who's working" instead
 * of "who's off." Reads the same StaffAssignment data Staff A/B Schedule
 * already shows, just laid out with the by-period card view Off Periods
 * has and Staff A/B Schedule doesn't.
 *
 * Purely a viewer -- unlike Off Periods (a boolean, safe to toggle from
 * here), assigning someone to work a period means picking a specific
 * offering, which stays a Scream Session action. No editing lives here.
 */
export default async function StaffWorkingPeriodsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);

  const [session, slotTimes] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    getSlotTimes()
  ]);

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Staff Working Periods" eyebrow="Reports" description="No active session." backHref="/reports" backLabel="Back to Reports" />
      </AppShell>
    );
  }

  const caNameSet = await buildCaNameSet(session.id);
  const staffRows = await prisma.staff.findMany({
    where: { active: true, screamEligible: true },
    include: {
      primaryArea: { select: { name: true } },
      assignments: {
        where: { sessionId: session.id },
        include: { offering: { include: { activity: { select: { name: true } }, area: { select: { name: true } } } } }
      },
      offPeriods: { where: { sessionId: session.id } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const people: StaffWorkingPeriodsPerson[] = staffRows
    .filter((person) => !isCaStaffRecord(person, caNameSet))
    .map((person) => {
      const assignmentByPeriod = new Map<string, { activity: string; area: string }>();
      for (const assignment of person.assignments) {
        assignmentByPeriod.set(assignment.period, { activity: assignment.offering.activity.name, area: assignment.offering.area.name });
      }
      const offPeriodSet = new Set(person.offPeriods.map((entry) => entry.period));
      return {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        areaName: person.primaryArea?.name ?? null,
        periods: STAFF_PERIODS.map((period) => {
          const assignment = assignmentByPeriod.get(period);
          return {
            period,
            activityLabel: assignment ? `${assignment.area} · ${assignment.activity}` : null,
            isOff: offPeriodSet.has(period)
          };
        })
      };
    });

  const periodMeta = STAFF_PERIODS.map((period) => ({
    period,
    label: PERIOD_LABEL[period],
    timeLabel: slotTimes[periodSlot(period)]?.label ?? "",
    isTwilight: TWILIGHT_PERIODS.includes(period)
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff Working Periods"
        eyebrow="Reports"
        description="Who's actually working which period, split by A-day and B-day. Toggle between a per-period list and a per-staff grid."
        backHref="/reports"
        backLabel="Back to Reports"
      >
        <a className={secondaryButtonClass} href="/scream-session">Open Scream Session</a>
      </PageHeader>
      <StaffWorkingPeriodsBoard sessionName={session.name} people={people} periodMeta={periodMeta} />
    </AppShell>
  );
}
