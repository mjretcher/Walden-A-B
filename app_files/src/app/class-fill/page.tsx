// @ts-nocheck
import { Period, RegistrationRole, RegistrationStatus, RegistrationWindow, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { FillCard } from "@/components/class-fill-card";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PERIOD_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import {
  inferCurrentRegistrationWindow,
  parseRegistrationWindow,
  REGISTRATION_WINDOW_DESCRIPTION,
  REGISTRATION_WINDOW_LABEL
} from "@/lib/registration-windows";

/**
 * Standalone Class Fill board — the concise "how full is everything" list
 * that previously existed ONLY inside the Registration Day live dashboard,
 * which unmounts the moment the event is closed. Same query shape and same
 * FillCard tile; the difference is this page is always available and reads
 * the current numbers on load instead of polling an open event.
 */
type ClassFillSearchParams = {
  window?: string | string[];
  period?: string | string[];
  area?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function ClassFillPage({ searchParams }: { searchParams?: Promise<ClassFillSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const session = await prisma.session.findFirst({ where: { active: true } });
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));
  const selectedPeriod = asArray(params.period)[0] ?? "all";
  const selectedArea = asArray(params.area)[0] ?? "all";

  // Mirrors /api/event/live exactly: camper-registerable classes only, no
  // Twilight, no staff-only (rosterLimit 0) offerings, and the count is
  // CAMPER-role ACTIVE/OVERRIDDEN registrations in the chosen window.
  const offerings = session
    ? await prisma.activityOffering.findMany({
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
        include: {
          activity: { select: { name: true } },
          area: { select: { name: true } },
          _count: {
            select: {
              registrations: {
                where: {
                  registrationWindow,
                  registrationRole: RegistrationRole.CAMPER,
                  status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] }
                }
              }
            }
          }
        },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];

  const rows = offerings.map((offering) => ({
    id: offering.id,
    period: PERIOD_LABEL[offering.period],
    activity: offering.activity.name,
    area: offering.area.name,
    count: offering._count.registrations,
    limit: offering.rosterLimit
  }));

  const periods = Array.from(new Set(rows.map((row) => row.period)));
  const areas = Array.from(new Set(rows.map((row) => row.area))).sort();

  const visible = rows.filter(
    (row) => (selectedPeriod === "all" || row.period === selectedPeriod) && (selectedArea === "all" || row.area === selectedArea)
  );

  const totalSignedUp = visible.reduce((sum, row) => sum + row.count, 0);
  const fullCount = visible.filter((row) => row.limit != null && row.count >= row.limit).length;
  const hasFilters = selectedPeriod !== "all" || selectedArea !== "all";

  const chipClass = (active: boolean, tone: "forest" | "lake") =>
    active
      ? `rounded-lg px-2.5 py-1 text-xs font-black text-white ${tone === "forest" ? "bg-forest-700" : "bg-lake-700"}`
      : "rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-700";

  // Build a chip link that keeps the window plus whichever filter wasn't
  // clicked. null clears that filter ("All").
  function filterHref(change: { period?: string | null; area?: string | null }) {
    const nextPeriod = "period" in change ? change.period : selectedPeriod === "all" ? null : selectedPeriod;
    const nextArea = "area" in change ? change.area : selectedArea === "all" ? null : selectedArea;
    const query = new URLSearchParams();
    query.set("window", registrationWindow);
    if (nextPeriod) query.set("period", nextPeriod);
    if (nextArea) query.set("area", nextArea);
    return `/class-fill?${query.toString()}`;
  }

  return (
    <AppShell user={user}>
      <PageHeader title="Class Fill" eyebrow={session ? `${session.name} — how full every class is right now` : "No active session"} />

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
              {visible.length} class{visible.length !== 1 ? "es" : ""} · {totalSignedUp} signed up
            </span>
            {fullCount > 0 ? <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">{fullCount} full</span> : null}
            {hasFilters ? <a className={secondaryButtonClass} href="/class-fill">Reset</a> : null}
          </div>
        </div>
        {/* Preserve the chip filters when the window select re-submits. */}
        {selectedPeriod !== "all" ? <input type="hidden" name="period" value={selectedPeriod} /> : null}
        {selectedArea !== "all" ? <input type="hidden" name="area" value={selectedArea} /> : null}
      </AutoSubmitForm>

      {/* Chips are links, not submit buttons: they carry the OTHER filter
          through in the querystring without fighting the form's own fields. */}
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
      </div>

      {!session ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session.</p>
      ) : !visible.length ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
          No classes match these filters.
        </p>
      ) : selectedArea === "all" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
          {areas.map((area) => {
            const areaOfferings = visible.filter((row) => row.area === area);
            if (!areaOfferings.length) return null;
            const areaTotal = areaOfferings.reduce((sum, row) => sum + row.count, 0);
            return (
              <div key={area}>
                <div className="mb-1.5 flex items-baseline gap-2 border-b border-slate-200 pb-1">
                  <h4 className="text-xs font-black uppercase tracking-wide text-lake-800">{area}</h4>
                  <span className="text-[11px] font-semibold text-slate-400">{areaOfferings.length} classes · {areaTotal} signed up</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {areaOfferings.map((row) => <FillCard key={row.id} offering={row} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-panel sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => <FillCard key={row.id} offering={row} />)}
        </div>
      )}
    </AppShell>
  );
}
