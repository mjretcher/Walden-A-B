"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Copy, Check, ExternalLink, RefreshCw, Replace, Search, UserCog } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";

type PeriodCell = {
  period: string;
  state: "assigned" | "off" | "empty";
  full: string | null;
  abv: string | null;
};

type CamperResult = {
  id: string;
  type: "Camper";
  title: string;
  camperId: string;
  cabin: string | null;
  unit: string;
  swimLevel: string | null;
  medicalFlag: boolean;
  outageReason: string | null;
  scheduleByPeriod: Record<string, string>;
  registrationCount: number;
};

type StaffResult = {
  id: string;
  type: "Staff";
  title: string;
  staffId: string;
  housing: string | null;
  primaryArea: string | null;
  outageReason: string | null;
  periodCells: PeriodCell[];
};

type QuickSearchResult = CamperResult | StaffResult;

const LEFT_PERIODS = ["1A", "2A", "3A", "4A"];
const RIGHT_PERIODS = ["1B", "2B", "3B", "4B"];
const ALL_CAMPER_PERIODS = [...LEFT_PERIODS, ...RIGHT_PERIODS];

function outageLabel(reason: string): string {
  const map: Record<string, string> = {
    TRIP: "On trip",
    INFIRMARY: "Infirmary",
    SICK: "Sick",
    OFF_CAMP: "Off-camp",
    VACATION_AWAY: "Away",
    CUSTOM: "Outage"
  };
  return map[reason] ?? "Outage";
}

function swimCode(level: string | null): string {
  const map: Record<string, string> = {
    BLUEGILL: "B",
    WALLEYE: "W",
    MUSKIE: "M",
    PENDING_SWIM_TEST: "P"
  };
  return level ? (map[level] ?? level) : "—";
}

function CopyButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(name).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      title="Copy name"
      type="button"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function OutageBadge({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      <AlertCircle className="h-3 w-3" />
      {outageLabel(reason)}
    </span>
  );
}

function CamperCard({ result, onNavigate }: { result: CamperResult; onNavigate: () => void }) {
  const camperMgmtHref = `/admin/campers?q=${encodeURIComponent(result.title)}`;
  const switchHref = `/switches?camper=${encodeURIComponent(result.title)}`;

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-black text-forest-900">{result.title}</span>
            <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-700">Camper</span>
            {result.medicalFlag && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3 w-3" />Medical
              </span>
            )}
            {result.outageReason && <OutageBadge reason={result.outageReason} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {result.cabin && (
              <span className="rounded-md bg-forest-50 px-2 py-0.5 font-semibold text-forest-800">{result.cabin}</span>
            )}
            <span>·</span>
            <span>{result.unit.replace("UNIT", "Unit ")}</span>
            <span>·</span>
            <span>Swim: {swimCode(result.swimLevel)}</span>
            {result.registrationCount === 0 && (
              <><span>·</span><span className="font-semibold text-orange-600">No registrations</span></>
            )}
          </div>
        </div>
        <CopyButton name={result.title} />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        {[LEFT_PERIODS, RIGHT_PERIODS].map((periods, tableIndex) => (
          <table key={tableIndex} className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-forest-900 text-white">
                <th className="w-8 border border-forest-900 px-1.5 py-1 text-left font-semibold">Pd</th>
                <th className="border border-forest-900 px-1.5 py-1 text-left font-semibold">Activity</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((pd) => {
                const activity = result.scheduleByPeriod[pd];
                return (
                  <tr key={pd}>
                    <td className="border border-slate-200 px-1.5 py-1 font-black text-forest-900">{pd}</td>
                    <td className="border border-slate-200 px-1.5 py-1 text-slate-800">
                      {activity ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Link
          href={camperMgmtHref}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md bg-forest-900 px-2.5 py-1.5 text-xs font-black text-white hover:bg-forest-800"
        >
          <ExternalLink className="h-3 w-3" />Camper mgmt
        </Link>
        <Link
          href={switchHref}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Replace className="h-3 w-3" />Switch
        </Link>
      </div>
    </div>
  );
}

function StaffCard({ result, onNavigate }: { result: StaffResult; onNavigate: () => void }) {
  const staffHref = `/admin/staff/${result.staffId}`;

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-black text-forest-900">{result.title}</span>
            <span className="rounded-full bg-lake-100 px-2 py-0.5 text-xs font-semibold text-lake-700">Staff</span>
            {result.outageReason && <OutageBadge reason={result.outageReason} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {result.housing && (
              <span className="rounded-md bg-lake-50 px-2 py-0.5 font-semibold text-lake-800">{result.housing}</span>
            )}
            {result.primaryArea && (
              <><span>·</span><span>Primary: {result.primaryArea}</span></>
            )}
          </div>
        </div>
        <CopyButton name={result.title} />
      </div>

      <div className="mt-2.5 grid grid-cols-10 gap-1">
        {result.periodCells.map((cell) => (
          <div
            key={cell.period}
            title={cell.state === "assigned" ? `${cell.period} — ${cell.full}` : cell.state === "off" ? `${cell.period} — Off period` : `${cell.period} — Unassigned`}
            className={`group relative flex flex-col items-center rounded border px-0.5 py-1 text-center ${
              cell.state === "assigned"
                ? "border-forest-200 bg-forest-50 text-forest-800"
                : cell.state === "off"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <span className="text-[10px] font-black leading-none">{cell.period}</span>
            {cell.abv && (
              <span className="mt-0.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-semibold leading-none">
                {cell.abv}
              </span>
            )}
            {cell.state === "off" && (
              <span className="mt-0.5 block text-[8px] font-semibold leading-none">Off</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Link
          href={staffHref}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md bg-forest-900 px-2.5 py-1.5 text-xs font-black text-white hover:bg-forest-800"
        >
          <ExternalLink className="h-3 w-3" />Full profile
        </Link>
        <Link
          href={staffHref}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <UserCog className="h-3 w-3" />Staff mgmt
        </Link>
      </div>
    </div>
  );
}

export function GlobalSearchTypeahead({
  initialQuery = "",
  compact = false,
  autoFocus = false,
  placeholder
}: {
  initialQuery?: string;
  compact?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchUrl = useMemo(() => `/search?q=${encodeURIComponent(query)}`, [query]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("walden-recent-searches");
      if (stored) setRecentSearches(JSON.parse(stored).slice(0, 5));
    } catch {}
  }, []);

  const saveRecentSearch = useCallback((q: string) => {
    if (!q.trim()) return;
    try {
      const stored = localStorage.getItem("walden-recent-searches");
      const existing: string[] = stored ? JSON.parse(stored) : [];
      const updated = [q.trim(), ...existing.filter((s) => s !== q.trim())].slice(0, 5);
      localStorage.setItem("walden-recent-searches", JSON.stringify(updated));
      setRecentSearches(updated);
    } catch {}
  }, []);

  // "/" shortcut to focus search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Fetch results — keep stale results visible during re-fetch so typing a space
  // or continuing to type doesn't flash an empty dropdown mid-keystroke
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    // Show loading spinner after a short delay but don't wipe existing results
    const loadingTimeout = window.setTimeout(() => {
      if (!controller.signal.aborted) setLoading(true);
    }, 80);
    const fetchTimeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/quick?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setActiveIndex(-1);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(loadingTimeout);
      window.clearTimeout(fetchTimeout);
    };
  }, [query]);

  // Click-outside + Escape to close
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setResults([]);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setResults([]); inputRef.current?.blur(); }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClickOutside); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Arrow key + Enter navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const result = results[activeIndex];
      if (!result) return;
      saveRecentSearch(query);
      const href = result.type === "Camper"
        ? `/admin/campers?q=${encodeURIComponent(result.title)}`
        : `/admin/staff/${result.staffId}`;
      window.location.href = href;
    }
  }

  function handleNavigate() {
    saveRecentSearch(query);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  // Show dropdown if: query is long enough AND (we have results already OR the dropdown is explicitly open)
  // This prevents results disappearing mid-keystroke while a re-fetch is in-flight
  const showResults = query.trim().length >= 2 && (results.length > 0 || open);

  const dropdownContent = (
    <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" style={{ minWidth: compact ? "420px" : undefined }}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        <span>{loading ? <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Searching…</span> : `${results.length} result${results.length === 1 ? "" : "s"}`}</span>
        <span className="hidden font-normal normal-case tracking-normal sm:block">↑↓ navigate · / to focus</span>
      </div>

      <div className="max-h-[75vh] divide-y divide-slate-100 overflow-y-auto">
        {results.map((result, index) =>
          result.type === "Camper" ? (
            <div key={result.id} className={index === activeIndex ? "bg-lake-50" : "hover:bg-slate-50"}>
              <CamperCard result={result} onNavigate={handleNavigate} />
            </div>
          ) : (
            <div key={result.id} className={index === activeIndex ? "bg-lake-50" : "hover:bg-slate-50"}>
              <StaffCard result={result} onNavigate={handleNavigate} />
            </div>
          )
        )}
        {!loading && !results.length && (
          <div className="px-4 py-5 text-sm font-medium text-slate-500">
            No results for &ldquo;{query.trim()}&rdquo;.
          </div>
        )}
      </div>

      <Link
        href={searchUrl}
        onClick={handleNavigate}
        className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-slate-100"
      >
        <Search className="h-3.5 w-3.5" />
        Open full results for &ldquo;{query.trim()}&rdquo;
      </Link>
    </div>
  );

  if (compact) {
    return (
      <div ref={wrapperRef} className="relative">
        <form className="flex h-11 w-80 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm" action="/search" method="get">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent outline-none"
            name="q"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Search campers & staff… (/)"}
            value={query}
          />
        </form>
        {showResults ? dropdownContent : null}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <form className="flex flex-col gap-3 sm:flex-row" action="/search" method="get">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`${inputClass} flex-1 bg-white`}
          name="q"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Search camper, staff, activity, area, or cabin"}
          value={query}
        />
        <button className={buttonClass} type="submit">Search</button>
      </form>
      {showResults ? dropdownContent : null}
    </div>
  );
}
