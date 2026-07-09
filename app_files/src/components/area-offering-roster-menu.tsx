"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, RefreshCw } from "lucide-react";

type RosterCamper = { id: string; name: string; cabinName: string | null; unitLabel: string; departureNote: string | null };

// Reuses the same roster endpoint the switches flow already relies on for
// its inline "View roster" toggle — same access rules (exec admin sees any
// offering, area heads only their own area), same shape of data.
export function AreaOfferingRosterMenu({ offeringId, activityName }: { offeringId: string; activityName: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterCamper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && roster === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/switches/offering-roster?offeringId=${encodeURIComponent(offeringId)}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ?? "Could not load roster.");
          return;
        }
        const body = await response.json();
        setRoster(Array.isArray(body.campers) ? body.campers : []);
      } catch {
        setError("Could not load roster.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`View roster for ${activityName}`}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm normal-case tracking-normal text-slate-700 shadow-2xl">
          <p className="mb-2 truncate text-xs font-black uppercase tracking-wide text-slate-500">{activityName} roster</p>
          {loading ? (
            <p className="flex items-center gap-1.5 text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading roster…
            </p>
          ) : error ? (
            <p className="font-medium text-red-700">{error}</p>
          ) : roster && roster.length ? (
            <div className="grid max-h-64 gap-1.5 overflow-y-auto">
              <p className="text-xs font-bold text-slate-400">{roster.length} campers enrolled</p>
              {roster.map((camper) => (
                <div
                  key={camper.id}
                  className="flex flex-wrap items-center justify-between gap-x-2 border-t border-slate-100 pt-1.5 first:border-t-0 first:pt-0"
                >
                  <span className="font-semibold text-slate-800">{camper.name}</span>
                  <span className="text-xs text-slate-500">
                    {[camper.cabinName, camper.unitLabel].filter(Boolean).join(" · ")}
                    {camper.departureNote ? <span className="ml-1 font-semibold text-amber-700">⚠ {camper.departureNote}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">No campers enrolled yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
