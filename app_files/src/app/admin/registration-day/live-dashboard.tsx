"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Users } from "lucide-react";

type LiveData = {
  event: { id: string; name: string } | null;
  guests: { id: string; name: string; area: string | null; activityCount: number | null; joinedAt: string; lastSeenAt: string; online: boolean }[];
  recent: { id: string; camper: string; activity: string; area: string; period: string; status: string; overridden: boolean; by: string; at: string }[];
  offerings: { id: string; period: string; activity: string; area: string; count: number; limit?: number | null }[];
};

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/**
 * Polls /api/event/live every 5s while the tab is visible. If the event
 * disappears server-side (closed from another device), refresh the page so
 * the panel flips back to the create form.
 */
export function LiveDashboard() {
  const router = useRouter();
  const [data, setData] = useState<LiveData | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/event/live");
        if (!response.ok) return;
        const payload = (await response.json()) as LiveData;
        if (cancelled) return;
        if (!payload.event) {
          router.refresh();
          return;
        }
        setData(payload);
      } catch {
        // transient poll failure — keep last data on screen
      }
    }
    poll();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  const periods = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.offerings.map((offering) => offering.period)));
  }, [data]);

  const visibleOfferings = useMemo(() => {
    if (!data) return [];
    return data.offerings.filter((offering) => periodFilter === "all" || offering.period === periodFilter);
  }, [data, periodFilter]);

  if (!data) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500 shadow-panel">Loading live data...</div>;
  }

  const onlineCount = data.guests.filter((guest) => guest.online).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-lake-700" />
            <h3 className="text-sm font-black uppercase tracking-wide text-forest-900">In the room</h3>
            <span className="rounded-lg bg-forest-100 px-2 py-0.5 text-xs font-black text-forest-800">{onlineCount} online / {data.guests.length} joined</span>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {!data.guests.length ? <p className="text-sm font-semibold text-slate-500">Nobody has joined yet — put the QR up.</p> : null}
            {data.guests.map((guest) => (
              <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" key={guest.id}>
                <span className="flex items-center gap-2 font-black text-slate-800">
                  <span className={`h-2 w-2 rounded-full ${guest.online ? "bg-green-500" : "bg-slate-300"}`} />
                  {guest.name}
                  {guest.area ? <span className="rounded bg-lake-100 px-1.5 py-0.5 text-[10px] font-black text-lake-800">{guest.area}{guest.activityCount ? ` · ${guest.activityCount}` : ""}</span> : null}
                </span>
                <span className="text-xs font-semibold text-slate-500">seen {timeAgo(guest.lastSeenAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-lake-700" />
            <h3 className="text-sm font-black uppercase tracking-wide text-forest-900">Latest registrations</h3>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {!data.recent.length ? <p className="text-sm font-semibold text-slate-500">Nothing yet.</p> : null}
            {data.recent.map((entry) => (
              <div className="rounded-lg border border-slate-100 px-3 py-2 text-sm" key={entry.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-slate-800">{entry.camper} → {entry.activity} <span className="text-slate-500">({entry.period})</span></span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{timeAgo(entry.at)}</span>
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  by {entry.by}
                  {entry.overridden ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-black text-red-700">OVERRIDE</span> : null}
                  {entry.status === "WAITLISTED" ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-black text-amber-700">WAITLIST</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black uppercase tracking-wide text-forest-900">Class fill</h3>
          <div className="flex flex-wrap gap-1.5">
            <button className={`rounded-lg px-2.5 py-1 text-xs font-black ${periodFilter === "all" ? "bg-forest-700 text-white" : "border border-slate-200 text-slate-700"}`} onClick={() => setPeriodFilter("all")} type="button">All</button>
            {periods.map((period) => (
              <button className={`rounded-lg px-2.5 py-1 text-xs font-black ${periodFilter === period ? "bg-forest-700 text-white" : "border border-slate-200 text-slate-700"}`} key={period} onClick={() => setPeriodFilter(period)} type="button">{period}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleOfferings.map((offering) => {
            const pct = offering.limit ? Math.min(100, Math.round((offering.count / offering.limit) * 100)) : null;
            const full = offering.limit != null && offering.count >= offering.limit;
            return (
              <div className="rounded-lg border border-slate-100 p-2.5" key={offering.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-black text-slate-800">{offering.period} {offering.activity}</span>
                  <span className={`shrink-0 text-xs font-black ${full ? "text-red-700" : "text-forest-800"}`}>{offering.count}{offering.limit != null ? `/${offering.limit}` : ""}</span>
                </div>
                <div className="truncate text-xs font-semibold text-slate-500">{offering.area}</div>
                {pct != null ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${full ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-forest-600"}`} style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
