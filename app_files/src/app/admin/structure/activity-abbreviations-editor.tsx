"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { inputClass } from "@/components/ui";

type ActivityRow = {
  id: string;
  name: string;
  area: string;
  abbreviation: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Visual goals (Mike's feedback: the grid form didn't make sense):
 *  - One row per activity. Full name visible, never truncated.
 *  - Area headers as plain dividers between groups so the page is scannable
 *    top-to-bottom without jumping between columns.
 *  - The abbreviation input is the right-hand side of every row, aligned
 *    consistently — feels like a settings page, not a form.
 *  - Autosave on blur. No big "Save All" button to hunt for. After each save
 *    the row shows a small ✓ for a beat, then fades out.
 *  - A search box at the top filters as you type so finding "paddle" or
 *    "ski" is instant in a long list.
 *  - "Clear" button on each row deletes that activity's abbreviation in one
 *    click (saves immediately).
 */
export function ActivityAbbreviationsEditor({ activities }: { activities: ActivityRow[] }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(activities.map((activity) => [activity.id, activity.abbreviation ?? ""]))
  );
  // Track what was last successfully saved so blur events with no real change
  // don't fire a redundant PATCH and re-flash the ✓ indicator.
  const [savedValues, setSavedValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(activities.map((activity) => [activity.id, activity.abbreviation ?? ""]))
  );
  const [statusMap, setStatusMap] = useState<Record<string, SaveStatus>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? activities.filter(
          (activity) =>
            activity.name.toLowerCase().includes(normalized) ||
            activity.area.toLowerCase().includes(normalized) ||
            (activity.abbreviation ?? "").toLowerCase().includes(normalized)
        )
      : activities;
    // Preserve the page's existing area sort order by walking the filtered
    // list in order and bucketing as we go.
    const byArea: Array<{ area: string; rows: ActivityRow[] }> = [];
    for (const activity of filtered) {
      let bucket = byArea[byArea.length - 1];
      if (!bucket || bucket.area !== activity.area) {
        bucket = { area: activity.area, rows: [] };
        byArea.push(bucket);
      }
      bucket.rows.push(activity);
    }
    return byArea;
  }, [activities, query]);

  async function save(activityId: string, next: string) {
    const trimmed = next.trim();
    if ((savedValues[activityId] ?? "") === trimmed) {
      // No real change; clear any stale error indicator and exit.
      setStatusMap((current) => {
        if (!current[activityId]) return current;
        const updated = { ...current };
        delete updated[activityId];
        return updated;
      });
      return;
    }
    setStatusMap((current) => ({ ...current, [activityId]: "saving" }));
    setErrorMap((current) => {
      if (!current[activityId]) return current;
      const updated = { ...current };
      delete updated[activityId];
      return updated;
    });
    try {
      const response = await fetch(`/api/activities/${activityId}/abbreviation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abbreviation: trimmed })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setStatusMap((current) => ({ ...current, [activityId]: "error" }));
        setErrorMap((current) => ({ ...current, [activityId]: data.error ?? "Save failed." }));
        return;
      }
      setSavedValues((current) => ({ ...current, [activityId]: trimmed }));
      setValues((current) => ({ ...current, [activityId]: trimmed }));
      setStatusMap((current) => ({ ...current, [activityId]: "saved" }));
      // Fade the ✓ after a beat so the row settles back to clean.
      window.setTimeout(() => {
        setStatusMap((current) => {
          if (current[activityId] !== "saved") return current;
          const updated = { ...current };
          delete updated[activityId];
          return updated;
        });
      }, 1500);
    } catch {
      setStatusMap((current) => ({ ...current, [activityId]: "error" }));
      setErrorMap((current) => ({ ...current, [activityId]: "Network error." }));
    }
  }

  function handleChange(activityId: string, value: string) {
    setValues((current) => ({ ...current, [activityId]: value.toUpperCase().slice(0, 8) }));
  }

  function clearOne(activityId: string) {
    setValues((current) => ({ ...current, [activityId]: "" }));
    save(activityId, "");
  }

  const totalCount = activities.length;
  const visibleCount = groups.reduce((acc, group) => acc + group.rows.length, 0);

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Activity Abbreviations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Short codes used on staff schedules (live view, print, exports). For example, type <span className="font-black">SUP</span> next to Stand Up Paddleboard. Leave blank to keep the full activity name. Camper rosters / menus / cards always show the full name. Period 5A/5B at the lake still shows <span className="font-black">TUBE</span> regardless. Saves automatically as you tab out of each field.
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-paper/60 px-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          aria-label="Filter activities"
          className="min-h-10 flex-1 bg-transparent text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter activities by name, area, or abbreviation…"
          type="search"
          value={query}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear filter"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <span className="text-xs font-bold text-slate-400">{visibleCount} of {totalCount}</span>
      </div>

      {groups.length ? (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {groups.map((group) => (
            <div key={group.area}>
              <div className="bg-paper/50 px-4 py-2">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-slate-500">{group.area}</p>
              </div>
              <ul>
                {group.rows.map((activity) => {
                  const status = statusMap[activity.id] ?? "idle";
                  const error = errorMap[activity.id];
                  return (
                    <li key={activity.id} className="flex items-center gap-3 border-t border-slate-100 px-4 py-2.5 first:border-t-0">
                      <span className="min-w-0 flex-1 text-sm font-bold text-slate-800" title={activity.name}>{activity.name}</span>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Abbreviation for ${activity.name}`}
                          className={`${inputClass} w-28 text-center font-black uppercase tracking-wider`}
                          maxLength={8}
                          onBlur={(event) => save(activity.id, event.target.value)}
                          onChange={(event) => handleChange(activity.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                          placeholder="—"
                          spellCheck={false}
                          value={values[activity.id] ?? ""}
                        />
                        <div className="grid w-6 place-items-center">
                          {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                          {status === "saved" ? <Check className="h-4 w-4 text-green-600" /> : null}
                          {status === "error" ? <span className="text-base font-black text-red-600" title={error ?? "Save failed"}>!</span> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => clearOne(activity.id)}
                          disabled={!values[activity.id]}
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
                          title="Clear abbreviation"
                          aria-label={`Clear abbreviation for ${activity.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-bold text-slate-500">
          No activities match &quot;{query}&quot;.
        </p>
      )}
    </section>
  );
}
