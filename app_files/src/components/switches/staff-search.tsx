"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Period } from "@prisma/client";
import { ArrowRight, Search } from "lucide-react";
import { STAFF_PERIODS, PERIOD_LABEL } from "@/lib/periods";
import { inputClass } from "@/components/ui";

export type StaffAssignmentRow = {
  assignmentId: string;
  staffId: string;
  staffName: string;
  primaryAreaName: string | null;
  leaveNote: string | null;
  period: Period;
  periodLabel: string;
  areaName: string;
  activityName: string;
};

const PERIOD_ORDER = new Map(STAFF_PERIODS.map((period, index) => [period, index]));

export function StaffSearch({
  assignments,
  initialAssignmentId
}: {
  assignments: StaffAssignmentRow[];
  initialAssignmentId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [period, setPeriod] = useState<Period | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(initialAssignmentId);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const selected = useMemo(
    () => assignments.find((row) => row.assignmentId === selectedId) ?? null,
    [assignments, selectedId]
  );

  const results = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const needle = debouncedQuery.toLowerCase();
    return assignments.filter((row) => {
      if (period !== "ALL" && row.period !== period) return false;
      const haystack = `${row.staffName} ${row.primaryAreaName ?? ""} ${row.activityName} ${row.areaName}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [assignments, debouncedQuery, period]);

  useEffect(() => {
    setActiveIndex((current) => (results.length ? Math.min(current, results.length - 1) : 0));
  }, [results.length]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = results[activeIndex];
      if (row) setSelectedId(row.assignmentId);
    }
  }

  if (selected) {
    return (
      <StaffContextCard
        selected={selected}
        schedule={assignments
          .filter((row) => row.staffId === selected.staffId)
          .sort((a, b) => (PERIOD_ORDER.get(a.period) ?? 0) - (PERIOD_ORDER.get(b.period) ?? 0))}
        onBack={() => {
          setSelectedId(null);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          autoFocus
          autoComplete="off"
          className={`${inputClass} pl-9`}
          placeholder="Search staff, area, or current activity…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="staff-search-results"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by period">
        <PeriodChip label="All" active={period === "ALL"} onClick={() => setPeriod("ALL")} />
        {STAFF_PERIODS.map((value) => (
          <PeriodChip key={value} label={PERIOD_LABEL[value]} active={period === value} onClick={() => setPeriod(value)} />
        ))}
      </div>

      {debouncedQuery.length < 2 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm font-medium text-slate-500">
          Type at least 2 characters to search staff assignments.
        </p>
      ) : results.length ? (
        <ul id="staff-search-results" className="grid gap-2">
          {results.map((row, index) => (
            <li key={row.assignmentId}>
              <button
                type="button"
                onClick={() => setSelectedId(row.assignmentId)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-lake-200 hover:bg-lake-50/40 ${
                  index === activeIndex ? "border-lake-300 ring-2 ring-lake-100" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-forest-900">{row.staffName}</span>
                  {row.primaryAreaName ? <span className="text-sm text-slate-500">{row.primaryAreaName}</span> : null}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Period {row.periodLabel}</span> · {row.areaName} — {row.activityName}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm font-medium text-slate-500">
          No staff assignments match your search.
        </p>
      )}
    </div>
  );
}

function PeriodChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full px-3 py-1.5 text-sm font-bold transition ${
        active ? "bg-forest-700 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function StaffContextCard({
  selected,
  schedule,
  onBack
}: {
  selected: StaffAssignmentRow;
  schedule: StaffAssignmentRow[];
  onBack: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onBack();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-base font-black uppercase tracking-wide text-forest-900">{selected.staffName}</p>
          {selected.primaryAreaName ? <p className="mt-0.5 text-sm text-slate-600">{selected.primaryAreaName}</p> : null}
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600">
          Switching Period {selected.periodLabel}
        </span>
      </div>

      {selected.leaveNote ? <p className="mt-3 text-sm font-semibold text-amber-700">⚠ {selected.leaveNote}</p> : null}

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Assignment schedule</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {schedule.map((row) => {
            const isSwitching = row.assignmentId === selected.assignmentId;
            return (
              <div
                key={row.assignmentId}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  isSwitching ? "border-forest-300 bg-forest-50 text-forest-900" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="font-bold">Period {row.periodLabel}</span> · {row.areaName} — {row.activityName}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link
          href={`/switches/new-staff/destination?assignmentId=${selected.assignmentId}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-lake-700"
        >
          Continue with this selection <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          Back to search
        </button>
      </div>
    </div>
  );
}
