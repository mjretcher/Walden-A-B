"use server";

import { RegistrationStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

// Exact strings written ONLY by the two switch-approval paths in
// src/app/switches/actions.ts. Used to scope this repair to switch-created
// registrations and nothing else.
const SWITCH_REASONS = ["Approved switch workflow.", "Immediate approval via switch wizard."];

export type SwitchWindowFix = {
  registrationId: string;
  camperName: string;
  period: string;
  activityName: string;
  currentWindow: string;
  correctWindow: string;
};

/**
 * Finds switch-created registrations whose registrationWindow doesn't match
 * the registration the switch replaced.
 *
 * Background: both switch-approval paths used to omit registrationWindow on
 * create, so it fell through to the schema default (Q1). A Q3 switch then
 * wrote a Q3-invisible registration — the old class was marked REMOVED and
 * the replacement sat in Q1 — which is why the period printed blank on cards
 * (cards filter registrations by window). The create sites are fixed; this
 * repairs rows written before that fix.
 *
 * Evidence used, rather than guessing at "wrong-looking" windows: the switch
 * marks the registration it replaces as REMOVED for the same camper + session
 * + period. That REMOVED row carries the window the switch actually belonged
 * to, so it's the authority. A switch legitimately made during Q1 has a
 * matching Q1 predecessor and is correctly left alone.
 */
export async function findSwitchWindowMismatches(): Promise<SwitchWindowFix[]> {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  if (!session) return [];

  const switchRegistrations = await prisma.registration.findMany({
    where: {
      sessionId: session.id,
      status: { in: activeRegistration },
      overrideReason: { in: SWITCH_REASONS }
    },
    select: {
      id: true,
      camperId: true,
      period: true,
      registrationWindow: true,
      camper: { select: { firstName: true, lastName: true } },
      offering: { select: { activity: { select: { name: true } } } }
    }
  });
  if (!switchRegistrations.length) return [];

  // The rows each switch superseded, in one query rather than per-registration.
  const replaced = await prisma.registration.findMany({
    where: {
      sessionId: session.id,
      status: RegistrationStatus.REMOVED,
      camperId: { in: Array.from(new Set(switchRegistrations.map((r) => r.camperId))) }
    },
    select: { camperId: true, period: true, registrationWindow: true }
  });

  const replacedByKey = new Map<string, string>();
  for (const row of replaced) {
    replacedByKey.set(`${row.camperId}:${row.period}`, row.registrationWindow);
  }

  const fixes: SwitchWindowFix[] = [];
  for (const registration of switchRegistrations) {
    const correct = replacedByKey.get(`${registration.camperId}:${registration.period}`);
    // No predecessor found → no evidence of the intended window, so leave it
    // alone rather than guess.
    if (!correct || correct === registration.registrationWindow) continue;
    fixes.push({
      registrationId: registration.id,
      camperName: `${registration.camper.firstName} ${registration.camper.lastName}`,
      period: registration.period,
      activityName: registration.offering.activity.name,
      currentWindow: registration.registrationWindow,
      correctWindow: correct
    });
  }
  return fixes;
}

/**
 * Applies the repair above. Deliberately re-derives the fix list server-side
 * instead of trusting ids posted from the page, so a stale form can't rewrite
 * rows that no longer qualify.
 */
export async function repairSwitchWindows() {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const fixes = await findSwitchWindowMismatches();

  // Grouped by target window so this is a couple of updateManys rather than
  // one round-trip per registration.
  const byWindow = new Map<string, string[]>();
  for (const fix of fixes) {
    const list = byWindow.get(fix.correctWindow) ?? [];
    list.push(fix.registrationId);
    byWindow.set(fix.correctWindow, list);
  }

  await prisma.$transaction(
    Array.from(byWindow.entries()).map(([window, ids]) =>
      prisma.registration.updateMany({
        where: { id: { in: ids } },
        data: { registrationWindow: window as never }
      })
    )
  );

  revalidatePath("/admin/switch-window-repair");
  revalidatePath("/cards");
  revalidatePath("/rosters");
}
