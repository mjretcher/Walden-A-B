"use client";

import { useState } from "react";
import Link from "next/link";
import { LimitType } from "@prisma/client";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import type { EligibilityVerdict } from "@/lib/switch-eligibility";

export type OfferingCardData = {
  offeringId: string;
  registrationId: string;
  areaName: string;
  activityName: string;
  periodLabel: string;
  enrollmentCount: number;
  rosterLimit: number | null;
  limitType: LimitType;
  staffNames: string[];
  verdict: EligibilityVerdict;
};

type RosterCamper = { id: string; name: string; cabinName: string | null; unitLabel: string; departureNote: string | null };

const verdictStyles: Record<EligibilityVerdict["tone"], { box: string; text: string; icon: string }> = {
  ok: { box: "border-forest-200 bg-forest-50", text: "text-forest-800", icon: "✅" },
  warn: { box: "border-amber-200 bg-amber-50", text: "text-amber-800", icon: "⚠" },
  block: { box: "border-red-200 bg-red-50", text: "text-red-700", icon: "🔴" },
  current: { box: "border-slate-200 bg-slate-50", text: "text-slate-500", icon: "" }
};

function enrollmentLabel(count: number, limit: number | null, limitType: LimitType): string {
  if (limitType === LimitType.UNLIMITED) return "Unlimited";
  if (limit == null) return "Approval Required";
  return `${count} / ${limit}`;
}

function limitTypeNote(limitType: LimitType): string | null {
  if (limitType === LimitType.FLEXIBLE) return "Limit is a guide — override allowed";
  if (limitType === LimitType.UNLIMITED) return "No roster limit";
  if (limitType === LimitType.SPECIAL_APPROVAL) return "Approval required to enroll";
  return null;
}

function barFill(count: number, limit: number | null, limitType: LimitType): { width: string; color: string } {
  if (limitType === LimitType.UNLIMITED || limit == null) return { width: "100%", color: "bg-lake-300" };
  const ratio = limit === 0 ? 1 : count / limit;
  const width = `${Math.min(ratio, 1) * 100}%`;
  if (ratio >= 1) return { width, color: "bg-red-500" };
  if (ratio >= 0.75) return { width, color: "bg-amber-400" };
  return { width, color: "bg-forest-500" };
}

export function OfferingCard({ data }: { data: OfferingCardData }) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const [roster, setRoster] = useState<RosterCamper[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { verdict } = data;
  const isCurrent = verdict.tone === "current";
  const styles = verdictStyles[verdict.tone];
  const fill = barFill(data.enrollmentCount, data.rosterLimit, data.limitType);
  const note = limitTypeNote(data.limitType);

  async function toggleRoster() {
    const next = !rosterOpen;
    setRosterOpen(next);
    if (next && roster === null && !loading) {
      setLoading(true);
      setRosterError(null);
      try {
        const response = await fetch(`/api/switches/offering-roster?offeringId=${encodeURIComponent(data.offeringId)}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setRosterError(body.error ?? "Could not load roster.");
          return;
        }
        const body = await response.json();
        setRoster(Array.isArray(body.campers) ? body.campers : []);
      } catch {
        setRosterError("Could not load roster.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <article className={`flex flex-col rounded-2xl border bg-white p-4 shadow-soft ${isCurrent ? "opacity-70" : ""}`}>
      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lake-700">{data.areaName}</p>
      <h3 className="mt-0.5 text-base font-bold text-forest-900">{data.activityName}</h3>
      <p className="text-xs font-semibold text-slate-500">Period {data.periodLabel}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>{enrollmentLabel(data.enrollmentCount, data.rosterLimit, data.limitType)}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${fill.color}`} style={{ width: fill.width }} />
        </div>
        {note ? <p className="mt-1 text-[0.7rem] font-medium text-slate-500">{note}</p> : null}
      </div>

      <p className={`mt-3 text-xs ${data.staffNames.length ? "text-slate-500" : "font-semibold text-amber-700"}`}>
        <span className="font-semibold text-slate-600">Staff: </span>
        {data.staffNames.length ? data.staffNames.join(", ") : "No staff assigned"}
      </p>

      {!isCurrent ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${styles.box} ${styles.text}`}>
          {styles.icon ? <span className="mr-1">{styles.icon}</span> : null}
          {verdict.label}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
          Current offering
        </div>
      )}

      <div className="mt-3 flex flex-1 flex-col justify-end gap-3">
        <button
          type="button"
          onClick={toggleRoster}
          aria-expanded={rosterOpen}
          className="inline-flex items-center gap-1 text-sm font-semibold text-lake-700 hover:underline"
        >
          {rosterOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          View roster
        </button>

        {rosterOpen ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {loading ? (
              <p className="text-slate-500">Loading roster…</p>
            ) : rosterError ? (
              <p className="font-medium text-red-700">{rosterError}</p>
            ) : roster && roster.length ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{roster.length} campers enrolled</p>
                {roster.map((camper) => (
                  <div key={camper.id} className="flex flex-wrap items-center justify-between gap-x-2 text-slate-700">
                    <span className="font-semibold">{camper.name}</span>
                    <span className="text-xs text-slate-500">
                      {[camper.cabinName, camper.unitLabel].filter(Boolean).join(" · ")}
                      {camper.departureNote ? <span className="ml-2 font-semibold text-amber-700">⚠ {camper.departureNote}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No campers enrolled yet.</p>
            )}
          </div>
        ) : null}

        {isCurrent ? null : verdict.selectable ? (
          <Link
            href={`/switches/new/confirm?registrationId=${data.registrationId}&offeringId=${data.offeringId}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-lake-700"
          >
            {verdict.selectLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title={verdict.disabledReason ?? "Not available"}
            className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-400"
          >
            {verdict.disabledReason ?? "Unavailable"}
          </button>
        )}
      </div>
    </article>
  );
}
