"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";

type SchedulePreview = {
  period: string;
  area: string;
  activity: string;
  window: string;
};

type QuickSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  medicalFlag?: boolean;
  schedule?: SchedulePreview[];
};

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchUrl = useMemo(() => `/search?q=${encodeURIComponent(query)}`, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search/quick?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  // Close the dropdown when clicking outside (compact mode only)
  useEffect(() => {
    if (!compact || !open) return;
    function onClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [compact, open]);

  const showResults = query.trim().length >= 2 && (compact ? open : true);

  if (compact) {
    return (
      <div ref={wrapperRef} className="relative">
        <form className="flex h-11 w-80 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm" action="/search" method="get">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent outline-none"
            name="q"
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? "Search campers, staff, cabins…"}
            value={query}
          />
        </form>

        {showResults ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {loading ? "Searching…" : `${results.length} quick result${results.length === 1 ? "" : "s"}`}
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {results.map((result) => (
                <Link key={result.id} className="block rounded-lg px-3 py-2.5 transition hover:bg-lake-50" href={result.href} onClick={() => setOpen(false)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-bold text-forest-900">{result.title}</p>
                        {result.medicalFlag ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Medical flag</span> : null}
                      </div>
                      <p className="truncate text-sm text-slate-500">{result.subtitle}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{result.type}</span>
                  </div>
                </Link>
              ))}
              {!loading && !results.length ? (
                <div className="px-3 py-3 text-sm font-medium text-slate-500">No quick matches.</div>
              ) : null}
            </div>
            <Link href={searchUrl} className="block border-t border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-slate-100" onClick={() => setOpen(false)}>
              Open full results for &ldquo;{query.trim()}&rdquo;
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <form className="flex flex-col gap-3 sm:flex-row" action="/search" method="get">
        <input
          autoFocus={autoFocus}
          autoComplete="off"
          className={`${inputClass} flex-1 bg-white`}
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder ?? "Search camper, staff, activity, area, or cabin"}
          value={query}
        />
        <button className={buttonClass} type="submit">Search</button>
      </form>

      {showResults ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "Searching..." : `${results.length} quick result${results.length === 1 ? "" : "s"}`}
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {results.map((result) => (
              <Link key={result.id} className="block rounded-xl px-3 py-3 transition hover:bg-lake-50" href={result.href}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-forest-900">{result.title}</p>
                      {result.medicalFlag ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Medical flag</span> : null}
                    </div>
                    <p className="text-sm text-slate-500">{result.subtitle}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{result.type}</span>
                </div>
                {result.type === "Camper" && result.schedule?.length ? (
                  <div className="mt-3 grid gap-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 sm:grid-cols-2">
                    {result.schedule.slice(0, 6).map((item, index) => (
                      <div key={`${result.id}-${item.period}-${index}`} className="rounded-md bg-white px-2 py-1">
                        <span className="font-bold text-forest-900">{item.period}</span> · {item.activity} · {item.area}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}
            {!loading && !results.length ? (
              <div className="px-3 py-4 text-sm font-medium text-slate-500">
                No quick matches. Press Search for the full search page.
              </div>
            ) : null}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-forest-900">
            <Link href={searchUrl}>Open full results for &ldquo;{query.trim()}&rdquo;</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
