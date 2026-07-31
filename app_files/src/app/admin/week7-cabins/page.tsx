// @ts-nocheck
import { Gender, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countUnstampedWeekRows, findClosingCabins, groupByCabin, resolveWeekCabins } from "@/lib/week-cabin";
import { Week7CabinsClient } from "./client";

const FINAL_WEEK = WeekBlock.WK7;
const PRIOR_WEEK = WeekBlock.WK5_6;

export default async function Week7CabinsPage({
  searchParams
}: {
  searchParams?: Promise<{ gender?: string; sessionId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const gender: Gender = params.gender === "FEMALE" ? Gender.FEMALE : Gender.MALE;

  const session = params.sessionId
    ? await prisma.session.findUnique({ where: { id: params.sessionId }, select: { id: true, name: true, cycle: true, year: true } })
    : await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true } });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Week 7 Cabins" eyebrow="Final-week bunk changes" backHref="/bunk-management" backLabel="Bunk Management" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          There&rsquo;s no active session right now — set one active first.
        </p>
      </AppShell>
    );
  }

  const [cabins, finalMaps, priorMaps, unstamped] = await Promise.all([
    prisma.cabin.findMany({
      where: { gender },
      select: { id: true, name: true, unit: true, beds: true, sortOrder: true }
    }),
    resolveWeekCabins(session.id, FINAL_WEEK),
    resolveWeekCabins(session.id, PRIOR_WEEK),
    countUnstampedWeekRows(session.id, FINAL_WEEK)
  ]);

  const cabinIds = new Set(cabins.map((c) => c.id));
  const finalOccupancy = groupByCabin(finalMaps);
  const closingCabinIds = findClosingCabins(priorMaps, finalMaps);

  // Only people who land in a cabin on THIS side of camp. Staff aren't
  // gendered records, so their side is inferred from the cabin they're in.
  const camperIds = [...finalMaps.camperCabin.entries()]
    .filter(([, cabinId]) => cabinId && cabinIds.has(cabinId))
    .map(([camperId]) => camperId);
  const staffIds = [...finalMaps.staffCabin.entries()]
    .filter(([, cabinId]) => cabinId && cabinIds.has(cabinId))
    .map(([staffId]) => staffId);

  const [campers, staff, priorCamperCount] = await Promise.all([
    prisma.camper.findMany({
      where: { id: { in: camperIds } },
      select: { id: true, firstName: true, lastName: true, nickname: true, counselorAssistant: true },
      orderBy: [{ counselorAssistant: "asc" }, { lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, firstName: true, lastName: true, position: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    Promise.resolve(
      [...priorMaps.camperCabin.values()].filter((cabinId) => cabinId && cabinIds.has(cabinId)).length
    )
  ]);

  const camperById = new Map(campers.map((c) => [c.id, c]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  // Plain unit -> manual sortOrder -> name ordering. Deliberately not
  // sortCabinsForPrint(), which sorts within a single unit for paper
  // sheets; this screen is one scrollable list across all four units.
  const ordered = [...cabins].sort((a, b) => {
    if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const cabinRows = ordered.map((cabin) => {
    const occupancy = finalOccupancy.get(cabin.id);
    const cabinCampers = (occupancy?.camperIds ?? [])
      .map((id) => camperById.get(id))
      .filter(Boolean)
      .map((c) => ({
        id: c.id,
        name: `${c.nickname || c.firstName} ${c.lastName}`,
        isCa: c.counselorAssistant
      }));
    const cabinStaff = (occupancy?.staffIds ?? [])
      .map((id) => staffById.get(id))
      .filter(Boolean)
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        position: s.position ?? null,
        overridden: true
      }));

    return {
      id: cabin.id,
      name: cabin.name,
      unit: cabin.unit,
      beds: cabin.beds,
      closing: closingCabinIds.has(cabin.id),
      campers: cabinCampers,
      staff: cabinStaff
    };
  });

  const finalCamperCount = camperIds.length;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Week 7 Cabins"
        eyebrow={`${session.name} — ${session.cycle} ${session.year}`}
        description="Final-week bunk placement, layered on top of the session. Registrations and classes are untouched."
        backHref="/bunk-management"
        backLabel="Bunk Management"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <span className="font-black text-slate-600">Side:</span>
        {[Gender.MALE, Gender.FEMALE].map((g) => (
          <a
            key={g}
            href={`/admin/week7-cabins?gender=${g}&sessionId=${session.id}`}
            className={`rounded-md border px-3 py-1.5 text-xs font-black ${
              gender === g ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {g === Gender.MALE ? "Boys" : "Girls"}
          </a>
        ))}
        <span className="ml-auto text-xs font-bold text-slate-500">
          {priorCamperCount} campers in Weeks 5&ndash;6 &rarr; {finalCamperCount} in Week 7
        </span>
      </div>

      <Week7CabinsClient
        sessionId={session.id}
        weekBlock={FINAL_WEEK}
        unstamped={unstamped}
        cabins={cabinRows}
        allCabins={ordered.map((c) => ({ id: c.id, name: c.name, unit: c.unit }))}
      />
    </AppShell>
  );
}
