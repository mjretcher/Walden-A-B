"use client";

import { useMemo, useState } from "react";

export type MissingReportRow = {
  key: string;
  outageId: string;
  outageTitle: string;
  reason: string;
  location: string | null;
  periodValue: string;
  periodLabel: string;
  area: string;
  activity: string;
  detail: string;
};

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
  const [sortByArea, setSortByArea] = useState(false);

  const sortedRows = useMemo(() => {
    if (!sortByArea) return rows;
    return [...rows].sort((a, b) => a.area.localeCompare(b.area) || a.outageTitle.localeCompare(b.outageTitle));
  }, [rows, sortByArea]);

  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-black text-forest-900">
          <svg className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
          Period {periodLabel} <span className="font-semibold text-slate-500">({rows.length})</span>
        </span>
        <button
          type="button"
          className="print:hidden rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-50"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSortByArea((prev) => !prev);
          }}
        >
          {sortByArea ? "Sorted by area ✓" : "Sort by area"}
        </button>
      </summary>
      <table className="w-full border-collapse border-t border-slate-200 text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border border-slate-300 p-2">Person / Trip</th>
            <th className="border border-slate-300 p-2">Reason</th>
            <th className="border border-slate-300 p-2">Location</th>
            <th className="border border-slate-300 p-2">Area</th>
            <th className="border border-slate-300 p-2">Class</th>
            <th className="border border-slate-300 p-2">Impact</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.key}>
              <td className="border border-slate-300 p-2 font-bold">{row.outageTitle}</td>
              <td className="border border-slate-300 p-2">{row.reason}</td>
              <td className="border border-slate-300 p-2">{row.location ?? "—"}</td>
              <td className="border border-slate-300 p-2">{row.area}</td>
              <td className="border border-slate-300 p-2">{row.activity}</td>
              <td className="border border-slate-300 p-2">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
