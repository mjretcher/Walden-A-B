import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffHousingClient } from "./client";
import { ensureDefaultHousingLocations } from "./actions";

export default async function StaffHousingPage() {
  const user = await requireBunkManagementAccess("write");

  await ensureDefaultHousingLocations();

  const [locations, staff] = await Promise.all([
    prisma.housingLocation.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        rooms: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: { staff: { select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } }
        },
        // Includes ALL staff with housingLocationId = this location, whether
        // they're attached directly or via one of the rooms above -- filtered
        // down to "direct" (housingRoomId null) below.
        staff: { select: { id: true, firstName: true, lastName: true, housingRoomId: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }
      }
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, housingLabel: true, housingLocationId: true, housingRoomId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);

  const locationData = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    rooms: loc.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      bedCount: room.bedCount,
      staff: room.staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))
    })),
    directStaff: loc.staff.filter((s) => !s.housingRoomId).map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))
  }));

  const unassigned = staff
    .filter((s) => !s.housingLocationId)
    .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, housingLabel: s.housingLabel }));

  const legacyUnmigratedCount = staff.filter((s) => !s.housingLocationId && s.housingLabel).length;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff Housing"
        eyebrow="Bunk Management"
        description="Non-cabin staff housing only — Nurse Cabin, Staff House, and similar. Real cabin/bunk assignment happens on the Assignment Board; this screen never touches that."
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
      />
      <StaffHousingClient
        locations={locationData}
        unassigned={unassigned}
        legacyUnmigratedCount={legacyUnmigratedCount}
      />
    </AppShell>
  );
}
