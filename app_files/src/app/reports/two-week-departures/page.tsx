// @ts-nocheck
import { Gender, Period, RegistrationRole, RegistrationStatus, Unit, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatGeneratedAt } from "@/lib/camp-time";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { camperPrintName } from "@/lib/camper-name";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";

/**
 * TWO-WEEK DEPARTURES.
 *
 * Who is actually going home at the two-week mark, where they bunk, and
 * which classes they come out of. The companion to Final Week Class Sizes:
 * that report answers "how big will each class be after the exodus"; this
 * one answers "who exactly is leaving, and out of what" — the list you
 * carry around on departure day and the list an area head needs to know
 * which of their rosters is about to lose half its kids and by name.
 *
 * "Going home" uses the SAME rule as lib/week-enrollment.ts departureNote()
 * and the roster print's camperLeaveLabel(): a camper leaves when their LAST
 * enrolled week block is not the final week (Wk 7). A camper with NO
 * week-enrollment rows counts as STAYING — missing data must never be
 * reported as a departure and put a kid on a going-home list who isn't.
 * Those campers are counted and surfaced rather than silently folded in.
 *
 * Staff have no week-enrollment model; their departure is whatever sits in
 * employmentEnd. Any active staffer whose end date falls before the final
 * week begins is listed, and staff with no end date at all are counted in
 * the caveat line, because an unset date is indistinguishable from "here to
 * the end" in the data and shouldn't quietly read as the latter.
 */
type SearchParams = { view?: string | string[] };

/** Rosters at or below this after departures get flagged. */
const LOW_FILL_THRESHOLD = 4;

const CAMPER_PERIOD_ORDER: Period[] = [
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A,
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B
];

function first(value?: string | string[]) {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/** Staff have no camperPrintName equivalent; same nickname-wins convention. */
function staffName(person: { firstName: string; lastName: string; nickname?: string | null }) {
  return `${person.nickname?.trim() || person.firstName} ${person.lastName}`;
}

function shortDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(value);
}

export default async function TwoWeekDeparturesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const view = first(params.view) === "class" ? "class" : "cabin";

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true, startsAt: true, endsAt: true }
  });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader
          title="Two-Week Departures"
          eyebrow="Reports"
          description="No active session."
          backHref="/reports"
          backLabel="Back to Reports"
        />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  // Leaves when the last enrolled week block isn't Wk 7. Campers with no
  // week rows at all are excluded here and counted separately below.
  const leavesAtTwoWeeks = {
    sessionId: session.id,
    active: true,
    weekEnrollments: { some: { sessionId: session.id } },
    NOT: { weekEnrollments: { some: { sessionId: session.id, weekBlock: WeekBlock.WK7 } } }
  };

  // The two-week mark: 14 days after the session opens. Campers' departures
  // come from week-enrollment rows, but staff have no such model -- their only
  // departure signal is employmentEnd, a raw date -- so the two sides need a
  // date boundary to be compared on the same footing.
  const finalWeekStart = session.startsAt ? new Date(session.startsAt.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

  const activeCamperRegistration = {
    sessionId: session.id,
    registrationRole: RegistrationRole.CAMPER,
    status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
  };

  const [campers, totalActive, noWeekData, offeringTotals, staffLeaving, staffNoEndDate, staffLeavingMidFinalWeek] =
    await Promise.all([
      prisma.camper.findMany({
        where: leavesAtTwoWeeks,
        select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            gender: true,
            age: true,
            campGrade: true,
            unit: true,
            counselorAssistant: true,
            buddyNumber: true,
            cabin: { select: { id: true, name: true, unit: true, gender: true, sortOrder: true } },
            registrations: {
              where: {
                status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] },
                registrationRole: RegistrationRole.CAMPER
              },
              select: {
                period: true,
                offering: {
                  select: {
                    id: true,
                    rosterLimit: true,
                    activity: { select: { name: true } },
                    area: { select: { name: true } }
                  }
                }
              }
            }
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      }),
      prisma.camper.count({ where: { sessionId: session.id, active: true } }),
      prisma.camper.count({
        where: { sessionId: session.id, active: true, weekEnrollments: { none: { sessionId: session.id } } }
      }),
      prisma.registration.groupBy({ by: ["offeringId"], where: activeCamperRegistration, _count: { _all: true } }),
      prisma.staff.findMany({
        where: {
            active: true,
            employmentEnd: { not: null, lt: finalWeekStart ?? session.endsAt ?? undefined }
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            position: true,
            position2: true,
            employmentEnd: true,
            sessionAvailability: true,
            housingLabel: true,
            cabin: { select: { name: true } },
            primaryArea: { select: { name: true } },
            cabinStaffAssignments: { where: { sessionId: session.id }, select: { cabin: { select: { name: true } } } }
        },
        orderBy: [{ employmentEnd: "asc" }, { lastName: "asc" }]
      }),
      prisma.staff.count({ where: { active: true, employmentEnd: null } }),
      // Anyone whose end date lands between the two-week mark and the close of
      // camp: not a two-week departure, but close enough that lumping them in
      // with "here to the end" would hide a real gap in the final week.
      finalWeekStart && session.endsAt
        ? prisma.staff.count({
              where: { active: true, employmentEnd: { gte: finalWeekStart, lt: session.endsAt } }
            })
        : Promise.resolve(0)
    ]);

  const totalByOffering = new Map(offeringTotals.map((row) => [row.offeringId, row._count._all]));

  // ---- Cabin view ----------------------------------------------------
  type BucketCabin = { id: string; name: string; unit: string; gender: string; sortOrder: number | null };
  const cabinBuckets = new Map<string, { cabin: BucketCabin | null; campers: typeof campers }>();
  for (const camper of campers) {
    const key = camper.cabin?.id ?? "__none";
    if (!cabinBuckets.has(key)) cabinBuckets.set(key, { cabin: camper.cabin, campers: [] });
    cabinBuckets.get(key)!.campers.push(camper);
  }

  const placed = Array.from(cabinBuckets.values())
    .filter((bucket) => bucket.cabin)
    .map((bucket) => ({ ...bucket, name: bucket.cabin!.name, sortOrder: bucket.cabin!.sortOrder }));
  const unplaced = cabinBuckets.get("__none")?.campers ?? [];

  // Bunk-sheet order: unit, then gender, then the hand/age ordering from
  // lib/cabin-print-order — the same nesting every other cabin-ordered
  // surface uses, NOT a flat alphabetical sort. sortCabinsForPrint's
  // per-unit overrides only resolve when it's handed one unit+gender group
  // at a time, so the grouping isn't cosmetic.
  const cabinGroups: typeof placed = [];
  for (const unit of Object.values(Unit) as Unit[]) {
    for (const gender of Object.values(Gender) as Gender[]) {
      const group = placed.filter((bucket) => bucket.cabin!.unit === unit && bucket.cabin!.gender === gender);
      if (!group.length) continue;
      cabinGroups.push(...sortCabinsForPrint(group, gender, unit));
    }
  }

  // ---- Class view ----------------------------------------------------
  type ClassRow = {
    offeringId: string;
    period: Period;
    activity: string;
    area: string;
    limit: number | null;
    leaving: { id: string; name: string; cabinName: string }[];
  };
  const classMap = new Map<string, ClassRow>();
  for (const camper of campers) {
    for (const registration of camper.registrations) {
      const offering = registration.offering;
      if (!classMap.has(offering.id)) {
        classMap.set(offering.id, {
          offeringId: offering.id,
          period: registration.period,
          activity: offering.activity.name,
          area: offering.area.name,
          limit: offering.rosterLimit,
          leaving: []
        });
      }
      classMap.get(offering.id)!.leaving.push({
        id: camper.id,
        name: camperPrintName(camper),
        cabinName: camper.cabin?.name ?? "—"
      });
    }
  }

  const classRows = Array.from(classMap.values()).map((row) => {
    const now = totalByOffering.get(row.offeringId) ?? 0;
    return { ...row, now, after: now - row.leaving.length };
  });

  const classByPeriod = CAMPER_PERIOD_ORDER.map((period) => ({
    period,
    rows: classRows
      .filter((row) => row.period === period)
      .sort((a, b) => b.leaving.length - a.leaving.length || a.activity.localeCompare(b.activity))
  })).filter((group) => group.rows.length > 0);

  const emptyAfter = classRows.filter((row) => row.now > 0 && row.after === 0);
  const lowAfter = classRows.filter((row) => row.after > 0 && row.after <= LOW_FILL_THRESHOLD);
  const caCount = campers.filter((camper) => camper.counselorAssistant).length;
  const noSchedule = campers.filter((camper) => camper.registrations.length === 0);

  const tabClass = (active: boolean) =>
    active
      ? "rounded-lg bg-forest-700 px-3 py-1.5 text-sm font-black text-white"
      : "rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700";

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Two-Week Departures"
          eyebrow="Reports"
          description={`Who goes home at the two-week mark of ${session.name}, where they bunk, and which classes they come out of.`}
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <a className={secondaryButtonClass} href="/reports/final-week-sizes">Final Week Class Sizes</a>
          <PrintButton label="Print / Save PDF" pageOrientation="portrait" />
        </PageHeader>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Campers going home</p>
            <p className="text-2xl font-black text-red-700">{campers.length}</p>
            <p className="text-xs font-bold text-slate-500">of {totalActive} active</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cabins affected</p>
            <p className="text-2xl font-black text-forest-900">{cabinGroups.length}</p>
            {caCount > 0 ? <p className="text-xs font-bold text-slate-500">plus {caCount} CA{caCount === 1 ? "" : "s"}</p> : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Classes losing campers</p>
            <p className="text-2xl font-black text-forest-900">{classRows.length}</p>
            <p className="text-xs font-bold text-slate-500">
              {emptyAfter.length} empty after · {lowAfter.length} at {LOW_FILL_THRESHOLD} or under
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Staff leaving early</p>
            <p className="text-2xl font-black text-lake-800">{staffLeaving.length}</p>
            <p className="text-xs font-bold text-slate-500">{staffNoEndDate} with no end date set</p>
          </div>
        </div>

        {noWeekData > 0 ? (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {noWeekData} camper{noWeekData === 1 ? " has" : "s have"} no week-enrollment data and {noWeekData === 1 ? "is" : "are"} treated as STAYING, so
            {noWeekData === 1 ? " it" : " they"} won&apos;t appear below. If any of them are actually leaving, this list is short by up to {noWeekData}.
          </div>
        ) : null}

        {noSchedule.length > 0 ? (
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
            {noSchedule.length} departing camper{noSchedule.length === 1 ? " has" : "s have"} no class registrations and so appear{noSchedule.length === 1 ? "s" : ""} in the
            cabin list but in no class below: {noSchedule.map((camper) => camperPrintName(camper)).join(", ")}.
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-panel">
          <a className={tabClass(view === "cabin")} href="/reports/two-week-departures">By cabin</a>
          <a className={tabClass(view === "class")} href="/reports/two-week-departures?view=class">By class</a>
          <span className="ml-auto text-sm font-black text-forest-900">
            {view === "cabin" ? `${campers.length} campers` : `${classRows.length} classes`}
          </span>
        </div>
      </div>

      <div className="dep-sheet">
        <header className="dep-sheet-header mb-3">
          <h2 className="text-xl font-black text-forest-900">
            Two-Week Departures — {view === "cabin" ? "By Cabin" : "By Class"}
          </h2>
          <p className="text-xs font-bold text-slate-500">
            {session.name} · {session.year} · {campers.length} campers going home
            {finalWeekStart ? ` · final week begins ${shortDate(finalWeekStart)}` : ""} · Generated {formatGeneratedAt(new Date())}
          </p>
        </header>

        {view === "cabin" ? (
          <div className="space-y-4">
            {cabinGroups.map((group) => (
              <section className="dep-block rounded-xl border border-slate-200 bg-white shadow-panel" key={group.cabin!.id}>
                <div className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2">
                  <h3 className="text-base font-black text-forest-900">{group.cabin!.name}</h3>
                  <span className="text-xs font-bold text-slate-500">{UNIT_LABEL[group.cabin!.unit]}</span>
                  <span className="ml-auto rounded-lg bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
                    {group.campers.length} leaving
                  </span>
                </div>
                <table className="dep-table w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-1.5">Camper</th>
                      <th className="px-2 py-1.5">Grade</th>
                      {CAMPER_PERIOD_ORDER.map((period) => (
                        <th className="px-2 py-1.5" key={period}>{PERIOD_LABEL[period]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.campers.map((camper) => {
                      const byPeriod = new Map(camper.registrations.map((r) => [r.period, r.offering.activity.name]));
                      return (
                        <tr className="border-t border-slate-100" key={camper.id}>
                          <td className="px-4 py-1.5 font-bold text-forest-900">
                            {camperPrintName(camper)}
                            {camper.counselorAssistant ? <span className="ml-1 text-xs font-black text-lake-700">CA</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">{camper.campGrade ?? "—"}</td>
                          {CAMPER_PERIOD_ORDER.map((period) => (
                            <td className="px-2 py-1.5 text-slate-700" key={period}>{byPeriod.get(period) ?? "—"}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}

            {unplaced.length > 0 ? (
              <section className="dep-block rounded-xl border border-slate-200 bg-white shadow-panel">
                <div className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2">
                  <h3 className="text-base font-black text-forest-900">No cabin assigned</h3>
                  <span className="ml-auto rounded-lg bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">{unplaced.length} leaving</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {unplaced.map((camper) => (
                    <li className="px-4 py-1.5 text-sm font-bold text-forest-900" key={camper.id}>
                      {camperPrintName(camper)}
                      {camper.counselorAssistant ? <span className="ml-1 text-xs font-black text-lake-700">CA</span> : null}
                      <span className="ml-2 text-xs font-bold text-slate-500">{UNIT_LABEL[camper.unit]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {classByPeriod.map((group) => (
              <section className="dep-block rounded-xl border border-slate-200 bg-white shadow-panel" key={group.period}>
                <div className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2">
                  <h3 className="text-base font-black text-forest-900">Period {PERIOD_LABEL[group.period]}</h3>
                  <span className="ml-auto text-xs font-bold text-slate-500">{group.rows.length} classes affected</span>
                </div>
                <table className="dep-table w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-1.5">Class</th>
                      <th className="px-2 py-1.5">Area</th>
                      <th className="px-2 py-1.5 text-center">Now</th>
                      <th className="px-2 py-1.5 text-center">After</th>
                      <th className="px-4 py-1.5">Campers leaving this class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr className="border-t border-slate-100" key={row.offeringId}>
                        <td className="px-4 py-1.5 font-bold text-forest-900">{row.activity}</td>
                        <td className="px-2 py-1.5 text-slate-600">{row.area}</td>
                        <td className="px-2 py-1.5 text-center font-bold text-slate-700">{row.now}</td>
                        <td
                          className={`px-2 py-1.5 text-center font-black ${
                            row.after === 0 ? "text-red-700" : row.after <= LOW_FILL_THRESHOLD ? "text-amber-700" : "text-forest-900"
                          }`}
                        >
                          {row.after}
                        </td>
                        <td className="px-4 py-1.5 text-slate-700">
                          {row.leaving.map((person) => `${person.name} (${person.cabinName})`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}

        <section className="dep-block mt-4 rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2">
            <h3 className="text-base font-black text-forest-900">Staff leaving at or before the two-week mark</h3>
            <span className="ml-auto text-xs font-bold text-slate-500">by departure date</span>
          </div>
          {staffLeaving.length === 0 ? (
            <p className="px-4 py-3 text-sm font-bold text-slate-600">
              No active staff have a departure date at or before the two-week mark. Worth knowing how that number is arrived at: staff
              have no week-enrollment records, so the only departure signal is the Departure date field on the staff record — and
              {" "}{staffNoEndDate} active staff have none set at all. An empty date reads the same as &ldquo;here to the end,&rdquo; so
              if a counselor is going home at two weeks, that has to be entered before it can show up here.
            </p>
          ) : (
            <table className="dep-table w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-1.5">Staff</th>
                  <th className="px-2 py-1.5">Position</th>
                  <th className="px-2 py-1.5">Cabin / housing</th>
                  <th className="px-2 py-1.5">Area</th>
                  <th className="px-4 py-1.5">Leaves</th>
                </tr>
              </thead>
              <tbody>
                {staffLeaving.map((person) => {
                  const cabinName =
                    person.cabinStaffAssignments[0]?.cabin.name ?? person.cabin?.name ?? person.housingLabel ?? "—";
                  return (
                    <tr className="border-t border-slate-100" key={person.id}>
                      <td className="px-4 py-1.5 font-bold text-forest-900">{staffName(person)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{person.position ?? person.position2 ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{cabinName}</td>
                      <td className="px-2 py-1.5 text-slate-600">{person.primaryArea?.name ?? "—"}</td>
                      <td className="px-4 py-1.5 font-bold text-slate-700">{shortDate(person.employmentEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {staffNoEndDate > 0 || staffLeavingMidFinalWeek > 0 ? (
            <p className="border-t border-slate-100 px-4 py-2 text-xs font-bold text-slate-500">
              {staffNoEndDate > 0
                ? `${staffNoEndDate} active staff have no departure date set and are treated as staying to the end. `
                : ""}
              {staffLeavingMidFinalWeek > 0
                ? `${staffLeavingMidFinalWeek} more leave during the final week rather than at the two-week mark.`
                : ""}
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
