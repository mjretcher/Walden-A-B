import { UserRole } from "@prisma/client";
import { AppShellClient } from "@/components/app-shell-client";
import { getPendingSwitchCount } from "@/lib/switches";

/**
 * Server wrapper around the nav chrome. Fetches the pending-switch count
 * server-side (the chrome is a client component and can't query Prisma) and
 * passes it down so the Switches nav item can render its badge. Every page
 * already renders <AppShell user={user} />, so the badge is global with no
 * per-page changes.
 */
export async function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; areaId?: string | null; area?: { name: string } | null };
}) {
  const pendingSwitchCount = await getPendingSwitchCount(user);

  return (
    <AppShellClient user={user} pendingSwitchCount={pendingSwitchCount}>
      {children}
    </AppShellClient>
  );
}
