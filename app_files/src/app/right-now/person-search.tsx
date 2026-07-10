"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserRound, Users, X } from "lucide-react";
import { inputClass } from "@/components/ui";

/**
 * The Right Now search box: type a name, pick a camper or staff member,
 * and the page answers "where are they right now." Reuses the existing
 * /api/search/quick endpoint (same one behind the global sidebar search)
 * rather than inventing a second person-search — one search brain, one
 * set of matching rules.
 */

type QuickResult = { id: string; type: string; title: string; subtitle?: string };

export function RightNowPersonSearch({ selectedName }: { selectedName: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/quick?q=${encodeURIComponent(q)}`);
        if (!response.ok) return;
        const data = await response.json();
        const people = (data.results ?? []).filter((r: QuickResult) => r.type === "Camper" || r.type === "Staff").slice(0, 8);
        setResults(people);
        setOpen(true);
      } catch {
        // Network hiccup — the user can just keep typing.
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(result: QuickResult) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("camperId");
    next.delete("staffId");
    const rawId = result.id.replace(/^(camper|staff)-/, "");
    if (result.type === "Camper") next.set("camperId", rawId);
    else next.set("staffId", rawId);
    setQuery("");
    setOpen(false);
    router.push(`/right-now?${next.toString()}`);
  }

  function clearPerson() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("camperId");
    next.delete("staffId");
    router.push(`/right-now?${next.toString()}`);
  }

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputClass} min-h-12 pl-9 pr-9 text-base`}
          placeholder="Where is… (type a camper or staff name)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {selectedName ? (
          <button
            type="button"
            aria-label="Clear selected person"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={clearPerson}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && results.length > 0 ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm font-bold text-slate-800 last:border-b-0 hover:bg-forest-50"
              onClick={() => pick(r)}
            >
              {r.type === "Camper" ? <Users className="h-4 w-4 shrink-0 text-forest-600" /> : <UserRound className="h-4 w-4 shrink-0 text-lake-600" />}
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-400">{r.type}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
