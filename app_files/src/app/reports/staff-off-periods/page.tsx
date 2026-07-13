import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS } from "@/lib/periods";
import { getSlotTimes, periodSlot } from "@/lib/period-times";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";
import { StaffOffPeriodsBoard, type StaffOffPeriodsPerson } from "./board";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Staff Off Periods" };

/**
 * A dedicated lens onto the existing StaffOffPeriod data (already captured
 * via the Scream Session board's "Off Period" option for each staff+period)
 * -- this page doesn't introduce a new way to mark someone off, it reuses
 * the exact same /api/staff-assignments endpoint Scream Session already
 * writes to. What's new is a focused view built specifically to answer
 * "who's off which period" without scrolling a full staffing grid, plus a
 * quick toggle for open (unassigned) periods right from this screen.
 *
 * Periods that already have a real activity assignment are shown read-only
 * here -- clearing a live Scream Session assignment stays a Scream Session
 * action, not something this page's quick-toggle should casually undo.
 */

export default async function StaffOffPeriodsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const canEdit = user.role === UserRole.EXECUTIVE_ADMIN;

  const [session, slotTimes] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    getSlotTimes()
  ]);

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Staff Off Periods" eyebrow="Reports" description="No active session." backHref="/reports" backLabel="Back to Reports" />
      </AppShell>
    );
  }

  const caNameSet = await buildCaNameSet(session.id);
  const staffRows = await prisma.staff.findMany({
    where: { active: true, screamEligible: true },
    include: {
      primaryArea: { select: { name: true } },
      assignments: { where: { sessionId: session.id }, include: { offering: { include: { activity: { select: { name: true } } } } } },
      offPeriods: { where: { sessionId: session.id } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const people: StaffOffPeriodsPerson[] = staffRows
    .filter((person) => !isCaStaffRecord(person, caNameSet))
    .map((person) => {
      const assignmentByPeriod: Record<string, string> = {};
      for (const assignment of person.assignments) {
        assignmentByPeriod[assignment.period] = assignment.offering.activity.name;
      }
      const offPeriodSet = new Set(person.offPeriods.map((entry) => entry.period));
      return {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        areaName: person.primaryArea?.name ?? null,
        periods: STAFF_PERIODS.map((period) => ({
          period,
          assignedActivity: assignmentByPeriod[period] ?? null,
          isOff: offPeriodSet.has(period)
        }))
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
        title="Staff Off Periods"
        eyebrow="Reports"
        description="Who's off which period, split by A-day and B-day. Toggle between a per-period list and a per-staff grid."
        backHref="/reports"
        backLabel="Back to Reports"
      />
      <StaffOffPeriodsBoard sessionName={session.name} people={people} periodMeta={periodMeta} canEdit={canEdit} />
    </AppShell>
  );
}
