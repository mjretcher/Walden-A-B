/**
 * The compact "<period> <activity>  count/limit" tile from the Registration
 * Day live dashboard's Class Fill board.
 *
 * Lifted out of live-dashboard.tsx so the standalone /class-fill page can
 * show the exact same tile rather than growing a second, drifting copy. The
 * live dashboard still owns its own filter state (its area filter also
 * narrows the Latest Registrations feed), so only the tile is shared.
 */
export type FillOffering = {
  id: string;
  period: string;
  activity: string;
  area: string;
  count: number;
  limit?: number | null;
};

export function FillCard({ offering }: { offering: FillOffering }) {
  const pct = offering.limit ? Math.min(100, Math.round((offering.count / offering.limit) * 100)) : null;
  const full = offering.limit != null && offering.count >= offering.limit;
  return (
    <div className="rounded-lg border border-slate-100 p-2.5">
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
}
