"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";

type QuickSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export function GlobalSearchTypeahead({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
      } catch (error) {
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

  return (
    <div className="relative">
      <form className="flex flex-col gap-3 sm:flex-row" action="/search" method="get">
        <input
          autoFocus
          autoComplete="off"
          className={`${inputClass} flex-1 bg-white`}
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search camper, staff, activity, area, or cabin"
          value={query}
        />
        <button className={buttonClass} type="submit">Search</button>
      </form>

      {query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "Searching..." : `${results.length} quick result${results.length === 1 ? "" : "s"}`}
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {results.map((result) => (
              <Link key={result.id} className="block rounded-xl px-3 py-2 transition hover:bg-lake-50" href={result.href}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-forest-900">{result.title}</p>
                    <p className="text-sm text-slate-500">{result.subtitle}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{result.type}</span>
                </div>
              </Link>
            ))}
            {!loading && !results.length ? (
              <div className="px-3 py-4 text-sm font-medium text-slate-500">
                No quick matches. Press Search for the full search page.
              </div>
            ) : null}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-forest-900">
            <Link href={searchUrl}>Open full results for “{query.trim()}”</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
