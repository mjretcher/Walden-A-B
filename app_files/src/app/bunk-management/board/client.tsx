"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, GripVertical, History, Loader2, Radio, Search, Undo2, Wand2, X } from "lucide-react";
import { Gender, Unit } from "@prisma/client";
import { Panel, SectionHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { assignStaffToCabin, bulkAssignStaff, seedUnitPreferencesFromHistory, unassignStaff } from "./actions";

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

type AutoFillRow = {
  staffId: string;
  name: string;
  cabinId: string;
  cabinName: string;
  unitLabel: string;
  matchedPreference: boolean;
  wouldOverfill: boolean;
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

// Greedy, previewable auto-fill: confident placements (rank-1 preference)
// go first, then rank-2-only, then no-preference staff last -- so whatever
// capacity is left over is what the "anyone" group has to work with, not
// the other way around. Within a preferred unit, picks whichever cabin
// currently has the MOST room, spreading people evenly instead of stacking
// one cabin full before touching the next. Falls back to whichever cabin
// (any unit) has the most room if a person's preferred unit has none left,
// and as a last resort picks whichever is LEAST over capacity rather than
// silently skipping someone. Pure function of its inputs -- the actual
// commit happens separately via bulkAssignStaff once Mike confirms.
function computeAutoFillPlan(pool: StaffData[], cabins: CabinData[], startingHeadcount: Map<string, number>): AutoFillRow[] {
  if (cabins.length === 0) return [];
  const running = new Map(startingHeadcount);
  const roomIn = (cabin: CabinData) => (cabin.beds > 0 ? cabin.beds - (running.get(cabin.id) ?? 0) : Number.POSITIVE_INFINITY);

  const withRank1 = pool.filter((s) => s.preferences.some((p) => p.rank === 1));
  const withRank2Only = pool.filter((s) => !s.preferences.some((p) => p.rank === 1) && s.preferences.some((p) => p.rank === 2));
  const withNone = pool.filter((s) => s.preferences.length === 0);
  const ordered = [...withRank1, ...withRank2Only, ...withNone];

  const plan: AutoFillRow[] = [];
  for (const s of ordered) {
    const prefUnits = [...s.preferences].sort((a, b) => a.rank - b.rank).map((p) => p.unit as Unit);
    let chosen: CabinData | null = null;
    let matchedPreference = false;

    for (const unit of prefUnits) {
      const withRoom = cabins.filter((c) => c.unit === unit && roomIn(c) > 0);
      if (withRoom.length > 0) {
        chosen = withRoom.reduce((best, c) => (roomIn(c) > roomIn(best) ? c : best), withRoom[0]);
        matchedPreference = true;
        break;
      }
    }
    if (!chosen) {
      const withRoom = cabins.filter((c) => roomIn(c) > 0);
      chosen = withRoom.length > 0
        ? withRoom.reduce((best, c) => (roomIn(c) > roomIn(best) ? c : best), withRoom[0])
        : cabins.reduce((best, c) => (roomIn(c) > roomIn(best) ? c : best), cabins[0]);
    }

    const wouldOverfill = chosen.beds > 0 && (running.get(chosen.id) ?? 0) + 1 > chosen.beds;
    running.set(chosen.id, (running.get(chosen.id) ?? 0) + 1);
    plan.push({ staffId: s.id, name: s.name, cabinId: chosen.id, cabinName: chosen.name, unitLabel: UNIT_LABEL[chosen.unit], matchedPreference, wouldOverfill });
  }
  return plan;
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
  const router = useRouter();
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

  // ---- Click-to-place -------------------------------------------------
  // Alternative to dragging: click a staff card to "pick them up" (works
  // from the unassigned pool OR from inside a cabin, to move someone),
  // then click any cabin to place them there. Faster than a real drag for
  // a list this long, and the only option that works cleanly on a
  // trackpad or touch screen. Native drag still works exactly as before --
  // this is additive, not a replacement.
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedStaffId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleSelect(staffId: string) {
    setSelectedStaffId((current) => (current === staffId ? null : staffId));
  }
  // -----------------------------------------------------------------------

  // ---- Undo toast ---------------------------------------------------------
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string, onUndo: () => void) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ message, onUndo });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 6000);
  }
  // -------------------------------------------------------------------------

  const pool = allStaff.filter((s) => !assignments.has(s.id));
  const filteredPool = poolSearch.trim()
    ? pool.filter((s) => s.name.toLowerCase().includes(poolSearch.trim().toLowerCase()))
    : pool;

  // O(assignments) once per render instead of re-filtering the whole
  // assignment map for every single cabin -- also the shared source both
  // the board itself and the auto-fill planner read current headcounts from.
  const staffByCabin = useMemo(() => {
    const map = new Map<string, StaffData[]>();
    for (const [staffId, cabinId] of assignments.entries()) {
      const s = staffById.get(staffId);
      if (!s) continue;
      if (!map.has(cabinId)) map.set(cabinId, []);
      map.get(cabinId)!.push(s);
    }
    return map;
  }, [assignments, staffById]);

  function assign(staffId: string, cabinId: string, opts?: { silent?: boolean }) {
    const previous = assignments.get(staffId) ?? null;
    const staffName = staffById.get(staffId)?.name ?? "Staff member";
    const cabinName = cabins.find((c) => c.id === cabinId)?.name ?? "cabin";
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
        } else if (!opts?.silent) {
          showToast(`Moved ${staffName} to ${cabinName}`, () => {
            if (previous) assign(staffId, previous, { silent: true });
            else unassign(staffId, { silent: true });
          });
        }
      } finally {
        pendingOpsRef.current -= 1;
      }
    });
  }

  function unassign(staffId: string, opts?: { silent?: boolean }) {
    const previous = assignments.get(staffId) ?? null;
    const staffName = staffById.get(staffId)?.name ?? "Staff member";
    const cabinName = previous ? (cabins.find((c) => c.id === previous)?.name ?? "cabin") : null;
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
        } else if (!opts?.silent && cabinName) {
          showToast(`Removed ${staffName} from ${cabinName}`, () => assign(staffId, previous!, { silent: true }));
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

  function handleCabinClick(cabinId: string) {
    if (!selectedStaffId) return;
    assign(selectedStaffId, cabinId);
    setSelectedStaffId(null);
  }

  const grouped = useMemo(() => {
    const units = Array.from(new Set(cabins.map((c) => c.unit))).sort();
    return units.map((unit) => ({ unit, cabins: cabins.filter((c) => c.unit === unit) }));
  }, [cabins]);

  const selectedStaff = selectedStaffId ? staffById.get(selectedStaffId) ?? null : null;
  const selectedPreferredUnits = useMemo(() => {
    const map = new Map<string, number>(); // unit -> rank
    for (const p of selectedStaff?.preferences ?? []) map.set(p.unit, p.rank);
    return map;
  }, [selectedStaff]);

  // ---- Progress + celebration ----------------------------------------------
  const placedCount = allStaff.length - pool.length;
  const cabinsStaffed = cabins.filter((c) => (staffByCabin.get(c.id)?.length ?? 0) > 0).length;
  const pctPlaced = allStaff.length > 0 ? Math.round((placedCount / allStaff.length) * 100) : 0;
  const staffWithPreferences = allStaff.filter((s) => s.preferences.length > 0).length;

  const [showCelebration, setShowCelebration] = useState(false);
  const prevPoolLenRef = useRef(pool.length);
  useEffect(() => {
    if (prevPoolLenRef.current > 0 && pool.length === 0 && allStaff.length > 0) {
      setShowCelebration(true);
      const t = window.setTimeout(() => setShowCelebration(false), 2600);
      prevPoolLenRef.current = pool.length;
      return () => window.clearTimeout(t);
    }
    prevPoolLenRef.current = pool.length;
  }, [pool.length, allStaff.length]);
  // -------------------------------------------------------------------------

  // ---- Seed preferences from Q1/Q2 history ---------------------------------
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  function runSeedPreferences() {
    const confirmed = window.confirm(
      "Load unit preferences from Q1/Q2 history?\n\n" +
      "For every staff member, this looks at which unit they actually worked in past sessions and sets that as their preference (most recent session wins rank #1; a different earlier unit becomes rank #2). " +
      "Safe to re-run — it always overwrites with the freshly-computed ranking rather than duplicating."
    );
    if (!confirmed) return;
    setSeeding(true);
    setSeedMessage(null);
    setSeedError(null);
    startTransition(async () => {
      try {
        const result = await seedUnitPreferencesFromHistory(sessionId);
        if (result.ok) {
          setSeedMessage(`Loaded preferences for ${result.staffUpdated} staff member${result.staffUpdated === 1 ? "" : "s"} from history.`);
          router.refresh();
        } else {
          setSeedError(result.error);
        }
      } catch (err) {
        setSeedError(err instanceof Error ? err.message : String(err));
      } finally {
        setSeeding(false);
      }
    });
  }
  // -------------------------------------------------------------------------

  // ---- Auto-fill remaining --------------------------------------------------
  const [autoFillPreview, setAutoFillPreview] = useState<AutoFillRow[] | null>(null);
  const [applyingAutoFill, setApplyingAutoFill] = useState(false);

  function runAutoFillPreview() {
    const startingHeadcount = new Map(cabins.map((c) => [c.id, staffByCabin.get(c.id)?.length ?? 0] as [string, number]));
    const plan = computeAutoFillPlan(pool, cabins, startingHeadcount);
    setAutoFillPreview(plan);
  }

  function applyAutoFill() {
    if (!autoFillPreview || autoFillPreview.length === 0) return;
    setApplyingAutoFill(true);
    const placements = autoFillPreview.map((r) => ({ staffId: r.staffId, cabinId: r.cabinId }));
    startTransition(async () => {
      try {
        const result = await bulkAssignStaff(sessionId, placements);
        if (result.ok) {
          setAssignments((prev) => {
            const next = new Map(prev);
            for (const p of placements) next.set(p.staffId, p.cabinId);
            return next;
          });
          setAutoFillPreview(null);
        } else {
          setError(result.error);
        }
      } finally {
        setApplyingAutoFill(false);
      }
    });
  }
  // -------------------------------------------------------------------------

  return (
    <div className="relative">
      {showCelebration ? <Celebration /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="?gender=MALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "MALE" ? "border-lake-500 bg-lake-50" : ""}`}>Boys</Link>
        <Link href="?gender=FEMALE" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs ${gender === "FEMALE" ? "border-lake-500 bg-lake-50" : ""}`}>Girls</Link>
        <button type="button" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs`} onClick={runSeedPreferences} disabled={seeding}>
          {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
          {seeding ? "Loading…" : "Load preferences from Q1/Q2 history"}
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-black text-forest-800">
          <Radio className="h-3.5 w-3.5" />
          {lastSync ? `Live sync · ${lastSync}` : "Live sync · connecting…"}
        </span>
      </div>

      {seedMessage ? <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-2 text-xs font-bold text-green-800">{seedMessage}</p> : null}
      {seedError ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700">{seedError}</p> : null}

      {/* Progress bar */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-slate-600">
          <span>{placedCount} of {allStaff.length} staff placed ({pctPlaced}%)</span>
          <span>{cabinsStaffed} of {cabins.length} cabins have at least one staff member ({gender === "MALE" ? "Boys" : "Girls"})</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-forest-600 transition-all duration-500" style={{ width: `${pctPlaced}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-bold text-slate-400">
          {staffWithPreferences} of {allStaff.length} staff have unit preference data loaded.
          {staffWithPreferences === 0 ? <span className="text-amber-700"> Click &quot;Load preferences from Q1/Q2 history&quot; above to populate this before using click-to-place highlighting or auto-fill.</span> : null}
        </p>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      {selectedStaff ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-lake-400 bg-lake-50 p-3 text-sm font-bold text-lake-900">
          <span>
            Placing <span className="font-black">{selectedStaff.name}</span> — click any cabin below to assign them.{" "}
            {selectedStaff.preferences.length > 0 ? (
              <>Preferred units are highlighted: {[...selectedStaff.preferences].sort((a, b) => a.rank - b.rank).map((p) => `${ord(p.rank)} choice ${UNIT_LABEL[p.unit as Unit]}`).join(", ")}.</>
            ) : (
              <>No preference data for this person — nothing will be highlighted. If you haven&apos;t run &quot;Load preferences from Q1/Q2 history&quot; yet, that&apos;s likely why; if you have, they simply have no Q1/Q2 cabin history to derive from.</>
            )}
          </span>
          <button type="button" className="rounded-md border border-lake-300 bg-white px-2 py-1 text-xs font-black text-lake-800 hover:bg-lake-100" onClick={() => setSelectedStaffId(null)}>
            Cancel (Esc)
          </button>
        </div>
      ) : null}

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-forest-900">Auto-fill remaining</p>
            <p className="text-xs text-slate-500">Proposes cabins for everyone still unassigned in {gender === "MALE" ? "Boys" : "Girls"}, using unit preferences where available. Nothing writes until you review and confirm.</p>
          </div>
          <button type="button" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs`} onClick={runAutoFillPreview} disabled={pool.length === 0}>
            <Wand2 className="h-3.5 w-3.5" />
            Preview auto-fill ({pool.length} unassigned)
          </button>
        </div>

        {autoFillPreview ? (
          <div className="mt-3 rounded-lg border border-lake-200 bg-lake-50 p-3">
            <p className="text-sm font-black text-lake-900">
              Proposed: {autoFillPreview.length} placement{autoFillPreview.length === 1 ? "" : "s"}
              {" "}({autoFillPreview.filter((r) => r.matchedPreference).length} matched a stated preference)
            </p>
            {autoFillPreview.some((r) => r.wouldOverfill) ? (
              <p className="mt-1 text-xs font-bold text-red-700">⚠ {autoFillPreview.filter((r) => r.wouldOverfill).length} of these would push a cabin over its bed count — every cabin was already full or these had nowhere else to go.</p>
            ) : null}
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="p-1.5 text-left">Name</th>
                    <th className="p-1.5 text-left">Cabin</th>
                    <th className="p-1.5 text-left">Unit</th>
                    <th className="p-1.5 text-left">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {autoFillPreview.map((r) => (
                    <tr key={r.staffId} className={`border-b border-slate-100 ${r.wouldOverfill ? "bg-red-50" : ""}`}>
                      <td className="p-1.5 font-bold">{r.name}</td>
                      <td className="p-1.5">{r.cabinName}{r.wouldOverfill ? " ⚠" : ""}</td>
                      <td className="p-1.5">{r.unitLabel}</td>
                      <td className="p-1.5">{r.matchedPreference ? <span className="font-bold text-green-700">Preferred</span> : <span className="text-slate-400">No preference</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className={buttonClass} onClick={applyAutoFill} disabled={applyingAutoFill}>
                {applyingAutoFill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {applyingAutoFill ? "Applying…" : `Apply all ${autoFillPreview.length}`}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setAutoFillPreview(null)} disabled={applyingAutoFill}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
          <p className="mb-2 text-[11px] text-slate-400">*Lifeguard certified · click a name to place, or drag as before</p>
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
            {filteredPool.map((s) => {
              const selected = selectedStaffId === s.id;
              return (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                  onClick={() => toggleSelect(s.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm font-bold shadow-soft active:cursor-grabbing ${selected ? "border-lake-500 bg-lake-50 ring-2 ring-lake-300" : "border-slate-200 bg-white text-slate-800"}`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.isLifeguard ? "*" : ""}{s.name}</p>
                    {s.preferences.length > 0 ? (
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {[...s.preferences].sort((a, b) => a.rank - b.rank).slice(0, 2).map((p) => (
                          <span key={p.unit} className={`rounded px-1 py-0.5 text-[10px] font-black ${p.rank === 1 ? "bg-forest-100 text-forest-700" : "bg-slate-100 text-slate-500"}`}>
                            {ord(p.rank)} {UNIT_LABEL[p.unit as Unit]}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  {s.roleLabel ? <span className="shrink-0 text-[10px] font-bold text-slate-400">{s.roleLabel}</span> : null}
                </div>
              );
            })}
            {filteredPool.length === 0 ? <p className="text-xs text-slate-400">{pool.length === 0 ? "Everyone's assigned." : "No matches."}</p> : null}
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          {grouped.map(({ unit, cabins: unitCabins }) => (
            <Panel key={unit}>
              <SectionHeader title={UNIT_LABEL[unit]} detail={`${unitCabins.length} cabin${unitCabins.length === 1 ? "" : "s"}`} />
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unitCabins.map((cabin) => {
                  const assignedHere = staffByCabin.get(cabin.id) ?? [];
                  const headcount = cabin.campers.length + cabin.cas.length + assignedHere.length;
                  const overCapacity = cabin.beds > 0 && headcount > cabin.beds;
                  const prefRankForSelected = selectedPreferredUnits.get(cabin.unit) ?? null;
                  const isRecommended = selectedStaffId !== null && prefRankForSelected !== null;

                  return (
                    <div
                      key={cabin.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, cabin.id)}
                      onClick={() => handleCabinClick(cabin.id)}
                      className={selectedStaffId ? "cursor-pointer" : ""}
                    >
                      {/* Report-style box: same visual language as the print view -- campers
                          always visible, no expand/collapse, per direct feedback. */}
                      <div
                        className={`rounded-lg border-2 bg-white p-3 transition-shadow ${
                          isRecommended
                            ? prefRankForSelected === 1
                              ? "border-forest-600 ring-2 ring-forest-300"
                              : "border-amber-500 ring-2 ring-amber-200"
                            : "border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-forest-900">
                            {cabin.name}
                            {isRecommended ? (
                              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-black ${prefRankForSelected === 1 ? "bg-forest-100 text-forest-700" : "bg-amber-100 text-amber-800"}`}>
                                {ord(prefRankForSelected!)} choice
                              </span>
                            ) : null}
                          </span>
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
                        {assignedHere.map((s) => {
                          const selected = selectedStaffId === s.id;
                          return (
                            <div
                              key={s.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(s.id);
                              }}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm active:cursor-grabbing ${
                                selected ? "border-lake-500 bg-lake-50 ring-2 ring-lake-300" : changedIds.has(s.id) ? "border-lake-400 bg-lake-50 ring-2 ring-lake-300" : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" />
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
                              <button
                                type="button"
                                aria-label="Remove"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unassign(s.id);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
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

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-panel">
          <span>{toast.message}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs font-black text-lake-300 hover:bg-slate-800"
            onClick={() => {
              toast.onUndo();
              setToast(null);
              if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
            }}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Lightweight, dependency-free celebration burst -- a couple dozen emoji
// particles falling with randomized horizontal offset/delay/duration via
// inline styles, cleaned up automatically when showCelebration flips back
// to false a couple seconds later. No canvas/confetti library needed.
function Celebration() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        emoji: ["🎉", "🎊", "✨", "🏕️"][i % 4]
      })),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <style>{`
        @keyframes bunkboard-confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(60vh) rotate(240deg); opacity: 0; }
        }
      `}</style>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 text-2xl"
          style={{
            left: `${p.left}%`,
            animation: `bunkboard-confetti-fall ${p.duration}s ease-in ${p.delay}s 1`
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
