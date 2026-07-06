import { UserRole, Gender } from "@prisma/client";
import { AppShellClient } from "@/components/app-shell-client";
import { getPendingSwitchCount } from "@/lib/switches";
import { getPreScreamBadgeCount } from "@/lib/prescream";
import { getRosterReprintBadgeCount } from "@/lib/roster-reprint";
import { prisma } from "@/lib/prisma";

/**
 * Server wrapper around the nav chrome. Fetches the pending-switch count
 * server-side (the chrome is a client component and can't query Prisma) and
 * passes it down so the Switches nav item can render its badge. Every page
 * already renders <AppShell user={user} />, so the badge is global with no
 * per-page changes.
 *
 * Also fetches the active session's name/color so the whole app can show a
 * persistent, color-coded session identity — this is what keeps Q1 and Q2
 * edits from getting mixed up during the transition window.
 */
export async function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; areaId?: string | null; area?: { name: string } | null; bunkManagementView?: Gender | null };
}) {
  const [pendingSwitchCount, preScreamConflictCount, rosterReprintCount, activeSession] = await Promise.all([
    getPendingSwitchCount(user),
    getPreScreamBadgeCount(user),
    getRosterReprintBadgeCount(user),
    prisma.session.findFirst({ where: { active: true }, select: { name: true, cycle: true, color: true } })
  ]);

  return (
    <AppShellClient user={user} pendingSwitchCount={pendingSwitchCount} preScreamConflictCount={preScreamConflictCount} rosterReprintCount={rosterReprintCount} activeSession={activeSession}>
      {children}
    </AppShellClient>
  );
}
