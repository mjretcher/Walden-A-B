"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Period } from "@prisma/client";
import { ArrowRight, Search } from "lucide-react";
import { CAMPER_PERIODS, PERIOD_LABEL } from "@/lib/periods";
import { inputClass } from "@/components/ui";

export type CamperRegistrationRow = {
  registrationId: string;
  camperId: string;
  offeringId: string;
  firstName: string;
  lastName: string;
  cabinName: string | null;
  unitLabel: string;
  swimLabel: string;
  age: number | null;
  medicalFlags: string | null;
  allergies: string[];
  designations: string[];
  departureNote: string | null;
  period: Period;
  periodLabel: string;
  areaName: string;
  activityName: string;
  priorSwitchCount: number;
  hasPendingSwitchThisPeriod: boolean;
};

const PERIOD_ORDER = new Map(CAMPER_PERIODS.map((period, index) => [period, index]));
// Registration-card layout: A days down the left column, B days down the right.
const A_DAY_PERIODS = CAMPER_PERIODS.filter((period) => period.endsWith("A"));
const B_DAY_PERIODS = CAMPER_PERIODS.filter((period) => period.endsWith("B"));

export function CamperSearch({
  registrations,
  initialRegistrationId,
  initialCamperId = null
}: {
  registrations: CamperRegistrationRow[];
  initialRegistrationId: string | null;
  initialCamperId?: string | null;
}) {
  // A camperId deep-link (e.g. "re-switch" from history) pre-fills the search
  // box with that camper's name so their registrations surface immediately.
  const initialQuery =
    !initialRegistrationId && initialCamperId
      ? (() => {
          const match = registrations.find((row) => row.camperId === initialCamperId);
          return match ? `${match.firstName} ${match.lastName}` : "";
        })()
      : "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [period, setPeriod] = useState<Period | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(initialRegistrationId);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce filtering by 150ms, matching the typeahead pattern elsewhere.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const selected = useMemo(
    () => registrations.find((row) => row.registrationId === selectedId) ?? null,
    [registrations, selectedId]
  );

  const results = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const needle = debouncedQuery.toLowerCase();
    return registrations.filter((row) => {
      if (period !== "ALL" && row.period !== period) return false;
      const haystack = `${row.firstName} ${row.lastName} ${row.cabinName ?? ""} ${row.unitLabel} ${row.activityName} ${row.areaName}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [registrations, debouncedQuery, period]);

  // Keep the keyboard cursor in range whenever the result set changes.
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
      if (row) setSelectedId(row.registrationId);
    }
  }

  if (selected) {
    return (
      <CamperContextCard
        selected={selected}
        schedule={registrations
          .filter((row) => row.camperId === selected.camperId)
          .sort((a, b) => (PERIOD_ORDER.get(a.period) ?? 0) - (PERIOD_ORDER.get(b.period) ?? 0))}
        onBack={() => {
          setSelectedId(null);
          // Return focus to the search input so keyboard users can keep going.
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
          placeholder="Search camper, cabin, activity, or area…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="camper-search-results"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by period">
        <PeriodChip label="All" active={period === "ALL"} onClick={() => setPeriod("ALL")} />
        {CAMPER_PERIODS.map((value) => (
          <PeriodChip key={value} label={PERIOD_LABEL[value]} active={period === value} onClick={() => setPeriod(value)} />
        ))}
      </div>

      {debouncedQuery.length < 2 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm font-medium text-slate-500">
          Type at least 2 characters to search registrations.
        </p>
      ) : results.length ? (
        <ul id="camper-search-results" className="grid gap-2">
          {results.map((row, index) => (
            <li key={row.registrationId}>
              <button
                type="button"
                onClick={() => setSelectedId(row.registrationId)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-lake-200 hover:bg-lake-50/40 ${
                  index === activeIndex ? "border-lake-300 ring-2 ring-lake-100" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-forest-900">
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="text-sm text-slate-500">
                    {[row.cabinName, row.unitLabel].filter(Boolean).join(" · ")}
                  </span>
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
          No registrations match your search.
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

function CamperContextCard({
  selected,
  schedule,
  onBack
}: {
  selected: CamperRegistrationRow;
  schedule: CamperRegistrationRow[];
  onBack: () => void;
}) {
  // Escape collapses the context card back to the search view.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onBack();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  const identity = [
    selected.cabinName,
    selected.unitLabel,
    selected.swimLabel,
    selected.age != null ? `Age ${selected.age}` : null
  ].filter(Boolean);

  const scheduleByPeriod = new Map(schedule.map((row) => [row.period, row]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-base font-black uppercase tracking-wide text-forest-900">
            {selected.firstName} {selected.lastName}
          </p>
          {identity.length ? <p className="mt-0.5 text-sm text-slate-600">{identity.join("  ·  ")}</p> : null}
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600">
          Switching Period {selected.periodLabel}
        </span>
      </div>

      {selected.departureNote ? (
        <p className="mt-3 text-sm font-semibold text-amber-700">⚠ {selected.departureNote}</p>
      ) : null}

      {selected.hasPendingSwitchThisPeriod ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          ⚠ A pending switch for this period already exists.{" "}
          <Link className="underline" href={`/switches?camper=${selected.camperId}`}>
            View it
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Period schedule</p>
        <div className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
          {[A_DAY_PERIODS, B_DAY_PERIODS].map((column, columnIndex) => (
            <div key={columnIndex} className="grid gap-1.5">
              {column.map((period) => {
                const row = scheduleByPeriod.get(period);
                const isSwitching = row?.registrationId === selected.registrationId;
                return (
                  <div
                    key={period}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      isSwitching
                        ? "border-forest-300 bg-forest-50 text-forest-900"
                        : row
                          ? "border-slate-200 bg-white text-slate-700"
                          : "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <span className="font-bold">Period {PERIOD_LABEL[period]}</span>
                    {row ? ` · ${row.areaName} — ${row.activityName}` : " · Not scheduled"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selected.designations.length || selected.medicalFlags || selected.allergies.length || selected.priorSwitchCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {selected.designations.map((designation) => (
            <span key={designation} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {designation}
            </span>
          ))}
          {selected.medicalFlags ? (
            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Medical: {selected.medicalFlags}
            </span>
          ) : null}
          {selected.allergies.length ? (
            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              Allergies: {selected.allergies.join(", ")}
            </span>
          ) : null}
          {selected.priorSwitchCount > 0 ? (
            <Link
              href={`/switches?camper=${selected.camperId}`}
              className="rounded-md bg-lake-100 px-2.5 py-1 text-xs font-semibold text-lake-700 underline-offset-2 hover:underline"
            >
              {selected.priorSwitchCount} switch{selected.priorSwitchCount === 1 ? "" : "es"} this session
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link
          href={`/switches/new/destination?registrationId=${selected.registrationId}`}
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
