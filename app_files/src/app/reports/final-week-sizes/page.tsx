// @ts-nocheck
import { Period, RegistrationRole, RegistrationStatus, RegistrationWindow, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatGeneratedAt } from "@/lib/camp-time";
import { PERIOD_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import {
  inferCurrentRegistrationWindow,
  parseRegistrationWindow,
  REGISTRATION_WINDOW_DESCRIPTION,
  REGISTRATION_WINDOW_LABEL
} from "@/lib/registration-windows";

/**
 * FINAL WEEK CLASS SIZES.
 *
 * Every class roster size twice: what it is RIGHT NOW, and what it will be
 * once the campers who are only here for the first two weeks of the session
 * go home. The gap between those two numbers is the whole point -- it's what
 * says which classes survive the mid-session exodus intact and which ones
 * collapse to two kids and need to be merged, re-staffed, or cut.
 *
 * "Stays through the final week" uses the SAME rule as the roster print's
 * camperLeaveLabel() and lib/week-enrollment.ts departureNote(): a camper
 * stays when their LAST enrolled week block is Wk 7. A camper with no
 * week-enrollment rows at all counts as STAYING -- missing data must never
 * be silently reported as a departure and quietly shrink a class. Those
 * campers are counted separately and surfaced on screen so the assumption
 * is visible instead of buried.
 *
 * The class set mirrors the Class Fill board exactly: camper-registerable
 * offerings only, no Twilight (5A/5B), no staff-only rosterLimit 0 rows,
 * active area + active activity. Counts are CAMPER-role ACTIVE/OVERRIDDEN
 * registrations in the chosen window, so departed campers (whose
 * registrations are flipped to REMOVED) are already out of both numbers.
 */
type FinalWeekSearchParams = {
  window?: string | string[];
  period?: string | string[];
  area?: string | string[];
  shrinking?: string | string[];
};

/** Rosters at or below this after departures get flagged as needing a look. */
const LOW_FILL_THRESHOLD = 4;

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function FinalWeekSizesPage({ searchParams }: { searchParams?: Promise<FinalWeekSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true }
  });
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));
  const selectedPeriod = asArray(params.period)[0] ?? "all";
  const selectedArea = asArray(params.area)[0] ?? "all";
  const shrinkingOnly = asArray(params.shrinking)[0] === "1";

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader
          title="Final Week Class Sizes"
          eyebrow="Reports"
          description="No active session."
          backHref="/reports"
          backLabel="Back to Reports"
        />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  // The one definition of "still here for the last week", shared by the class
  // counts and the camper headline so they can never disagree.
  const staysThroughFinalWeek = {
    OR: [
      { weekEnrollments: { some: { sessionId: session.id, weekBlock: WeekBlock.WK7 } } },
      { weekEnrollments: { none: { sessionId: session.id } } }
    ]
  };

  const baseRegistrationWhere = {
    sessionId: session.id,
    registrationWindow,
    registrationRole: RegistrationRole.CAMPER,
    status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
  };

  const [offerings, nowRows, finalRows, campersTotal, campersStaying, campersNoWeekData] = await Promise.all([
    prisma.activityOffering.findMany({
      where: {
        sessionId: session.id,
        active: true,
        visibleForCamperRegistration: true,
        period: { notIn: [Period.P5A, Period.P5B] },
        // Staff-only offerings (rosterLimit 0) are excluded, but this CANNOT
        // be written as `NOT: { rosterLimit: 0 }`. rosterLimit is nullable,
        // and in SQL `NULL = 0` evaluates to NULL, so `NOT (NULL)` is NULL
        // too -- which silently dropped every offering with NO roster limit
        // set. That hid 11 live classes (all 8 Riding periods, Fit Walk 2A/2B,
        // Run Fit 4A) carrying 59 real registrations. The explicit OR
        // readmits nulls while still excluding genuine 0s.
        OR: [{ rosterLimit: null }, { rosterLimit: { not: 0 } }],
        area: { active: true },
        activity: { active: true }
      },
      select: {
        id: true,
        period: true,
        rosterLimit: true,
        activity: { select: { name: true } },
        area: { select: { name: true } }
      },
      orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
    }),
    prisma.registration.groupBy({ by: ["offeringId"], where: baseRegistrationWhere, _count: { _all: true } }),
    prisma.registration.groupBy({
      by: ["offeringId"],
      where: { ...baseRegistrationWhere, camper: staysThroughFinalWeek },
      _count: { _all: true }
    }),
    prisma.camper.count({ where: { sessionId: session.id, active: true } }),
    prisma.camper.count({ where: { sessionId: session.id, active: true, ...staysThroughFinalWeek } }),
    prisma.camper.count({
      where: { sessionId: session.id, active: true, weekEnrollments: { none: { sessionId: session.id } } }
    })
  ]);

  const nowByOffering = new Map(nowRows.map((row) => [row.offeringId, row._count._all]));
  const finalByOffering = new Map(finalRows.map((row) => [row.offeringId, row._count._all]));

  const rows = offerings.map((offering) => {
    const now = nowByOffering.get(offering.id) ?? 0;
    const final = finalByOffering.get(offering.id) ?? 0;
    return {
      id: offering.id,
      periodLabel: PERIOD_LABEL[offering.period],
      area: offering.area.name,
      activity: offering.activity.name,
      now,
      final,
      leaving: now - final,
      limit: offering.rosterLimit
    };
  });

  const periods = Array.from(new Set(rows.map((row) => row.periodLabel)));
  const areas = Array.from(new Set(rows.map((row) => row.area))).sort();

  const visible = rows.filter(
    (row) =>
      (selectedPeriod === "all" || row.periodLabel === selectedPeriod) &&
      (selectedArea === "all" || row.area === selectedArea) &&
      (!shrinkingOnly || row.leaving > 0)
  );

  const totalNow = visible.reduce((sum, row) => sum + row.now, 0);
  const totalFinal = visible.reduce((sum, row) => sum + row.final, 0);
  const emptyAfter = visible.filter((row) => row.now > 0 && row.final === 0).length;
  const lowAfter = visible.filter((row) => row.final > 0 && row.final <= LOW_FILL_THRESHOLD).length;
  const campersLeaving = campersTotal - campersStaying;
  const hasFilters = selectedPeriod !== "all" || selectedArea !== "all" || shrinkingOnly;

  const chipClass = (active: boolean, tone: "forest" | "lake") =>
    active
      ? `rounded-lg px-2.5 py-1 text-xs font-black text-white ${tone === "forest" ? "bg-forest-700" : "bg-lake-700"}`
      : "rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-700";

  // Chip links carry every filter that wasn't clicked. null clears one.
  function filterHref(change: { period?: string | null; area?: string | null; shrinking?: boolean }) {
    const nextPeriod = "period" in change ? change.period : selectedPeriod === "all" ? null : selectedPeriod;
    const nextArea = "area" in change ? change.area : selectedArea === "all" ? null : selectedArea;
    const nextShrinking = "shrinking" in change ? change.shrinking : shrinkingOnly;
    const query = new URLSearchParams();
    query.set("window", registrationWindow);
    if (nextPeriod) query.set("period", nextPeriod);
    if (nextArea) query.set("area", nextArea);
    if (nextShrinking) query.set("shrinking", "1");
    return `/reports/final-week-sizes?${query.toString()}`;
  }

  const printPeriods = Array.from(new Set(visible.map((row) => row.periodLabel)));

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Final Week Class Sizes"
          eyebrow="Reports"
          description={`Every class twice: the size now, and the size after the ${REGISTRATION_WINDOW_LABEL[registrationWindow]} two-week campers go home. Same class set as the Class Fill board.`}
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <a className={secondaryButtonClass} href={`/class-fill?window=${registrationWindow}`}>Class Fill board</a>
          <PrintButton label="Print / Save PDF" pageOrientation="portrait" />
        </PageHeader>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Campers now</p>
            <p className="text-2xl font-black text-forest-900">{campersTotal}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Going home</p>
            <p className="text-2xl font-black text-red-700">{campersLeaving}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Staying through Wk 7</p>
            <p className="text-2xl font-black text-lake-800">{campersStaying}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Seats now → Wk 7</p>
            <p className="text-2xl font-black text-forest-900">
              {totalNow} <span className="text-slate-400">→</span> {totalFinal}
            </p>
          </div>
        </div>

        {campersNoWeekData > 0 ? (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            {campersNoWeekData} camper{campersNoWeekData === 1 ? " has" : "s have"} no week-enrollment data and {campersNoWeekData === 1 ? "is" : "are"} counted as
            STAYING through Wk 7. If that&apos;s wrong, the Wk 7 numbers below are high by up to {campersNoWeekData}.
          </div>
        ) : null}

        <AutoSubmitForm className="mb-5 rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="window" defaultValue={registrationWindow}>
              {(Object.values(RegistrationWindow) as string[]).map((w) => (
                <option key={w} value={w}>
                  {REGISTRATION_WINDOW_LABEL[w as RegistrationWindow]} — {REGISTRATION_WINDOW_DESCRIPTION[w as RegistrationWindow]}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-black text-forest-900">
                {visible.length} class{visible.length !== 1 ? "es" : ""}
              </span>
              {emptyAfter > 0 ? (
                <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">{emptyAfter} empty after</span>
              ) : null}
              {lowAfter > 0 ? (
                <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{lowAfter} at {LOW_FILL_THRESHOLD} or under</span>
              ) : null}
              {hasFilters ? <a className={secondaryButtonClass} href="/reports/final-week-sizes">Reset</a> : null}
            </div>
          </div>
          {selectedPeriod !== "all" ? <input type="hidden" name="period" value={selectedPeriod} /> : null}
          {selectedArea !== "all" ? <input type="hidden" name="area" value={selectedArea} /> : null}
          {shrinkingOnly ? <input type="hidden" name="shrinking" value="1" /> : null}
        </AutoSubmitForm>

        <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-panel">
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
            <a className={chipClass(selectedPeriod === "all", "forest")} href={filterHref({ period: null })}>All periods</a>
            {periods.map((period) => (
              <a className={chipClass(selectedPeriod === period, "forest")} key={period} href={filterHref({ period })}>{period}</a>
            ))}
          </div>
          {areas.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-5 py-3">
              <a className={chipClass(selectedArea === "all", "lake")} href={filterHref({ area: null })}>All areas</a>
              {areas.map((area) => (
                <a className={chipClass(selectedArea === area, "lake")} key={area} href={filterHref({ area })}>{area}</a>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-5 py-3">
            <a className={chipClass(!shrinkingOnly, "forest")} href={filterHref({ shrinking: false })}>All classes</a>
            <a className={chipClass(shrinkingOnly, "forest")} href={filterHref({ shrinking: true })}>Only classes that lose campers</a>
          </div>
        </div>
      </div>

      <section className="final-week-sheet rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
        <header className="final-week-sheet-header mb-4 border-b border-slate-200 pb-3">
          <p className="text-xs font-black uppercase tracking-wide text-lake-800">
            {session.name} · {REGISTRATION_WINDOW_LABEL[registrationWindow]} · Class sizes after the two-week campers go home
          </p>
          <h2 className="text-xl font-black text-forest-900">Final Week Class Sizes</h2>
          <p className="text-xs font-semibold text-slate-500">
            {campersLeaving} of {campersTotal} campers leave · {campersStaying} stay through Wk 7 · Generated {formatGeneratedAt()}
            {selectedPeriod !== "all" ? ` · Period ${selectedPeriod}` : ""}
            {selectedArea !== "all" ? ` · ${selectedArea}` : ""}
            {shrinkingOnly ? " · shrinking classes only" : ""}
          </p>
        </header>

        {!visible.length ? (
          <p className="text-sm font-bold text-slate-500">No classes match these filters.</p>
        ) : (
          printPeriods.map((period) => {
            const periodRows = visible.filter((row) => row.periodLabel === period);
            const periodNow = periodRows.reduce((sum, row) => sum + row.now, 0);
            const periodFinal = periodRows.reduce((sum, row) => sum + row.final, 0);
            return (
              <div className="final-week-period mb-5" key={period}>
                <div className="mb-1.5 flex items-baseline gap-2 border-b border-slate-200 pb-1">
                  <h3 className="text-sm font-black uppercase tracking-wide text-lake-800">Period {period}</h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {periodRows.length} classes · {periodNow} now → {periodFinal} in Wk 7
                  </span>
                </div>
                <table className="final-week-table w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      <th className="py-1">Class</th>
                      <th className="py-1">Area</th>
                      <th className="py-1 text-right">Now</th>
                      <th className="py-1 text-right">Going home</th>
                      <th className="py-1 text-right">Wk 7</th>
                      <th className="py-1 text-right">Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodRows.map((row) => {
                      const empties = row.now > 0 && row.final === 0;
                      const low = row.final > 0 && row.final <= LOW_FILL_THRESHOLD;
                      const toneClass = empties ? "final-week-row-empty" : low ? "final-week-row-low" : "";
                      return (
                        <tr className={`border-b border-slate-100 ${toneClass}`} key={row.id}>
                          <td className="py-1 font-bold text-forest-900">{row.activity}</td>
                          <td className="py-1 text-slate-500">{row.area}</td>
                          <td className="py-1 text-right font-semibold tabular-nums">{row.now}</td>
                          <td className="py-1 text-right font-semibold tabular-nums text-red-700">
                            {row.leaving > 0 ? `−${row.leaving}` : "—"}
                          </td>
                          <td className="py-1 text-right text-base font-black tabular-nums text-forest-900">{row.final}</td>
                          <td className="py-1 text-right text-slate-400 tabular-nums">{row.limit ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}

        <p className="final-week-footnote mt-4 border-t border-slate-200 pt-2 text-[11px] font-semibold text-slate-400">
          &quot;Wk 7&quot; counts campers whose last enrolled week block is Wk 7. Campers with no week-enrollment data are counted as staying
          {campersNoWeekData > 0 ? ` (${campersNoWeekData} of them)` : ""}. Shaded rows end at {LOW_FILL_THRESHOLD} or fewer campers.
        </p>
      </section>
    </AppShell>
  );
}
