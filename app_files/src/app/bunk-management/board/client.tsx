"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, GripVertical, Radio, Search, X } from "lucide-react";
import { Gender, Unit } from "@prisma/client";
import { Panel, SectionHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { assignStaffToCabin, unassignStaff } from "./actions";

type CabinData = {
  id: string;
  name: string;
  unit: Unit;
  beds: number;
  campers: string[];
  cas: string[];
};

type StaffData = {
  id: string;
  name: string;
  roleLabel: string | null;
  roleSuffix: string;
  isLifeguard: boolean;
  preferences: { unit: string; rank: number }[];
};

const UNIT_LABEL: Record<Unit, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

function ord(n: number) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function BunkBoardClient({
  sessionId,
  gender,
  cabins,
  staff: allStaff,
  initialAssignments
}: {
  sessionId: string;
  gender: Gender;
  cabins: CabinData[];
  staff: StaffData[];
  initialAssignments: { staffId: string; cabinId: string }[];
}) {
  const [assignments, setAssignments] = useState<Map<string, string>>(
    () => new Map(initialAssignments.map((a) => [a.staffId, a.cabinId]))
  );
  const [error, setError] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState("");
  const [, startTransition] = useTransition();
  const staffById = useMemo(() => new Map(allStaff.map((s) => [s.id, s])), [allStaff]);

  // ---- Live sync ----------------------------------------------------------
  // Figma-style collaboration on a polling budget: every 5s (visible tab
  // only) pull the session's full assignment map and merge other admins'
  // moves straight into the board — no reload, no banner for this class of
  // change. pendingOpsRef guards the merge so a poll landing mid-drag can
  // never clobber an optimistic update before the server confirms it.
  // Freshly-moved chips get a brief highlight ring so a move made on
  // someone else's device is visible, not just silently different.
  const pendingOpsRef = useRef(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/bunk-board/state?sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok || cancelled) return;
        const data: { assignments: { staffId: string; cabinId: string }[] } = await response.json();
        if (cancelled || pendingOpsRef.current > 0) return;
        const incoming = new Map(data.assignments.map((a) => [a.staffId, a.cabinId]));
        setAssignments((current) => {
          const changed = new Set<string>();
          for (const [staffId, cabinId] of incoming) {
            if (current.get(staffId) !== cabinId) changed.add(staffId);
          }
          for (const staffId of current.keys()) {
            if (!incoming.has(staffId)) changed.add(staffId);
          }
          if (changed.size === 0) return current;
          setChangedIds((prev) => new Set([...prev, ...changed]));
          if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = window.setTimeout(() => setChangedIds(new Set()), 3000);
          return incoming;
        });
        setLastSync(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      } catch {
        // Missed poll — next one is 5s away.
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 5000);
    poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [sessionId]);
  // -------------------------------------------------------------------------

  const pool = allStaff.filter((s) => !assignments.has(s.id));
  const filteredPool = poolSearch.trim()
    ? pool.filter((s) => s.name.toLowerCase().includes(poolSearch.trim().toLowerCase()))
    : pool;

  function assign(staffId: string, cabinId: string) {
    const previous = assignments.get(staffId) ?? null;
    setError(null);
    setAssignments((prev) => new Map(prev).set(staffId, cabinId));
    const formData = new FormData();
    formData.set("staffId", staffId);
    formData.set("cabinId", cabinId);
    formData.set("sessionId", sessionId);
    startTransition(async () => {
      pendingOpsRef.current += 1;
      try {
        const result = await assignStaffToCabin(formData);
        if (!result.ok) {
          setError(result.error);
          setAssignments((prev) => {
            const next = new Map(prev);
            if (previous) next.set(staffId, previous);
            else next.delete(staffId);
            return next;
          });
        }
      } finally {
        pendingOpsRef.current -= 1;
      }
    });
  }

  function unassign(staffId: string) {
    const previous = assignments.get(staffId) ?? null;
    setError(null);
    setAssignments((prev) => {
      const next = new Map(prev);
      next.delete(staffId);
      return next;
    });
    const formData = new FormData();
    formData.set("staffId", staffId);
    formData.set("sessionId", sessionId);
    startTransition(async () => {
      pendingOpsRef.current += 1;
      try {
        const result = await unassignStaff(formData);
        if (!result.ok) {
          setError(result.error);
          if (previous) setAssignments((prev) => new Map(prev).set(staffId, previous));
        }
      } finally {
        pendingOpsRef.current -= 1;
      }
    });
  }

  function handleDrop(e: React.DragEvent, cabinId: string) {
    e.preventDefault();
    const staffId = e.dataTransfer.getData("text/plain");
    if (!staffId) return;
    assign(staffId, cabinId);
  }

  const grouped = useMemo(() => {
    const units = Array.from(new Set(cabins.map((c) => c.unit))).sort();
    return units.map((unit) => ({ unit, cabins: cabins.filter((c) => c.unit === unit) }));
  }, [cabins]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="?gender=MALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "MALE" ? "border-lake-500 bg-lake-50" : ""}`}>Boys</Link>
        <Link href="?gender=FEMALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "FEMALE" ? "border-lake-500 bg-lake-50" : ""}`}>Girls</Link>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-black text-forest-800">
          <Radio className="h-3.5 w-3.5" />
          {lastSync ? `Live sync · ${lastSync}` : "Live sync · connecting…"}
        </span>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full flex-shrink-0 lg:w-64">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
            Unassigned staff ({filteredPool.length}{poolSearch.trim() ? ` of ${pool.length}` : ""})
          </p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} h-9 pl-8 text-sm`}
              placeholder="Search staff…"
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
            />
          </div>
          <p className="mb-2 text-[11px] text-slate-400">*Lifeguard certified</p>
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
            {filteredPool.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm font-bold text-slate-800 shadow-soft active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{s.isLifeguard ? "*" : ""}{s.name}</span>
                {s.roleLabel ? <span className="shrink-0 text-[10px] font-bold text-slate-400">{s.roleLabel}</span> : null}
              </div>
            ))}
            {filteredPool.length === 0 ? <p className="text-xs text-slate-400">{pool.length === 0 ? "Everyone's assigned." : "No matches."}</p> : null}
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          {grouped.map(({ unit, cabins: unitCabins }) => (
            <Panel key={unit}>
              <SectionHeader title={UNIT_LABEL[unit]} detail={`${unitCabins.length} cabin${unitCabins.length === 1 ? "" : "s"}`} />
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unitCabins.map((cabin) => {
                  const assignedHere = Array.from(assignments.entries())
                    .filter(([, cabinId]) => cabinId === cabin.id)
                    .map(([staffId]) => staffById.get(staffId))
                    .filter((s): s is StaffData => Boolean(s));
                  const headcount = cabin.campers.length + cabin.cas.length + assignedHere.length;
                  const overCapacity = cabin.beds > 0 && headcount > cabin.beds;

                  return (
                    <div key={cabin.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, cabin.id)}>
                      {/* Report-style box: same visual language as the print view -- campers
                          always visible, no expand/collapse, per direct feedback. */}
                      <div className="rounded-lg border-2 border-slate-800 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-forest-900">{cabin.name}</span>
                          {overCapacity ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-800">
                              <AlertTriangle className="h-3 w-3" />OVER CAPACITY
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">{headcount}{cabin.beds > 0 ? `/${cabin.beds}` : ""} beds</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-700">
                          {cabin.campers.length ? cabin.campers.join(", ") : <span className="text-slate-400">No campers yet.</span>}
                        </p>
                        {cabin.cas.length ? (
                          <p className="mt-1 text-sm text-slate-500">{cabin.cas.map((c) => `${c} (CA)`).join(", ")}</p>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-col gap-2">
                        {assignedHere.map((s) => (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                            className={`flex cursor-grab items-center gap-2 rounded-lg border p-2 text-sm active:cursor-grabbing ${changedIds.has(s.id) ? "border-lake-400 bg-lake-50 ring-2 ring-lake-300" : "border-slate-200 bg-slate-50"}`}
                          >
                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold text-slate-800">
                                {s.isLifeguard ? "*" : ""}{s.name}{s.roleSuffix}
                              </p>
                              {(() => {
                                const prefRank = s.preferences.find((p) => p.unit === cabin.unit)?.rank ?? null;
                                return prefRank ? (
                                  <p className={`text-[11px] font-bold ${prefRank === 1 ? "text-green-700" : "text-slate-400"}`}>{ord(prefRank)} choice</p>
                                ) : null;
                              })()}
                            </div>
                            <button type="button" aria-label="Remove" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => unassign(s.id)}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <p className="rounded-lg border border-dashed border-slate-300 p-2 text-center text-xs text-slate-400">Drop staff here</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
