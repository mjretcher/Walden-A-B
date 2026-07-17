import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Panel, SectionHeader, EmptyState } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OutOfCabinClient } from "./client";

/**
 * Pick which UNASSIGNED staff print under the OUT OF CABIN designation on
 * the bunk sheets (staff-only sheet, full cabin sheets, or both). Only
 * staff with no cabin assignment for the active session appear here — the
 * whole point of the designation is people who aren't in a cabin box, and
 * anyone who later gets a cabin drops out of the printed box automatically.
 */
export default async function OutOfCabinPage() {
  const user = await requireBunkManagementAccess("write");
  if (user.role !== UserRole.EXECUTIVE_ADMIN) {
    // requireBunkManagementAccess("write") already enforces this; the check
    // is belt-and-braces for future edits to that helper.
    return null;
  }

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true }
  });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Out of Cabin" eyebrow="Bunk Management" description="No active session." backHref="/bunk-management" backLabel="Back to Bunk Management" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  const [unassignedStaff, listings] = await Promise.all([
    prisma.staff.findMany({
      where: { active: true, cabinStaffAssignments: { none: { sessionId: session.id } } },
      select: { id: true, firstName: true, lastName: true, position: true, position2: true, housingLabel: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.outOfCabinListing.findMany({ where: { sessionId: session.id } })
  ]);

  const listingByStaff = new Map(listings.map((listing) => [listing.staffId, listing]));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Out of Cabin"
        eyebrow={`Bunk Management · ${session.cycle} ${session.year}`}
        description="Choose which unassigned staff print under the OUT OF CABIN designation on the bunk sheets — and which sheet(s) they show on. Anyone who later gets a cabin assignment drops off automatically."
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
      >
        <a className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black" href="/bunk-management/print-staff">Staff sheet</a>
        <a className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black" href="/bunk-management/print">Cabin sheets</a>
      </PageHeader>

      <Panel>
        <SectionHeader
          title={`Unassigned staff (${unassignedStaff.length})`}
          description={`${listings.length} currently selected to print. Toggles save instantly.`}
        />
        {unassignedStaff.length === 0 ? (
          <EmptyState title="Nobody is unassigned" body="Every active staff member has a cabin assignment for this session." />
        ) : (
          <OutOfCabinClient
            rows={unassignedStaff.map((staff) => {
              const listing = listingByStaff.get(staff.id);
              return {
                staffId: staff.id,
                name: `${staff.firstName} ${staff.lastName}`,
                position: [staff.position, staff.position2].filter(Boolean).join(" / ") || "—",
                housing: staff.housingLabel ?? "—",
                include: Boolean(listing),
                showOnStaffSheet: listing?.showOnStaffSheet ?? true,
                showOnCabinSheet: listing?.showOnCabinSheet ?? true,
                side: listing?.side ?? null
              };
            })}
          />
        )}
      </Panel>
    </AppShell>
  );
}
