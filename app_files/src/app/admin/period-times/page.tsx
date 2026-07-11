import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSlotTimes, minutesToInputValue, SLOT_NUMBERS } from "@/lib/period-times";
import { PeriodTimesForm } from "./client";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Period Times" };

/**
 * Edit screen for the daily bell schedule. The times here feed the period
 * pills and auto-detection on Right Now, and the period labels on Trip
 * Planner. One set of times for both A and B days.
 */
export default async function PeriodTimesPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const slotTimes = await getSlotTimes();

  const slots = SLOT_NUMBERS.map((slot) => ({
    slot,
    startValue: minutesToInputValue(slotTimes[slot].start),
    endValue: minutesToInputValue(slotTimes[slot].end),
    label: slotTimes[slot].label
  }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Period Times"
        eyebrow="Admin"
        description="Set when each class period starts and ends. These times drive Right Now's auto-detection and every period time label."
      />
      <PeriodTimesForm slots={slots} />
    </AppShell>
  );
}
