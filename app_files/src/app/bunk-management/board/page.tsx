import { Gender, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cabinRoleSuffix, deriveCabinRoleLabel, isLifeguardStaff } from "@/lib/bunk-staff-tags";
import { computeLiveFingerprint } from "@/lib/live-fingerprint";
import { StaleDataBanner } from "@/components/live-refresh";
import { BunkBoardClient } from "./client";

export default async function BunkManagementBoardPage({
  searchParams
}: {
  searchParams?: Promise<{ gender?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const gender: Gender = params.gender === "FEMALE" ? Gender.FEMALE : Gender.MALE;

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true } });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Assignment Board" eyebrow="Bunk Management" description="No active session." backHref="/bunk-management" backLabel="Back to Bunk Management" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          There's no active session right now — set one active before assigning staff to cabins.
        </p>
      </AppShell>
    );
  }

  const [cabins, staffAssignments, allActiveStaff, preferences] = await Promise.all([
    prisma.cabin.findMany({
      where: { gender },
      orderBy: [{ unit: "asc" }, { name: "asc" }],
      include: {
        campers: {
          where: { sessionId: session.id, active: true },
          select: { id: true, firstName: true, lastName: true, counselorAssistant: true },
          orderBy: [{ counselorAssistant: "asc" }, { lastName: "asc" }]
        }
      }
    }),
    prisma.cabinStaffAssignment.findMany({
      where: { sessionId: session.id },
      select: { staffId: true, cabinId: true }
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        position2: true,
        statusCertification: true,
        certifications: { select: { name: true } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.staffUnitPreference.findMany({
      select: { staffId: true, unit: true, rank: true }
    })
  ]);

  const prefsByStaff = new Map<string, { unit: string; rank: number }[]>();
  for (const p of preferences) {
    if (!prefsByStaff.has(p.staffId)) prefsByStaff.set(p.staffId, []);
    prefsByStaff.get(p.staffId)!.push({ unit: p.unit, rank: p.rank });
  }

  const cabinRows = cabins.map((cabin) => ({
    id: cabin.id,
    name: cabin.name,
    unit: cabin.unit,
    beds: cabin.beds,
    campers: cabin.campers.filter((c) => !c.counselorAssistant).map((c) => `${c.firstName} ${c.lastName}`),
    cas: cabin.campers.filter((c) => c.counselorAssistant).map((c) => `${c.firstName} ${c.lastName}`)
  }));

  // Every active staff member appears exactly once, whether or not they're
  // currently assigned this session — the client derives the pool as
  // "everyone minus whoever has an assignment," rather than the server
  // pre-splitting them, so a drag-and-drop move can be reflected instantly
  // without needing fresh data from the server.
  //
  // roleLabel/roleSuffix and isLifeguard are both derived here from the
  // exact same live Staff fields the Staff Management screen edits --
  // never stored on the assignment, so they can never go stale.
  const staffRows = allActiveStaff.map((s) => {
    const roleLabel = deriveCabinRoleLabel(s.position, s.position2);
    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      roleLabel,
      roleSuffix: cabinRoleSuffix(roleLabel),
      isLifeguard: isLifeguardStaff(s),
      preferences: prefsByStaff.get(s.id) ?? []
    };
  });

  const assignmentRows = staffAssignments.map((a) => ({ staffId: a.staffId, cabinId: a.cabinId }));

  // Baseline for the multi-editor stale-data banner. Computed AFTER the
  // board data loads so it can never claim the page is fresher than the
  // data actually rendered.
  const liveFingerprint = await computeLiveFingerprint("bunk-board", session.id);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Assignment Board"
        eyebrow={`Bunk Management · ${session.cycle} ${session.year}`}
        description="Drag staff onto a cabin to assign them. Everyone appears exactly once across the whole board — assigning someone here removes them from the pool everywhere, so double-booking isn't possible."
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
      />
      <StaleDataBanner
        scope="bunk-board"
        sessionId={session.id}
        initialFingerprint={liveFingerprint}
        partIndexes={[1, 2]}
        message="Camper or cabin data just changed (not staff moves — those merge in live). Refresh to see the latest cabin rosters."
      />
      <BunkBoardClient sessionId={session.id} gender={gender} cabins={cabinRows} staff={staffRows} initialAssignments={assignmentRows} />
    </AppShell>
  );
}
