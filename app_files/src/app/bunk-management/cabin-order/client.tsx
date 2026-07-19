"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearUnitCabinOrder, saveUnitCabinOrder } from "./actions";

type CabinRow = { id: string; name: string; sortOrder: number | null };
type Group = { gender: "MALE" | "FEMALE"; unit: string; cabins: CabinRow[] };

const UNIT_LABEL: Record<string, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

/**
 * One card per unit, cabins listed top-to-bottom in print order with
 * ▲/▼ arrows. Local-state editing with an explicit Save per unit (unlike
 * the instant-save Out of Cabin toggles): a half-finished drag of a
 * whole unit's order shouldn't hit paper, and the server action writes
 * whole units atomically anyway.
 */
export function CabinOrderClient({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [state, setState] = useState(() =>
    Object.fromEntries(groups.map((group) => [groupKey(group), group.cabins]))
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function move(key: string, index: number, delta: -1 | 1) {
    setState((prev) => {
      const list = [...prev[key]];
      const target = index + delta;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [key]: list };
    });
    setDirty((prev) => ({ ...prev, [key]: true }));
  }

  function run(key: string, work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy((prev) => ({ ...prev, [key]: true }));
    setError(null);
    startTransition(async () => {
      const result = await work();
      setBusy((prev) => ({ ...prev, [key]: false }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty((prev) => ({ ...prev, [key]: false }));
      router.refresh();
    });
  }

  return (
    <div>
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div> : null}
      {(["MALE", "FEMALE"] as const).map((gender) => (
        <div key={gender} className="mb-8">
          <h2 className="mb-3 text-lg font-black text-forest-900">{gender === "MALE" ? "Boys" : "Girls"}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {groups.filter((group) => group.gender === gender).map((group) => {
              const key = groupKey(group);
              const cabins = state[key];
              const handOrdered = cabins.some((cabin) => cabin.sortOrder !== null);
              return (
                <section key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-black text-forest-900">{UNIT_LABEL[group.unit] ?? group.unit}</h3>
                    <span className={`text-[10px] font-black uppercase ${handOrdered ? "text-lake-600" : "text-slate-400"}`}>
                      {handOrdered ? "Hand-ordered" : "Automatic"}
                    </span>
                  </div>
                  <ol>
                    {cabins.map((cabin, index) => (
                      <li key={cabin.id} className="flex items-center justify-between border-t border-slate-100 py-1 first:border-t-0">
                        <span className="text-sm font-bold text-slate-800">
                          <span className="mr-2 inline-block w-4 text-right text-xs font-black text-slate-400">{index + 1}.</span>
                          {cabin.name}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${cabin.name} up`}
                            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-25"
                            disabled={index === 0 || busy[key]}
                            onClick={() => move(key, index, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${cabin.name} down`}
                            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-25"
                            disabled={index === cabins.length - 1 || busy[key]}
                            onClick={() => move(key, index, 1)}
                          >
                            ▼
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-black text-white hover:bg-forest-800 disabled:opacity-40"
                      disabled={busy[key] || !dirty[key]}
                      onClick={() => run(key, () => saveUnitCabinOrder(cabins.map((cabin) => cabin.id)))}
                    >
                      {busy[key] ? "Saving…" : "Save order"}
                    </button>
                    {handOrdered ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={busy[key]}
                        onClick={() => run(key, () => clearUnitCabinOrder(cabins.map((cabin) => cabin.id)))}
                      >
                        Reset to automatic
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupKey(group: { gender: string; unit: string }): string {
  return `${group.gender}:${group.unit}`;
}
