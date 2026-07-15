"use client";

import { useState } from "react";
import { PrintButton } from "@/components/print-button";

export type StaffWorkingPeriodsPerson = {
  id: string;
  name: string;
  areaName: string | null;
  cabinName: string | null;
  periods: { period: string; activityLabel: string | null; isOff: boolean }[];
};

type PeriodMeta = { period: string; label: string; timeLabel: string; isTwilight: boolean };

const A_DAY = new Set(["P1A", "P2A", "P3A", "P4A", "P5A"]);

function dayOf(period: string): "A" | "B" {
  return A_DAY.has(period) ? "A" : "B";
}

export function StaffWorkingPeriodsBoard({
  sessionName,
  people,
  periodMeta
}: {
  sessionName: string;
  people: StaffWorkingPeriodsPerson[];
  periodMeta: PeriodMeta[];
}) {
  const [view, setView] = useState<"period" | "staff">("period");
  const [showCabins, setShowCabins] = useState(false);

  const aPeriods = periodMeta.filter((p) => dayOf(p.period) === "A");
  const bPeriods = periodMeta.filter((p) => dayOf(p.period) === "B");

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-black ${view === "period" ? "bg-forest-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setView("period")}
            >
              By period
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-black ${view === "staff" ? "bg-forest-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setView("staff")}
            >
              By staff
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
            <input checked={showCabins} className="h-4 w-4" onChange={(event) => setShowCabins(event.target.checked)} type="checkbox" />
            Show cabin numbers
          </label>
        </div>
        <PrintButton label="Print both views" />
      </div>

      {/* On-screen view -- only the selected mode renders. */}
      <div className="no-print">
        {view === "period" ? (
          <>
            <PeriodView dayLabel="A Day" periods={aPeriods} rows={people} showCabins={showCabins} />
            <div className="mt-6">
              <PeriodView dayLabel="B Day" periods={bPeriods} rows={people} showCabins={showCabins} />
            </div>
          </>
        ) : (
          <StaffView periods={aPeriods.concat(bPeriods)} rows={people} showCabins={showCabins} />
        )}
      </div>

      {/* Print-only: both views print regardless of the on-screen toggle,
       * same reasoning as Staff Off Periods -- a posted sheet is more
       * useful showing both than whichever tab happened to be selected.
       * The cabin toggle DOES carry over to print, though, since that's a
       * content choice rather than a which-view choice. */}
      <PrintSheets sessionName={sessionName} aPeriods={aPeriods} bPeriods={bPeriods} rows={people} showCabins={showCabins} />
      <StaffWorkingPeriodsPrintStyles />
    </div>
  );
}

function PeriodView({ dayLabel, periods, rows, showCabins }: { dayLabel: string; periods: PeriodMeta[]; rows: StaffWorkingPeriodsPerson[]; showCabins: boolean }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-black text-forest-900">{dayLabel}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {periods.map((periodInfo) => {
          const workingPeople = rows
            .map((person) => ({ person, entry: person.periods.find((p) => p.period === periodInfo.period) }))
            .filter((row): row is { person: StaffWorkingPeriodsPerson; entry: NonNullable<typeof row.entry> } => Boolean(row.entry?.activityLabel));
          return (
            <section key={periodInfo.period} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-black text-forest-900">
                  Period {periodInfo.label}
                  {periodInfo.isTwilight ? " · Twilight" : ""}
                </h3>
                <span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs font-black text-forest-800">{workingPeople.length} working</span>
              </div>
              {periodInfo.timeLabel ? <p className="mb-2 text-xs font-semibold text-slate-400">{periodInfo.timeLabel}</p> : null}
              {workingPeople.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">Nobody working this period.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {workingPeople.map(({ person, entry }) => (
                    <li key={person.id} className="inline-flex items-center gap-1 rounded-full border border-forest-300 bg-forest-50 px-2.5 py-1 text-xs font-black text-forest-900">
                      {person.name}
                      {showCabins ? <span className="text-forest-600">({person.cabinName ?? "no cabin"})</span> : null}
                      <span className="font-semibold text-forest-700">— {entry.activityLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StaffView({ periods, rows, showCabins }: { periods: PeriodMeta[]; rows: StaffWorkingPeriodsPerson[]; showCabins: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-soft">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-forest-900 text-left text-white">
            <th className="w-40 border-l-0 border-forest-800 p-2 text-left">Staff</th>
            {showCabins ? <th className="w-20 border-l border-forest-800 p-2 text-left">Cabin</th> : null}
            {periods.map((periodInfo) => (
              <th key={periodInfo.period} className={`w-16 border-l p-2 text-center ${periodInfo.period === "P1B" ? "border-l-4 border-white" : "border-forest-800"}`}>
                {periodInfo.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => (
            <tr key={person.id} className="border-b border-slate-200 odd:bg-white even:bg-slate-50">
              <td className="p-2 font-black text-slate-900">{person.name}</td>
              {showCabins ? <td className="border-l border-slate-200 p-2 font-bold text-slate-600">{person.cabinName ?? "—"}</td> : null}
              {periods.map((periodInfo) => {
                const entry = person.periods.find((p) => p.period === periodInfo.period);
                const isDayBoundary = periodInfo.period === "P1B";
                const borderClass = isDayBoundary ? "border-l-4 border-slate-900" : "border-slate-200";
                if (entry?.activityLabel) {
                  return (
                    <td key={periodInfo.period} className={`border-l p-1 text-center text-xs font-black text-forest-900 ${borderClass}`}>
                      <span className="block rounded bg-forest-50 px-1 py-1">{entry.activityLabel}</span>
                    </td>
                  );
                }
                if (entry?.isOff) {
                  return (
                    <td key={periodInfo.period} className={`border-l p-1 text-center text-xs font-bold text-amber-700 ${borderClass}`}>
                      OFF
                    </td>
                  );
                }
                return (
                  <td key={periodInfo.period} className={`border-l p-1 text-center text-xs font-bold text-slate-300 ${borderClass}`}>
                    —
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="p-6 text-sm font-bold text-slate-500">No active staff found.</p> : null}
    </div>
  );
}

function PrintSheets({
  sessionName,
  aPeriods,
  bPeriods,
  rows,
  showCabins
}: {
  sessionName: string;
  aPeriods: PeriodMeta[];
  bPeriods: PeriodMeta[];
  rows: StaffWorkingPeriodsPerson[];
  showCabins: boolean;
}) {
  const allPeriods = [...aPeriods, ...bPeriods];
  return (
    <section className="staff-working-print">
      {[{ label: "A Day", periods: aPeriods }, { label: "B Day", periods: bPeriods }].map(({ label, periods }) => (
        <div className="staff-working-print-page" key={label}>
          <h2 className="staff-working-print-title">{sessionName} — Working Periods by Period — {label}</h2>
          <div className="staff-working-print-grid">
            {periods.map((periodInfo) => {
              const workingPeople = rows
                .map((person) => ({ person, entry: person.periods.find((p) => p.period === periodInfo.period) }))
                .filter((row): row is { person: StaffWorkingPeriodsPerson; entry: NonNullable<typeof row.entry> } => Boolean(row.entry?.activityLabel));
              return (
                <div className="staff-working-print-cell" key={periodInfo.period}>
                  <p className="staff-working-print-cell-title">Period {periodInfo.label}</p>
                  {workingPeople.length === 0 ? (
                    <p className="staff-working-print-empty">—</p>
                  ) : (
                    workingPeople.map(({ person, entry }) => (
                      <p key={person.id}>
                        {person.name}
                        {showCabins ? ` (${person.cabinName ?? "no cabin"})` : ""} — {entry.activityLabel}
                      </p>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="staff-working-print-page">
        <h2 className="staff-working-print-title">{sessionName} — Working Periods by Staff</h2>
        <table className="staff-working-print-table">
          <thead>
            <tr>
              <th>Staff</th>
              {showCabins ? <th>Cabin</th> : null}
              {allPeriods.map((periodInfo) => <th key={periodInfo.period}>{periodInfo.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => (
              <tr key={person.id}>
                <td className="staff-working-print-name">{person.name}</td>
                {showCabins ? <td>{person.cabinName ?? "—"}</td> : null}
                {allPeriods.map((periodInfo) => {
                  const entry = person.periods.find((p) => p.period === periodInfo.period);
                  return <td key={periodInfo.period}>{entry?.activityLabel ?? (entry?.isOff ? "OFF" : "")}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffWorkingPeriodsPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @media screen {
            .staff-working-print { display: none; }
          }

          @media print {
            @page { size: letter landscape; margin: 0.35in; }
            body, main { background: white !important; }
            .staff-working-print-page { page-break-after: always; }
            .staff-working-print-page:last-child { page-break-after: auto; }
            .staff-working-print-title { font-size: 16pt; font-weight: 900; margin-bottom: 0.15in; }
            .staff-working-print-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.12in; }
            .staff-working-print-cell { border: 1.5px solid #111; border-radius: 4px; padding: 0.08in 0.1in; font-size: 9.5pt; min-height: 1.4in; }
            .staff-working-print-cell-title { font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #111; margin-bottom: 0.05in; padding-bottom: 0.03in; }
            .staff-working-print-empty { color: #888; font-style: italic; }
            .staff-working-print-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
            .staff-working-print-table th, .staff-working-print-table td { border: 1px solid #333; padding: 0.04in 0.06in; text-align: center; }
            .staff-working-print-name { text-align: left !important; font-weight: 900; white-space: nowrap; }
          }
        `
      }}
    />
  );
}
