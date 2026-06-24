"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { SwitchImpactPanel, type SwitchImpactSide } from "@/components/switches/switch-impact-panel";

export type PendingSwitchCardData = {
  id: string;
  typeLabel: string;
  periodLabel: string;
  requestedBy: string | null;
  createdAtLabel: string;
  /** Name of the area the request originates from, e.g. "Outdoor Ed". */
  fromAreaName: string | null;
  reason: string | null;
  person: {
    name: string;
    cabinName: string | null;
    unitLabel: string | null;
    swimLabel: string | null;
    /** "Leaves after Weeks 5-6" when the camper departs early. */
    departureNote: string | null;
  };
  leaving: SwitchImpactSide;
  joining: SwitchImpactSide;
};

export function PendingSwitchCard({
  data,
  canDecide,
  decideAction
}: {
  data: PendingSwitchCardData;
  canDecide: boolean;
  decideAction: (formData: FormData) => void | Promise<void>;
}) {
  const [denying, setDenying] = useState(false);

  const personMeta = [data.person.cabinName, data.person.unitLabel, data.person.swimLabel].filter(Boolean);

  return (
    <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-amber-700">
            Pending · {data.typeLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{data.createdAtLabel}</p>
        </div>
        <div className="text-right">
          {data.requestedBy ? (
            <p className="text-xs font-semibold text-slate-700">Requested by {data.requestedBy}</p>
          ) : null}
          {data.fromAreaName ? (
            <p className="mt-0.5 text-xs text-slate-500">From: {data.fromAreaName} area</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-base font-black uppercase tracking-wide text-forest-900">{data.person.name}</p>
        {personMeta.length ? (
          <p className="text-sm text-slate-600">{personMeta.join("  ·  ")}</p>
        ) : null}
        {data.person.departureNote ? (
          <p className="mt-1 text-sm font-semibold text-amber-700">⚠ {data.person.departureNote}</p>
        ) : null}
      </div>

      <SwitchImpactPanel className="mt-4" leaving={data.leaving} joining={data.joining} />

      {data.reason ? (
        <p className="mt-4 text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Reason: </span>
          <span className="italic">&ldquo;{data.reason}&rdquo;</span>
        </p>
      ) : null}

      {canDecide ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {denying ? (
            <form action={decideAction} className="grid gap-3">
              <input name="id" type="hidden" value={data.id} />
              <input name="decision" type="hidden" value="deny" />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Reason for denial (optional)</span>
                <textarea
                  name="denyReason"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-lake-500 focus:ring-2 focus:ring-lake-100"
                  placeholder="Shown in history."
                  autoFocus
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 shadow-sm transition hover:bg-red-50"
                >
                  Confirm denial
                </button>
                <button
                  type="button"
                  onClick={() => setDenying(false)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDenying(true)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Deny <ChevronDown className="h-4 w-4" />
              </button>
              <form action={decideAction}>
                <input name="id" type="hidden" value={data.id} />
                <input name="decision" type="hidden" value="approve" />
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-forest-800"
                >
                  Approve <Check className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}
