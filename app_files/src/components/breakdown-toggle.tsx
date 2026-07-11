"use client";

import { useState } from "react";

/**
 * Show/hide toggle for the per-class unit breakdown chips. The breakdown
 * markup is always server-rendered inside each offering card (the data's
 * already fetched for the area-level table, so this costs nothing extra);
 * this wrapper just flips a data attribute that globals.css keys off to
 * reveal `.unit-breakdown` elements. Pure client-side visibility — no
 * refetch, no URL change, works instantly, and survives the live-refresh
 * poll because it's component state, not markup state.
 */
export function BreakdownToggle({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <div data-show-breakdown={show ? "true" : "false"}>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
          className="inline-flex min-h-10 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-lake-200 hover:bg-lake-50"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${show ? "bg-forest-600" : "bg-slate-300"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${show ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
          </span>
          Unit breakdown per class
        </button>
      </div>
      {children}
    </div>
  );
}
