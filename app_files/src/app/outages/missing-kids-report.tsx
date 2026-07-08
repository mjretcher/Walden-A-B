"use client";

import { useMemo, useState } from "react";

export type MissingReportRow = {
  key: string;
  outageId: string;
  // Raw trip name (Outage.manualTitle), not a computed fallback -- only
  // shown when the person actually named the trip, so a solo infirmary
  // visit (no title) doesn't echo the person's own name back at them.
  tripTitle: string | null;
  reason: string;
  location: string | null;
  periodValue: string;
  periodLabel: string;
  area: string;
  activity: string;
  personName: string;
  personKind: "camper" | "staff";
};

function ChevronIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

export function MissingKidsReport({ rows, periodOrder }: { rows: MissingReportRow[]; periodOrder: string[] }) {
  const groups = useMemo(() => {
    const byPeriod = new Map<string, MissingReportRow[]>();
    for (const row of rows) {
      const list = byPeriod.get(row.periodValue) ?? [];
      list.push(row);
      byPeriod.set(row.periodValue, list);
    }
    return periodOrder.filter((period) => byPeriod.has(period)).map((period) => ({ period, rows: byPeriod.get(period)! }));
  }, [rows, periodOrder]);

  if (!groups.length) {
    return <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-sm font-semibold text-slate-500">No matching outage impacts for this date and area.</p>;
  }

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <PeriodGroup key={group.period} periodLabel={group.rows[0]?.periodLabel ?? group.period} rows={group.rows} />
      ))}
    </div>
  );
}

function PeriodGroup({ periodLabel, rows }: { periodLabel: string; rows: MissingReportRow[] }) {
  const [sortAlpha, setSortAlpha] = useState(true);

  // Group by area, then by class within each area, so the area/class
  // context is stated once instead of repeating on every person's row.
  const areaGroups = useMemo(() => {
    const byArea = new Map<string, MissingReportRow[]>();
    for (const row of rows) {
      const list = byArea.get(row.area) ?? [];
      list.push(row);
      byArea.set(row.area, list);
    }
    const areas = Array.from(byArea.keys());
    if (sortAlpha) areas.sort((a, b) => a.localeCompare(b));
    return areas.map((area) => ({ area, rows: byArea.get(area)! }));
  }, [rows, sortAlpha]);

  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-black text-forest-900">
          <ChevronIcon />
          Period {periodLabel} <span className="font-semibold text-slate-500">({rows.length})</span>
        </span>
        <button
          type="button"
          className="print:hidden rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-50"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSortAlpha((prev) => !prev);
          }}
        >
          {sortAlpha ? "Sorted by area A→Z ✓" : "Sort by area A→Z"}
        </button>
      </summary>
      <div className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-3">
        {areaGroups.map(({ area, rows: areaRows }) => (
          <AreaCard key={area} area={area} rows={areaRows} />
        ))}
      </div>
    </details>
  );
}

function AreaCard({ area, rows }: { area: string; rows: MissingReportRow[] }) {
  const classGroups = useMemo(() => {
    const byClass = new Map<string, MissingReportRow[]>();
    for (const row of rows) {
      const list = byClass.get(row.activity) ?? [];
      list.push(row);
      byClass.set(row.activity, list);
    }
    return Array.from(byClass.entries()).map(([activity, classRows]) => ({ activity, rows: classRows }));
  }, [rows]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="font-black text-forest-900">
        {area} <span className="font-semibold text-slate-500">({rows.length})</span>
      </p>
      <div className="mt-2 grid gap-2">
        {classGroups.map(({ activity, rows: classRows }) => (
          <ClassBlock key={activity} activity={activity} rows={classRows} />
        ))}
      </div>
    </div>
  );
}

function ClassBlock({ activity, rows }: { activity: string; rows: MissingReportRow[] }) {
  // Within this class, combine everyone missing for the same reason/trip
  // into one line rather than one row per person -- a five-camper trip
  // shows up as one line with five names, not five repeated rows.
  const byOutage = useMemo(() => {
    const map = new Map<string, { reason: string; tripTitle: string | null; location: string | null; camperNames: string[]; staffNames: string[] }>();
    for (const row of rows) {
      const entry = map.get(row.outageId) ?? { reason: row.reason, tripTitle: row.tripTitle, location: row.location, camperNames: [], staffNames: [] };
      if (row.personKind === "staff") entry.staffNames.push(row.personName);
      else entry.camperNames.push(row.personName);
      map.set(row.outageId, entry);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="rounded-md bg-white p-2 text-sm shadow-sm">
      <p className="font-bold text-slate-800">{activity}</p>
      <div className="mt-1 grid gap-1">
        {byOutage.map((entry, index) => (
          <p key={index} className="leading-snug text-slate-600">
            <span className="font-semibold text-forest-800">
              {entry.reason}
              {entry.tripTitle ? ` • ${entry.tripTitle}` : ""}
            </span>
            {entry.location ? <span className="text-slate-500"> ({entry.location})</span> : null}
            {entry.camperNames.length ? <>: {entry.camperNames.join(", ")}</> : null}
            {entry.staffNames.length ? (
              <span className="text-amber-700">
                {entry.camperNames.length ? " — " : ": "}
                Coverage needed: {entry.staffNames.join(", ")}
              </span>
            ) : null}
          </p>
        ))}
      </div>
    </div>
  );
}
