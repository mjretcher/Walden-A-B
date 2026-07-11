"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { buttonClass, inputClass, Panel, SectionHeader } from "@/components/ui";
import { saveSlotTimes } from "./actions";

const SLOT_DESCRIPTION: Record<number, string> = {
  1: "First morning period",
  2: "Second morning period",
  3: "First afternoon period",
  4: "Second afternoon period",
  5: "Twilight (staff periods only)"
};

export function PeriodTimesForm({
  slots
}: {
  slots: { slot: number; startValue: string; endValue: string; label: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSlotTimes(formData);
      if (result.ok) setSaved(true);
      else setError(result.error ?? "Something went wrong saving the times.");
    });
  }

  return (
    <Panel>
      <SectionHeader
        title="Class times"
        detail="Shared by A and B days — period 1 runs the same clock hours whether it's 1A or 1B. Right Now uses these to auto-detect the current period."
      />
      <form action={handleSubmit} className="grid gap-3">
        {slots.map(({ slot, startValue, endValue, label }) => (
          <div key={slot} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
            <div className="min-w-40">
              <p className="font-black text-forest-900">Period {slot}{slot === 5 ? " · Twilight" : ""}</p>
              <p className="text-xs font-bold text-slate-500">{SLOT_DESCRIPTION[slot]} · currently {label}</p>
            </div>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Start
              <input type="time" name={`start-${slot}`} defaultValue={startValue} required className={inputClass} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              End
              <input type="time" name={`end-${slot}`} defaultValue={endValue} required className={inputClass} />
            </label>
          </div>
        ))}

        {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
        {saved ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-green-700">
            <CheckCircle2 className="h-4 w-4" />Saved — Right Now and Trip Planner are using the new times.
          </p>
        ) : null}

        <div>
          <button type="submit" disabled={isPending} className={buttonClass}>
            {isPending ? "Saving…" : "Save times"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
