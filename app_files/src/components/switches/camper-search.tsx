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

type CamperMatch = { camper: CamperRegistrationRow; matchedRegistrations: CamperRegistrationRow[] };

export function CamperSearch({
  registrations,
  initialRegistrationId,
  initialCamperId = null,
  initialCamperName = null
}: {
  registrations: CamperRegistrationRow[];
  initialRegistrationId: string | null;
  initialCamperId?: string | null;
  initialCamperName?: string | null;
}) {
  // A registrationId deep-link (e.g. "Continue"/back-navigation) resolves to
  // that registration's camper so the schedule card opens directly on it.
  const registrationCamperId = initialRegistrationId
    ? (registrations.find((row) => row.registrationId === initialRegistrationId)?.camperId ?? null)
    : null;
  const initialSelectedCamperId = registrationCamperId ?? initialCamperId ?? null;

  // Prefills the search box (used if the person taps "Back to search") with
  // whatever name we can resolve, so re-searching for someone else is easy.
  const initialQuery = (() => {
    if (!initialSelectedCamperId) return "";
    const match = registrations.find((row) => row.camperId === initialSelectedCamperId);
    if (match) return `${match.firstName} ${match.lastName}`;
    return initialCamperName ?? "";
  })();

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [period, setPeriod] = useState<Period | "ALL">("ALL");
  const [selectedCamperId, setSelectedCamperId] = useState<string | null>(initialSelectedCamperId);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce filtering by 150ms, matching the typeahead pattern elsewhere.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => window.clearTimeout(timeout);
  }, [query]);

  // One card per CAMPER, not one row per registration -- searching a name
  // used to list every one of that camper's periods as a separate result.
  // Any registration that matches becomes a hit for the camper as a whole;
  // which periods matched is kept for the hint line under their name.
  const results = useMemo((): CamperMatch[] => {
    if (debouncedQuery.length < 2) return [];
    const needle = debouncedQuery.toLowerCase();
    const matchingRows = registrations.filter((row) => {
      if (period !== "ALL" && row.period !== period) return false;
      const haystack = `${row.firstName} ${row.lastName} ${row.cabinName ?? ""} ${row.unitLabel} ${row.activityName} ${row.areaName}`.toLowerCase();
      return haystack.includes(needle);
    });

    const byCamper = new Map<string, CamperMatch>();
    for (const row of matchingRows) {
      const existing = byCamper.get(row.camperId);
      if (existing) existing.matchedRegistrations.push(row);
      else byCamper.set(row.camperId, { camper: row, matchedRegistrations: [row] });
    }

    return Array.from(byCamper.values())
      .map((entry) => ({
        ...entry,
        matchedRegistrations: entry.matchedRegistrations.sort((a, b) => (PERIOD_ORDER.get(a.period) ?? 0) - (PERIOD_ORDER.get(b.period) ?? 0))
      }))
      .sort((a, b) => a.camper.lastName.localeCompare(b.camper.lastName) || a.camper.firstName.localeCompare(b.camper.firstName));
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
      const match = results[activeIndex];
      if (match) setSelectedCamperId(match.camper.camperId);
    }
  }

  if (selectedCamperId) {
    const schedule = registrations
      .filter((row) => row.camperId === selectedCamperId)
      .sort((a, b) => (PERIOD_ORDER.get(a.period) ?? 0) - (PERIOD_ORDER.get(b.period) ?? 0));

    return (
      <CamperRegistrationCard
        camperId={selectedCamperId}
        fallbackName={initialCamperName}
        schedule={schedule}
        highlightRegistrationId={initialRegistrationId}
        onBack={() => {
          setSelectedCamperId(null);
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
          {results.map((match, index) => (
            <li key={match.camper.camperId}>
              <button
                type="button"
                onClick={() => setSelectedCamperId(match.camper.camperId)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-lake-200 hover:bg-lake-50/40 ${
                  index === activeIndex ? "border-lake-300 ring-2 ring-lake-100" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-forest-900">
                    {match.camper.firstName} {match.camper.lastName}
                  </span>
                  <span className="text-sm text-slate-500">
                    {[match.camper.cabinName, match.camper.unitLabel].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {match.matchedRegistrations.map((row) => `${row.periodLabel} ${row.areaName} — ${row.activityName}`).join(" · ")}
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

function CamperRegistrationCard({
  camperId,
  fallbackName,
  schedule,
  highlightRegistrationId,
  onBack
}: {
  camperId: string;
  fallbackName: string | null;
  schedule: CamperRegistrationRow[];
  highlightRegistrationId: string | null;
  onBack: () => void;
}) {
  // Escape collapses the registration card back to the search view.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onBack();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  const first = schedule[0] ?? null;

  // Deep-linked to a camper with no active registrations this session (e.g.
  // from the quick-search "Switch" button) -- nothing to click into.
  if (!first) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm font-medium text-amber-900 shadow-soft">
        {fallbackName ? <span className="font-bold">{fallbackName}</span> : "This camper"} has no active registrations this
        session, so there&rsquo;s nothing to switch.
        <div className="mt-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-50"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  const identity = [first.cabinName, first.unitLabel, first.swimLabel, first.age != null ? `Age ${first.age}` : null].filter(Boolean);
  const scheduleByPeriod = new Map(schedule.map((row) => [row.period, row]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-base font-black uppercase tracking-wide text-forest-900">
            {first.firstName} {first.lastName}
          </p>
          {identity.length ? <p className="mt-0.5 text-sm text-slate-600">{identity.join("  ·  ")}</p> : null}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Back to search
        </button>
      </div>

      {first.departureNote ? <p className="mt-3 text-sm font-semibold text-amber-700">⚠ {first.departureNote}</p> : null}

      {first.designations.length || first.medicalFlags || first.allergies.length || first.priorSwitchCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {first.designations.map((designation) => (
            <span key={designation} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {designation}
            </span>
          ))}
          {first.medicalFlags ? (
            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Medical: {first.medicalFlags}</span>
          ) : null}
          {first.allergies.length ? (
            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Allergies: {first.allergies.join(", ")}</span>
          ) : null}
          {first.priorSwitchCount > 0 ? (
            <Link
              href={`/switches?camper=${camperId}`}
              className="rounded-md bg-lake-100 px-2.5 py-1 text-xs font-semibold text-lake-700 underline-offset-2 hover:underline"
            >
              {first.priorSwitchCount} switch{first.priorSwitchCount === 1 ? "" : "es"} this session
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tap a period to start that switch</p>
        <div className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
          {[A_DAY_PERIODS, B_DAY_PERIODS].map((column, columnIndex) => (
            <div key={columnIndex} className="grid gap-1.5">
              {column.map((periodValue) => {
                const row = scheduleByPeriod.get(periodValue);
                const isHighlighted = row?.registrationId === highlightRegistrationId;

                if (!row) {
                  return (
                    <div
                      key={periodValue}
                      className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
                    >
                      <span className="font-bold">Period {PERIOD_LABEL[periodValue]}</span> · Not scheduled
                    </div>
                  );
                }

                return (
                  <Link
                    key={periodValue}
                    href={`/switches/new/destination?registrationId=${row.registrationId}`}
                    className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      isHighlighted
                        ? "border-forest-300 bg-forest-50 text-forest-900 ring-2 ring-forest-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-lake-300 hover:bg-lake-50/60"
                    }`}
                  >
                    <span>
                      <span className="font-bold">Period {PERIOD_LABEL[periodValue]}</span> · {row.areaName} — {row.activityName}
                      {row.hasPendingSwitchThisPeriod ? (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-800">
                          Pending switch
                        </span>
                      ) : null}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-lake-600" />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
