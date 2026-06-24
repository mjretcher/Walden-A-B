import clsx from "clsx";

export type SwitchImpactSide = {
  /** "leaving" renders with a bark/amber accent, "joining" with a forest accent. */
  kind: "leaving" | "joining";
  areaName: string;
  activityName: string;
  periodLabel: string;
  /** "Enrollment" for camper switches, "Staffed" for staff switches. */
  metricLabel: string;
  /** Current count before the switch is applied. */
  before: number;
  /** Prospective count if the switch is approved. */
  after: number;
  /** "of 12 max" (camper) or "target 2" (staff). Optional. */
  capacityNote?: string | null;
  /** Tone for the prospective count: green = ok, amber = watch, red = over. */
  countTone?: "ok" | "warn" | "over";
  /** Comma-separated staff names, or "No staff assigned". */
  staff: string;
  /** Render the staff line in amber when no staff are assigned. */
  staffWarn?: boolean;
};

const countToneClass: Record<NonNullable<SwitchImpactSide["countTone"]>, string> = {
  ok: "text-forest-800",
  warn: "text-amber-700",
  over: "text-red-700"
};

function ImpactCard({ side }: { side: SwitchImpactSide }) {
  const accent =
    side.kind === "leaving"
      ? "border-orange-200 bg-orange-50/60"
      : "border-forest-200 bg-forest-50/60";
  const eyebrow = side.kind === "leaving" ? "text-bark" : "text-forest-700";

  return (
    <div className={clsx("rounded-xl border p-4", accent)}>
      <p className={clsx("text-[0.65rem] font-black uppercase tracking-[0.18em]", eyebrow)}>
        {side.kind === "leaving" ? "Leaving" : "Joining"}
      </p>
      <p className="mt-1 text-sm font-bold text-forest-900">{side.areaName}</p>
      <p className="text-sm font-semibold text-slate-700">
        {side.activityName} · {side.periodLabel}
      </p>

      <div className="mt-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-700">{side.metricLabel}: </span>
        <span className="font-bold text-slate-500">{side.before}</span>
        <span className="px-1 text-slate-400">→</span>
        <span className={clsx("font-black", countToneClass[side.countTone ?? "ok"])}>{side.after}</span>
        {side.capacityNote ? <span className="ml-1 text-xs text-slate-500">({side.capacityNote})</span> : null}
      </div>

      <p className={clsx("mt-2 text-xs", side.staffWarn ? "font-semibold text-amber-700" : "text-slate-500")}>
        <span className="font-semibold text-slate-600">Staff: </span>
        {side.staff}
      </p>
    </div>
  );
}

/**
 * Side-by-side leaving/joining impact cards. Shared between the hub pending
 * queue (Section 4) and the Step 3 confirm screen. Both columns show the
 * prospective count — what enrollment/staffing becomes if approved.
 */
export function SwitchImpactPanel({
  leaving,
  joining,
  className
}: {
  leaving: SwitchImpactSide;
  joining: SwitchImpactSide;
  className?: string;
}) {
  return (
    <div className={clsx("grid gap-3 sm:grid-cols-2", className)}>
      <ImpactCard side={leaving} />
      <ImpactCard side={joining} />
    </div>
  );
}
