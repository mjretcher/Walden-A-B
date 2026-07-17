import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { buildStaffOffPeriodsData } from "@/lib/staff-off-periods-report";
import { StaffOffPeriodsBoard } from "./board";

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
 *
 * Data shaping lives in @/lib/staff-off-periods-report, shared with the
 * Excel/Word export route at /api/exports/staff-off-periods.
 */

export default async function StaffOffPeriodsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const canEdit = user.role === UserRole.EXECUTIVE_ADMIN;
  // Export API allows Exec Admin + Area Head, so only show download buttons
  // to roles the route will actually accept.
  const canExport = user.role === UserRole.EXECUTIVE_ADMIN || user.role === UserRole.AREA_HEAD;

  const data = await buildStaffOffPeriodsData();

  if (!data) {
    return (
      <AppShell user={user}>
        <PageHeader title="Staff Off Periods" eyebrow="Reports" description="No active session." backHref="/reports" backLabel="Back to Reports" />
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff Off Periods"
        eyebrow="Reports"
        description="Who's off which period, split by A-day and B-day. Toggle between a per-period list and a per-staff grid."
        backHref="/reports"
        backLabel="Back to Reports"
      />
      <StaffOffPeriodsBoard sessionName={data.sessionName} people={data.people} periodMeta={data.periodMeta} canEdit={canEdit} canExport={canExport} />
    </AppShell>
  );
}
