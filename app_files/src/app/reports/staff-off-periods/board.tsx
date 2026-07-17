"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, Printer, SlidersHorizontal } from "lucide-react";
import { secondaryButtonClass } from "@/components/ui";
import type { StaffOffPeriodMeta, StaffOffPeriodsPerson } from "@/lib/staff-off-periods-report";

export type { StaffOffPeriodsPerson };

type PeriodMeta = StaffOffPeriodMeta;

const A_DAY = new Set(["P1A", "P2A", "P3A", "P4A", "P5A"]);

function dayOf(period: string): "A" | "B" {
  return A_DAY.has(period) ? "A" : "B";
}

export function StaffOffPeriodsBoard({
  sessionName,
  people,
  periodMeta,
  canEdit,
  canExport
}: {
  sessionName: string;
  people: StaffOffPeriodsPerson[];
  periodMeta: PeriodMeta[];
  canEdit: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"period" | "staff">("period");
  const [rows, setRows] = useState(people);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Print & export selection. Defaults (all periods + staff grid) reproduce
  // the original "Print both views" behavior, including when someone hits
  // Cmd/Ctrl+P without ever opening the panel.
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(() => new Set(periodMeta.map((p) => p.period)));
  const [includeGrid, setIncludeGrid] = useState(true);

  const aPeriods = periodMeta.filter((p) => dayOf(p.period) === "A");
  const bPeriods = periodMeta.filter((p) => dayOf(p.period) === "B");
  const allSelected = selectedPeriods.size === periodMeta.length;

  function togglePeriod(period: string) {
    setSelectedPeriods((current) => {
      const next = new Set(current);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  function selectAll() {
    setSelectedPeriods(new Set(periodMeta.map((p) => p.period)));
  }

  function selectNone() {
    setSelectedPeriods(new Set());
  }

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (!allSelected) {
      params.set("periods", periodMeta.filter((p) => selectedPeriods.has(p.period)).map((p) => p.label).join(","));
    }
    if (!includeGrid) params.set("grid", "0");
    return params;
  }, [allSelected, includeGrid, periodMeta, selectedPeriods]);

  function exportHref(format: "xlsx" | "docx") {
    const params = new URLSearchParams(exportQuery);
    params.set("format", format);
    return `/api/exports/staff-off-periods?${params.toString()}`;
  }

  function setLocalOff(personId: string, period: string, isOff: boolean) {
    setRows((current) =>
      current.map((person) =>
        person.id === personId
          ? { ...person, periods: person.periods.map((p) => (p.period === period ? { ...p, isOff, assignedActivity: isOff ? null : p.assignedActivity } : p)) }
          : person
      )
    );
  }

  function markOff(personId: string, period: string) {
    if (!canEdit) return;
    const person = rows.find((r) => r.id === personId);
    if (!person) return;
    setLocalOff(personId, period, true);
    setMessage(`Saving ${person.name}'s off period…`);
    startTransition(async () => {
      const response = await fetch("/api/staff-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: personId, period, offPeriod: true })
      });
      const data = await response.json();
      if (!response.ok) {
        setLocalOff(personId, period, false);
        setMessage(data.error ?? "Couldn't save that off period.");
        return;
      }
      setMessage(`${person.name} marked off for ${period}.`);
      router.refresh();
    });
  }

  function clearOff(personId: string, period: string) {
    if (!canEdit) return;
    const person = rows.find((r) => r.id === personId);
    if (!person) return;
    setLocalOff(personId, period, false);
    setMessage(`Clearing ${person.name}'s off period…`);
    startTransition(async () => {
      const response = await fetch("/api/staff-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: personId, period })
      });
      if (!response.ok) {
        setLocalOff(personId, period, true);
        setMessage("Couldn't clear that off period.");
        return;
      }
      setMessage(`${person.name} cleared for ${period}.`);
      router.refresh();
    });
  }

  const offCountByPeriod = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of rows) {
      for (const entry of person.periods) {
        if (entry.isOff) counts.set(entry.period, (counts.get(entry.period) ?? 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
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
        <button type="button" className={secondaryButtonClass} onClick={() => setShowExportPanel((current) => !current)}>
          <SlidersHorizontal className="h-4 w-4" />
          Print &amp; Export
        </button>
      </div>

      {showExportPanel ? (
        <div className="no-print mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-forest-900">Periods to include</p>
            <div className="flex items-center gap-3 text-xs font-bold">
              <button type="button" className="text-forest-700 hover:underline" onClick={selectAll}>All</button>
              <button type="button" className="text-slate-500 hover:underline" onClick={selectNone}>None</button>
            </div>
          </div>
          <div className="mb-3 space-y-2">
            {[{ label: "A Day", periods: aPeriods }, { label: "B Day", periods: bPeriods }].map(({ label, periods }) => (
              <div key={label} className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 text-xs font-black uppercase text-slate-400">{label}</span>
                {periods.map((periodInfo) => {
                  const active = selectedPeriods.has(periodInfo.period);
                  return (
                    <button
                      key={periodInfo.period}
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-black ${active ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                      onClick={() => togglePeriod(periodInfo.period)}
                    >
                      {periodInfo.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-forest-700" checked={includeGrid} onChange={(event) => setIncludeGrid(event.target.checked)} />
            Include the by-staff grid
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={selectedPeriods.size === 0}
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </button>
            {canExport ? (
              <>
                <a className={secondaryButtonClass} href={exportHref("xlsx")}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel
                </a>
                <a className={secondaryButtonClass} href={exportHref("docx")}>
                  <FileText className="h-4 w-4" />
                  Download Word
                </a>
              </>
            ) : null}
            {selectedPeriods.size === 0 ? (
              <span className="text-xs font-bold text-amber-700">Pick at least one period.</span>
            ) : (
              <span className="text-xs font-semibold text-slate-400">
                {allSelected ? "All periods" : `${selectedPeriods.size} period${selectedPeriods.size === 1 ? "" : "s"} selected`}
                {includeGrid ? " · with staff grid" : ""}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`no-print mb-4 text-sm font-bold ${isPending ? "text-slate-500" : "text-forest-700"}`}>{message}</p>
      ) : null}

      {!canEdit ? (
        <p className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">
          View only — Executive Admin can toggle off periods from this screen.
        </p>
      ) : null}

      {/* On-screen interactive view — only the selected mode renders. */}
      <div className="no-print">
        {view === "period" ? (
          <PeriodView dayLabel="A Day" periods={aPeriods} rows={rows} offCountByPeriod={offCountByPeriod} canEdit={canEdit} onMarkOff={markOff} onClearOff={clearOff} />
        ) : (
          <StaffView periods={aPeriods.concat(bPeriods)} rows={rows} canEdit={canEdit} onMarkOff={markOff} onClearOff={clearOff} />
        )}
        {view === "period" ? (
          <div className="mt-6">
            <PeriodView dayLabel="B Day" periods={bPeriods} rows={rows} offCountByPeriod={offCountByPeriod} canEdit={canEdit} onMarkOff={markOff} onClearOff={clearOff} />
          </div>
        ) : null}
      </div>

      {/* Print-only sheets honor the Print & Export panel: only the selected
       * periods render (a day page is skipped entirely when none of its
       * periods are picked), and the by-staff grid page can be toggled off.
       * With everything selected this prints exactly what the old "Print
       * both views" button did. */}
      <PrintSheets
        sessionName={sessionName}
        aPeriods={aPeriods.filter((p) => selectedPeriods.has(p.period))}
        bPeriods={bPeriods.filter((p) => selectedPeriods.has(p.period))}
        rows={rows}
        includeGrid={includeGrid}
      />
      <StaffOffPeriodsPrintStyles />
    </div>
  );
}

function PeriodView({
  dayLabel,
  periods,
  rows,
  offCountByPeriod,
  canEdit,
  onMarkOff,
  onClearOff
}: {
  dayLabel: string;
  periods: PeriodMeta[];
  rows: StaffOffPeriodsPerson[];
  offCountByPeriod: Map<string, number>;
  canEdit: boolean;
  onMarkOff: (personId: string, period: string) => void;
  onClearOff: (personId: string, period: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-black text-forest-900">{dayLabel}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {periods.map((periodInfo) => {
          const offPeople = rows.filter((person) => person.periods.find((p) => p.period === periodInfo.period)?.isOff);
          const availableToAdd = rows.filter((person) => {
            const entry = person.periods.find((p) => p.period === periodInfo.period);
            return entry && !entry.isOff && !entry.assignedActivity;
          });
          return (
            <section key={periodInfo.period} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-black text-forest-900">
                  Period {periodInfo.label}
                  {periodInfo.isTwilight ? " · Twilight" : ""}
                </h3>
                <span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs font-black text-forest-800">{offCountByPeriod.get(periodInfo.period) ?? 0} off</span>
              </div>
              {periodInfo.timeLabel ? <p className="mb-2 text-xs font-semibold text-slate-400">{periodInfo.timeLabel}</p> : null}
              {offPeople.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">Nobody off this period.</p>
              ) : (
                <ul className="mb-3 flex flex-wrap gap-1.5">
                  {offPeople.map((person) => (
                    <li key={person.id} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-900">
                      {person.name}
                      {canEdit ? (
                        <button type="button" className="text-amber-500 hover:text-amber-800" onClick={() => onClearOff(person.id, periodInfo.period)} aria-label={`Clear ${person.name} off period`}>
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && availableToAdd.length > 0 ? (
                <AddOffControl period={periodInfo.period} people={availableToAdd} onMarkOff={onMarkOff} />
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AddOffControl({ period, people, onMarkOff }: { period: string; people: StaffOffPeriodsPerson[]; onMarkOff: (personId: string, period: string) => void }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
      <select
        className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Mark someone off…</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>{person.name}{person.areaName ? ` (${person.areaName})` : ""}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        className="shrink-0 rounded-md border border-forest-200 bg-forest-50 px-2.5 py-1.5 text-xs font-black text-forest-800 hover:bg-forest-100 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (!selected) return;
          onMarkOff(selected, period);
          setSelected("");
        }}
      >
        Mark off
      </button>
    </div>
  );
}

function StaffView({
  periods,
  rows,
  canEdit,
  onMarkOff,
  onClearOff
}: {
  periods: PeriodMeta[];
  rows: StaffOffPeriodsPerson[];
  canEdit: boolean;
  onMarkOff: (personId: string, period: string) => void;
  onClearOff: (personId: string, period: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-soft">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-forest-900 text-left text-white">
            <th className="w-40 border-l-0 border-forest-800 p-2 text-left">Staff</th>
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
              {periods.map((periodInfo) => {
                const entry = person.periods.find((p) => p.period === periodInfo.period);
                const isDayBoundary = periodInfo.period === "P1B";
                if (entry?.isOff) {
                  return (
                    <td key={periodInfo.period} className={`border-l p-1 text-center ${isDayBoundary ? "border-l-4 border-slate-900" : "border-slate-200"}`}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        className="w-full rounded bg-amber-100 px-1 py-1 text-xs font-black text-amber-900 hover:bg-amber-200 disabled:cursor-default"
                        onClick={() => canEdit && onClearOff(person.id, periodInfo.period)}
                      >
                        OFF
                      </button>
                    </td>
                  );
                }
                if (entry?.assignedActivity) {
                  return (
                    <td key={periodInfo.period} className={`border-l p-1 text-center text-xs font-bold text-slate-500 ${isDayBoundary ? "border-l-4 border-slate-900" : "border-slate-200"}`}>
                      {entry.assignedActivity}
                    </td>
                  );
                }
                return (
                  <td key={periodInfo.period} className={`border-l p-1 text-center ${isDayBoundary ? "border-l-4 border-slate-900" : "border-slate-200"}`}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      className="w-full rounded px-1 py-1 text-xs font-bold text-slate-300 hover:bg-slate-100 hover:text-slate-500 disabled:cursor-default disabled:hover:bg-transparent"
                      onClick={() => canEdit && onMarkOff(person.id, periodInfo.period)}
                    >
                      —
                    </button>
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
  includeGrid
}: {
  sessionName: string;
  aPeriods: PeriodMeta[];
  bPeriods: PeriodMeta[];
  rows: StaffOffPeriodsPerson[];
  includeGrid: boolean;
}) {
  const allPeriods = [...aPeriods, ...bPeriods];
  const dayPages = [{ label: "A Day", periods: aPeriods }, { label: "B Day", periods: bPeriods }].filter(({ periods }) => periods.length > 0);
  return (
    <section className="staff-off-print">
      {dayPages.map(({ label, periods }) => (
        <div className="staff-off-print-page" key={label}>
          <h2 className="staff-off-print-title">{sessionName} — Off Periods by Period — {label}</h2>
          {/* Column count tracks how many periods are on the page, so a
           * one- or two-period print gets full-width cells instead of five
           * skinny columns with four of them empty. */}
          <div className="staff-off-print-grid" style={{ gridTemplateColumns: `repeat(${Math.min(periods.length, 5)}, minmax(0, 1fr))` }}>
            {periods.map((periodInfo) => {
              const offPeople = rows.filter((person) => person.periods.find((p) => p.period === periodInfo.period)?.isOff);
              return (
                <div className="staff-off-print-cell" key={periodInfo.period}>
                  <p className="staff-off-print-cell-title">Period {periodInfo.label}{periodInfo.timeLabel ? ` — ${periodInfo.timeLabel}` : ""}</p>
                  {offPeople.length === 0 ? (
                    <p className="staff-off-print-empty">—</p>
                  ) : (
                    offPeople.map((person) => <p key={person.id}>{person.name}</p>)
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {includeGrid && allPeriods.length > 0 ? (
        <div className="staff-off-print-page">
          <h2 className="staff-off-print-title">{sessionName} — Off Periods by Staff</h2>
          <table className="staff-off-print-table">
            <thead>
              <tr>
                <th>Staff</th>
                {allPeriods.map((periodInfo) => <th key={periodInfo.period}>{periodInfo.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <td className="staff-off-print-name">{person.name}</td>
                  {allPeriods.map((periodInfo) => {
                    const entry = person.periods.find((p) => p.period === periodInfo.period);
                    return <td key={periodInfo.period}>{entry?.isOff ? "OFF" : entry?.assignedActivity ?? ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function StaffOffPeriodsPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @media screen {
            .staff-off-print { display: none; }
          }

          @media print {
            @page { size: letter landscape; margin: 0.35in; }
            body, main { background: white !important; }
            .staff-off-print-page { page-break-after: always; }
            .staff-off-print-page:last-child { page-break-after: auto; }
            .staff-off-print-title { font-size: 16pt; font-weight: 900; margin-bottom: 0.15in; }
            .staff-off-print-grid { display: grid; gap: 0.12in; }
            .staff-off-print-cell { border: 1.5px solid #111; border-radius: 4px; padding: 0.08in 0.1in; font-size: 9.5pt; min-height: 1.4in; }
            .staff-off-print-cell-title { font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #111; margin-bottom: 0.05in; padding-bottom: 0.03in; }
            .staff-off-print-empty { color: #888; font-style: italic; }
            .staff-off-print-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
            .staff-off-print-table th, .staff-off-print-table td { border: 1px solid #333; padding: 0.04in 0.06in; text-align: center; }
            .staff-off-print-name { text-align: left !important; font-weight: 900; white-space: nowrap; }
          }
        `
      }}
    />
  );
}
