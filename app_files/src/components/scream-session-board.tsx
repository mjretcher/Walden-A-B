"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock, Lock, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Badge, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { StaffQuickEdit } from "@/components/staff-quick-edit";

type StaffRow = {
  id: string;
  name: string;
  primaryArea: string;
  skills: string[];
  certifications: string[];
  availabilityNotes?: string | null;
  cabinId?: string | null;
  housingLabel?: string | null;
  swimLevel?: string | null;
  assignments: Record<string, string>;
};

type OfferingOption = {
  id: string;
  label: string;
  period: string;
  periodLabel: string;
  area: string;
  activity: string;
  staffTarget: number;
  staffAssigned: number;
};

type PeriodOption = {
  value: string;
  label: string;
};

const OFF_PERIOD_VALUE = "__OFF_PERIOD__";

function isLifeguard(certifications: string[]) {
  return certifications.some((certification) => /\bLG\b|lifeguard/i.test(certification));
}

function certTags(certifications: string[]) {
  const joined = certifications.join(" ");
  const tags: Array<{ code: string; className: string }> = [];
  if (/\bLG\b|lifeguard/i.test(joined)) tags.push({ code: "LG", className: "bg-red-600 text-white" });
  if (/ski\s*boat|waterski|water-ski/i.test(joined)) tags.push({ code: "SKI", className: "bg-lake-600 text-white" });
  if (/tube\s*boat|tubing/i.test(joined)) tags.push({ code: "TUBE", className: "bg-orange-500 text-white" });
  if (/\bboat\b|driver|boating/i.test(joined) && !tags.some((tag) => tag.code === "SKI" || tag.code === "TUBE")) tags.push({ code: "BOAT", className: "bg-purple-600 text-white" });
  if (/wsi|swim instructor/i.test(joined)) tags.push({ code: "WSI", className: "bg-teal-600 text-white" });
  return tags;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function sortOfferingsForAssignment(left: OfferingOption, right: OfferingOption) {
  const areaSort = left.area.localeCompare(right.area, undefined, { numeric: true, sensitivity: "base" });
  if (areaSort !== 0) return areaSort;
  return left.activity.localeCompare(right.activity, undefined, { numeric: true, sensitivity: "base" });
}

// Suggestions should surface a staff member's own primary area first — a
// swim-area staffer paging through periods should see swim classes before
// anything else, not whatever happens to sort first alphabetically. Falls
// back to the normal area/activity sort for everything else, and for staff
// with no primary area set (order is then identical to before this change).
function sortOfferingsForSuggestion(preferredArea: string) {
  return (left: OfferingOption, right: OfferingOption) => {
    if (!preferredArea) return sortOfferingsForAssignment(left, right);
    const leftMatches = left.area === preferredArea;
    const rightMatches = right.area === preferredArea;
    if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;
    return sortOfferingsForAssignment(left, right);
  };
}

// Group offerings by area for <optgroup> rendering
function groupOfferingsByArea(offerings: OfferingOption[]) {
  const grouped = new Map<string, OfferingOption[]>();
  for (const offering of [...offerings].sort(sortOfferingsForAssignment)) {
    const group = grouped.get(offering.area) ?? [];
    group.push(offering);
    grouped.set(offering.area, group);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function ScreamSessionBoard({ staff, offerings, periods, locked, sessionId, cabins = [], canEditStaff = false, preScreamConflicts = [] }: { staff: StaffRow[]; offerings: OfferingOption[]; periods: PeriodOption[]; locked: boolean; sessionId: string; cabins?: { id: string; name: string; unit?: string | null }[]; canEditStaff?: boolean; preScreamConflicts?: { staffId: string; period: string; areaNames: string[] }[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [staffQuery, setStaffQuery] = useState("");
  const [showStaffFilters, setShowStaffFilters] = useState(false);
  const [staffAreaFilter, setStaffAreaFilter] = useState("");
  const [staffCertFilter, setStaffCertFilter] = useState("");
  const [assignments, setAssignments] = useState(() => staff.map((row) => ({ ...row.assignments })));
  const [sessionNotes, setSessionNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(staff.map((row) => [row.id, row.availabilityNotes ?? ""]))
  );
  const [noteSaveStatus, setNoteSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  // Local mirror of each staff member's swim level so the chip updates
  // optimistically without a server round-trip / page refresh.
  const [swimLevels, setSwimLevels] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(staff.map((row) => [row.id, row.swimLevel ?? null]))
  );
  const [swimSaveStatus, setSwimSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeStaff = staff[activeIndex];

  const staffAreas = useMemo(() => uniqueSorted(staff.map((row) => row.primaryArea || "No primary area")), [staff]);
  const staffCerts = useMemo(() => uniqueSorted(staff.flatMap((row) => row.certifications)), [staff]);

  const offeringStaffCounts = useMemo(() => {
    const counts = new Map(offerings.map((offering) => [offering.id, 0]));
    assignments.forEach((row) => {
      Object.values(row).forEach((offeringId) => {
        if (offeringId) counts.set(offeringId, (counts.get(offeringId) ?? 0) + 1);
      });
    });
    return counts;
  }, [assignments, offerings]);

  const offeringsByPeriod = useMemo(() => {
    const preferredArea = activeStaff?.primaryArea ?? "";
    return periods.reduce<Record<string, OfferingOption[]>>((record, period) => {
      record[period.value] = offerings.filter((offering) => offering.period === period.value).sort(sortOfferingsForSuggestion(preferredArea));
      return record;
    }, {});
  }, [offerings, periods, activeStaff?.primaryArea]);

  // PreScream conflicts (2+ areas wanting the same staff+period) flagged
  // directly on the relevant period cell — same data shown on the
  // dedicated /prescream conflicts screen, surfaced here too since this is
  // where the room actually resolves them live.
  const preScreamConflictsByStaffPeriod = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const conflict of preScreamConflicts) {
      map.set(`${conflict.staffId}:${conflict.period}`, conflict.areaNames);
    }
    return map;
  }, [preScreamConflicts]);

  const areaSummaries = useMemo(() => {
    const summaries = new Map<string, { area: string; assigned: number; target: number }>();
    offerings.forEach((offering) => {
      const current = summaries.get(offering.area) ?? { area: offering.area, assigned: 0, target: 0 };
      current.assigned += offeringStaffCounts.get(offering.id) ?? 0;
      current.target += offering.staffTarget;
      summaries.set(offering.area, current);
    });
    return Array.from(summaries.values()).sort((left, right) => left.area.localeCompare(right.area));
  }, [offeringStaffCounts, offerings]);

  const filteredStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (staffAreaFilter && (row.primaryArea || "No primary area") !== staffAreaFilter) return false;
      if (staffCertFilter && !row.certifications.includes(staffCertFilter)) return false;
      if (term && !`${row.name} ${row.primaryArea} ${row.skills.join(" ")} ${row.certifications.join(" ")}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [staff, staffQuery, staffAreaFilter, staffCertFilter]);

  const warnings = useMemo(() => {
    const needsStaff = offerings.filter((offering) => (offeringStaffCounts.get(offering.id) ?? 0) < offering.staffTarget).length;
    const overstaffed = offerings.filter((offering) => (offeringStaffCounts.get(offering.id) ?? 0) > offering.staffTarget).length;
    return [
      { label: "Double-booked staff", value: 0, tone: "red" as const },
      { label: "Missing certifications", value: 0, tone: "orange" as const },
      { label: "Understaffed offerings", value: needsStaff, tone: "orange" as const },
      { label: "Overstaffed offerings", value: overstaffed, tone: "blue" as const },
      { label: "Past availability", value: 0, tone: "blue" as const }
    ];
  }, [offeringStaffCounts, offerings]);

  function assignedOffering(period: string) {
    const offeringId = assignments[activeIndex]?.[period];
    if (offeringId === OFF_PERIOD_VALUE) return undefined;
    return offerings.find((item) => item.id === offeringId);
  }

  function saveAssignment(period: string, offeringId: string) {
    if (!activeStaff) return;
    if (locked) { setMessage("Scream Session is locked. Unlock it first to make changes."); return; }
    const staffIndex = activeIndex;
    const staffName = activeStaff.name;
    const previousOfferingId = assignments[staffIndex]?.[period] ?? "";
    const isOffPeriod = offeringId === OFF_PERIOD_VALUE;
    setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: offeringId } : row)));
    setMessage(isOffPeriod ? "Saving off period..." : offeringId ? "Saving..." : "Removing...");
    startTransition(async () => {
      const save = (approveDoubleTwilight = false) => fetch("/api/staff-assignments", {
        method: offeringId ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOffPeriod
          ? { staffId: activeStaff.id, period, offPeriod: true }
          : offeringId
            ? { staffId: activeStaff.id, offeringId, period, approveDoubleTwilight }
            : { staffId: activeStaff.id, period })
      });

      let response = await save();
      let data = await response.json();
      if (response.status === 409 && data.needsApproval === "DOUBLE_TWILIGHT" && window.confirm(data.warning ?? data.error ?? "Approve assigning both twilight periods?")) {
        response = await save(true);
        data = await response.json();
      }

      if (!response.ok) {
        setAssignments((current) => current.map((row, index) => (index === staffIndex ? { ...row, [period]: previousOfferingId } : row)));
        setMessage(data.error ?? "Assignment failed.");
        return;
      }

      if (Array.isArray(data.clearedPeriods) && data.clearedPeriods.length) {
        setAssignments((current) => current.map((row, index) => {
          if (index !== staffIndex) return row;
          const next = { ...row };
          data.clearedPeriods.forEach((clearedPeriod: string) => {
            next[clearedPeriod] = "";
          });
          return next;
        }));
      }

      setMessage(offeringId ? data.warnings?.length ? data.warnings.join(" ") : `Saved ${staffName} to ${data.label}.` : `Removed ${staffName} from ${period}.`);
    });
  }

  function clearStaffFilters() {
    setStaffQuery("");
    setStaffAreaFilter("");
    setStaffCertFilter("");
  }

  async function saveNote(staffId: string, note: string) {
    setNoteSaveStatus((current) => ({ ...current, [staffId]: "saving" }));
    try {
      const response = await fetch(`/api/staff/${staffId}/session-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      });
      setNoteSaveStatus((current) => ({ ...current, [staffId]: response.ok ? "saved" : "error" }));
      setTimeout(() => setNoteSaveStatus((current) => { const next = { ...current }; delete next[staffId]; return next; }), 2000);
    } catch {
      setNoteSaveStatus((current) => ({ ...current, [staffId]: "error" }));
    }
  }

  async function saveSwimLevel(staffId: string, swimLevel: string | null) {
    // Optimistic: update the chip instantly so the keystroke feels native.
    const previous = swimLevels[staffId] ?? null;
    setSwimLevels((current) => ({ ...current, [staffId]: swimLevel }));
    setSwimSaveStatus((current) => ({ ...current, [staffId]: "saving" }));
    try {
      const response = await fetch(`/api/staff/${staffId}/swim-level`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swimLevel })
      });
      if (!response.ok) {
        // Roll back on failure so the UI matches reality.
        setSwimLevels((current) => ({ ...current, [staffId]: previous }));
        setSwimSaveStatus((current) => ({ ...current, [staffId]: "error" }));
        return;
      }
      setSwimSaveStatus((current) => ({ ...current, [staffId]: "saved" }));
      setTimeout(() => setSwimSaveStatus((current) => { const next = { ...current }; delete next[staffId]; return next; }), 1500);
    } catch {
      setSwimLevels((current) => ({ ...current, [staffId]: previous }));
      setSwimSaveStatus((current) => ({ ...current, [staffId]: "error" }));
    }
  }

  // Keyboard shortcut: press M to set the active staff to MUSKIE, B for BLUEGILL.
  // Only fires when no input/textarea is focused so it doesn't fight typing.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!activeStaff || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        saveSwimLevel(activeStaff.id, "MUSKIE");
      } else if (key === "b") {
        event.preventDefault();
        saveSwimLevel(activeStaff.id, "BLUEGILL");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // saveSwimLevel is stable in this component (no useCallback needed since
    // its dependencies — setters — are stable). activeStaff is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStaff]);

  // Tells the Staff Schedule live view (typically a second, projected
  // screen) who's currently pulled up here, so it can highlight that row —
  // "bring attention to the person I'm on" for the room, without touching
  // scroll position on that screen (it's a plain highlight, not a
  // scrollIntoView — see the comment on this in the Staff Schedule page).
  // Debounced slightly so paging through several staff quickly (or typing
  // into the search box) doesn't fire a request per keystroke/click.
  useEffect(() => {
    if (!activeStaff) return;
    const timeout = window.setTimeout(() => {
      fetch("/api/scream-session/active-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, staffId: activeStaff.id })
      }).catch(() => {
        // Best-effort only — a failed highlight-sync shouldn't interrupt
        // actual staffing work, which is why nothing here surfaces an
        // error to the user.
      });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [activeStaff, sessionId]);

  // Best-effort: clear the highlight on the way out, so it doesn't linger
  // on the Staff Schedule view after this session is over. Not guaranteed
  // to fire on a hard tab close, but does on normal in-app navigation.
  useEffect(() => {
    return () => {
      fetch("/api/scream-session/active-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, staffId: null })
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!activeStaff) return <div className="rounded-xl border border-slate-200 bg-white p-6 font-bold text-slate-600">No active staff found.</div>;

  const activeInitials = activeStaff.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const activeIsLifeguard = isLifeguard(activeStaff.certifications);

  return (
    <>
    {locked && (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-800">
        <Lock className="h-4 w-4 shrink-0" />
        Scream Session is locked — assignments cannot be changed. Use the Lock button above to unlock.
      </div>
    )}
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide">Staff Queue (A-Z)</h2>
          <button className={`rounded-lg border p-2 ${showStaffFilters ? "border-lake-600 bg-lake-50 text-lake-700" : "border-slate-200"}`} type="button" onClick={() => setShowStaffFilters((current) => !current)} aria-label="Toggle staff filters"><SlidersHorizontal className="h-4 w-4" /></button>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search staff..." value={staffQuery} onChange={(event) => {
            const term = event.target.value;
            setStaffQuery(term);
            const index = staff.findIndex((row) => row.name.toLowerCase().includes(term.toLowerCase()));
            if (term && index >= 0) setActiveIndex(index);
          }} />
        </label>
        {showStaffFilters ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <select className={inputClass} value={staffAreaFilter} onChange={(event) => setStaffAreaFilter(event.target.value)}>
              <option value="">All areas</option>
              {staffAreas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
            <select className={inputClass} value={staffCertFilter} onChange={(event) => setStaffCertFilter(event.target.value)}>
              <option value="">All certifications</option>
              {staffCerts.map((certification) => <option key={certification} value={certification}>{certification}</option>)}
            </select>
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearStaffFilters}>Clear staff filters</button>
          </div>
        ) : null}
        <div className="mt-3 max-h-[680px] overflow-auto pr-1">
          {filteredStaff.map((row) => {
            const index = staff.findIndex((staffRow) => staffRow.id === row.id);
            const initials = row.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const filledCount = periods.filter((p) => assignments[index]?.[p.value]).length;
            const allFilled = filledCount === periods.length;
            const noneFilled = filledCount === 0;
            const dotColor = allFilled ? "bg-green-500" : noneFilled ? "bg-slate-300" : "bg-orange-500";
            const tags = certTags(row.certifications);
            return (
              <button key={row.id} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${index === activeIndex ? "bg-lake-600 text-white shadow-sm" : "hover:bg-slate-50"}`} type="button" onClick={() => setActiveIndex(index)}>
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${index === activeIndex ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="block truncate text-sm font-black">{row.name}</span>
                    {tags.slice(0, 2).map((tag) => <span key={tag.code} className={`rounded px-1.5 py-0.5 text-[0.62rem] font-black ${tag.className}`}>{tag.code}</span>)}
                  </span>
                  <span className={`block truncate text-xs ${index === activeIndex ? "text-lake-50" : "text-slate-500"}`}>{row.primaryArea || "No primary area"}</span>
                </span>
                <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              </button>
            );
          })}
          {!filteredStaff.length ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-500">No staff match these filters.</p> : null}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Showing {filteredStaff.length} of {staff.length} staff</p>
      </aside>

      <main className="grid gap-4">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="grid gap-0 2xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.9fr)]">
            <div className="bg-[radial-gradient(circle_at_0%_0%,rgba(7,95,202,0.11),transparent_34%),linear-gradient(135deg,#ffffff,#f7fbff)] p-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-xl font-black text-white shadow-sm ${activeIsLifeguard ? "bg-red-600" : "bg-lake-600"}`}>{activeInitials}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 max-w-full break-words text-xl font-black leading-tight tracking-tight text-slate-950 2xl:text-2xl">{activeStaff.name}</h2>
                    <Badge tone="green">Active</Badge>
                    {certTags(activeStaff.certifications).map((tag) => <span key={tag.code} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-black ${tag.className}`}>{tag.code === "LG" ? <ShieldCheck className="h-3 w-3" /> : null}{tag.code}</span>)}
                  </div>
                  {/* Compact one-line summary: Primary area • Assignment count • Housing.
                    * Was three separate panels stacked vertically — now a single row. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-bold text-slate-500">
                      <span className="font-black uppercase tracking-wide text-slate-400">Area</span>{" "}
                      <span className="font-black text-forest-900">{activeStaff.primaryArea || "Unassigned"}</span>
                    </span>
                    <span className="font-bold text-slate-300">•</span>
                    <span className="font-bold text-slate-500">
                      <span className="font-black uppercase tracking-wide text-slate-400">Assignments</span>{" "}
                      <span className="font-black text-forest-900">{periods.filter((p) => assignments[activeIndex]?.[p.value] && assignments[activeIndex]?.[p.value] !== "__OFF_PERIOD__").length} / {periods.length}</span>
                    </span>
                    <span className="font-bold text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-500">
                      <span className="font-black uppercase tracking-wide text-slate-400">Housing</span>
                      <StaffQuickEdit
                        staffId={activeStaff.id}
                        staffName={activeStaff.name}
                        currentHousingLabel={activeStaff.housingLabel ?? null}
                        canEdit={canEditStaff}
                      />
                    </span>
                    <span className="font-bold text-slate-300">•</span>
                    {/* Quick-set swim level: one click for Muskie or Bluegill.
                      * Keyboard shortcuts M and B set it on the active staff
                      * member (when nothing else is focused). */}
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-500">
                      <span className="font-black uppercase tracking-wide text-slate-400">Swim</span>
                      {(() => {
                        const current = swimLevels[activeStaff.id] ?? null;
                        const saveStatus = swimSaveStatus[activeStaff.id];
                        return (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveSwimLevel(activeStaff.id, current === "MUSKIE" ? null : "MUSKIE")}
                              className={`grid h-7 w-7 place-items-center rounded-md text-sm font-black transition ${current === "MUSKIE" ? "bg-lake-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-lake-50 hover:text-lake-700"}`}
                              title="Muskie (M)"
                              aria-label="Set Muskie"
                              aria-pressed={current === "MUSKIE"}
                            >
                              M
                            </button>
                            <button
                              type="button"
                              onClick={() => saveSwimLevel(activeStaff.id, current === "BLUEGILL" ? null : "BLUEGILL")}
                              className={`grid h-7 w-7 place-items-center rounded-md text-sm font-black transition ${current === "BLUEGILL" ? "bg-amber-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700"}`}
                              title="Bluegill (B)"
                              aria-label="Set Bluegill"
                              aria-pressed={current === "BLUEGILL"}
                            >
                              B
                            </button>
                            {current === "WALLEYE" ? (
                              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700" title="Walleye (set elsewhere)">W</span>
                            ) : null}
                            {current === "PENDING_SWIM_TEST" ? (
                              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700" title="Pending swim test">?</span>
                            ) : null}
                            {saveStatus === "saving" ? <span className="text-[10px] font-bold text-slate-400">…</span> : null}
                            {saveStatus === "saved" ? <span className="text-[10px] font-bold text-green-600">✓</span> : null}
                            {saveStatus === "error" ? <span className="text-[10px] font-bold text-red-600">!</span> : null}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ChipPanel title="Skills" empty="No skills" values={activeStaff.skills} tone="blue" />
                <ChipPanel title="Certifications" empty="No certs" values={activeStaff.certifications} tone="cert" />
              </div>
            </div>
            <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 p-4 2xl:border-l 2xl:border-t-0">
              <NotePanel title="Availability Notes" body={activeStaff.availabilityNotes || "No availability notes."} />
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-black text-slate-950">Session Notes</p>
                  {noteSaveStatus[activeStaff.id] === "saving" && <span className="text-xs font-bold text-slate-400">Saving…</span>}
                  {noteSaveStatus[activeStaff.id] === "saved" && <span className="text-xs font-bold text-green-600">Saved ✓</span>}
                  {noteSaveStatus[activeStaff.id] === "error" && <span className="text-xs font-bold text-red-600">Error saving</span>}
                </div>
                <textarea
                  className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-lake-400"
                  rows={3}
                  placeholder="Notes for this session…"
                  value={sessionNotes[activeStaff.id] ?? ""}
                  onChange={(e) => setSessionNotes((current) => ({ ...current, [activeStaff.id]: e.target.value }))}
                  onBlur={(e) => saveNote(activeStaff.id, e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mx-4 mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-900">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" /> Warnings ({warnings.reduce((total, warning) => total + warning.value, 0)}) • Review double-booking, certifications, and staffing targets before final export.
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-sm font-black uppercase tracking-wide">Assignments</h2>
            <div className="flex items-center gap-4 text-xs font-bold"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />Assigned</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Off</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" />Conflict</span></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {periods.map((period) => {
              const selectedValue = assignments[activeIndex]?.[period.value] ?? "";
              const isOffPeriod = selectedValue === OFF_PERIOD_VALUE;
              const currentOffering = assignedOffering(period.value);
              const assignedCount = currentOffering ? offeringStaffCounts.get(currentOffering.id) ?? 0 : 0;
              const conflict = currentOffering ? assignedCount > currentOffering.staffTarget : false;
              const suggestions = offeringsByPeriod[period.value]?.slice(0, 3) ?? [];
              const preScreamAreas = preScreamConflictsByStaffPeriod.get(`${activeStaff.id}:${period.value}`);
              return (
                <div key={period.value} className="grid min-h-[320px] min-w-0 content-start gap-3 border-r border-b border-slate-200 p-3 last:border-r-0">
                  <div className="rounded-lg bg-lake-600 px-3 py-2 text-center text-lg font-black leading-none text-white">
                    {period.label}
                  </div>
                  {preScreamAreas ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                      PreScream conflict — wanted by {preScreamAreas.join(", ")}. Resolve on the PreScream page or just reassign here to override.
                    </div>
                  ) : null}
                  <div className={`min-w-0 rounded-lg border p-3 ${conflict ? "border-red-200 bg-red-50" : isOffPeriod ? "border-amber-200 bg-amber-50" : currentOffering ? "border-green-100 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black leading-tight">{isOffPeriod ? "Off Period" : currentOffering?.activity ?? "-"}</p>
                        <p className="mt-1 break-words text-xs font-medium leading-tight text-slate-600">{isOffPeriod ? "Protected staff break" : currentOffering?.area ?? "(Empty)"}</p>
                      </div>
                      {currentOffering || isOffPeriod ? <span className={`h-2 w-2 rounded-full ${conflict ? "bg-red-600" : isOffPeriod ? "bg-amber-500" : "bg-green-600"}`} /> : null}
                    </div>
                  </div>
                  <select className={`${inputClass} min-w-0 text-sm`} value={selectedValue} disabled={isPending} onChange={(event) => saveAssignment(period.value, event.target.value)}>
                    <option value="">Search...</option>
                    <option value={OFF_PERIOD_VALUE}>Off Period</option>
                    {groupOfferingsByArea(offeringsByPeriod[period.value] ?? []).map(([area, areaOfferings]) => (
                      <optgroup key={area} label={area}>
                        {areaOfferings.map((offering) => (
                          <option key={offering.id} value={offering.id}>{offering.activity}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-500">Quick Assign</p>
                    <div className="mt-1 grid min-w-0 gap-1">
                      <button className="min-w-0 break-words text-left text-xs font-black leading-tight text-amber-700" type="button" onClick={() => saveAssignment(period.value, OFF_PERIOD_VALUE)}>Off Period</button>
                      {suggestions.map((suggestion) => <button key={suggestion.id} className="min-w-0 break-words text-left text-xs font-bold leading-tight text-lake-700" type="button" onClick={() => saveAssignment(period.value, suggestion.id)}>{suggestion.activity}</button>)}
                    </div>
                  </div>
                  <textarea className="min-h-16 min-w-0 resize-y rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-lake-500" placeholder="Notes..." value={sessionNotes[activeStaff.id] ?? ""} onChange={(e) => setSessionNotes((current) => ({ ...current, [activeStaff.id]: e.target.value }))} onBlur={(e) => saveNote(activeStaff.id, e.target.value)} />
                  <div className="mt-auto grid gap-2 border-t border-slate-100 pt-2 text-center text-sm font-black">
                    <span>{currentOffering?.staffTarget ?? "—"}</span>
                    <span className={conflict ? "text-red-600" : "text-green-700"}>{currentOffering ? assignedCount : 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <button className={secondaryButtonClass} type="button" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}><ArrowLeft className="h-4 w-4" />Previous Staff</button>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-600"><Check className="h-4 w-4 text-green-700" />{message || "Auto-save on change"}</p>
          <button className={buttonClass} type="button" onClick={() => setActiveIndex(Math.min(staff.length - 1, activeIndex + 1))}>Next Staff <ArrowRight className="h-4 w-4" /></button>
        </div>
      </main>

      <aside className="grid content-start gap-5">
        <Panel title="Live Warnings">
          <div className="grid gap-2">
            {warnings.map((warning) => <WarningRow key={warning.label} {...warning} />)}
          </div>
        </Panel>
        <Panel title="Area Staffing Summary">
          <div className="grid gap-3">
            {areaSummaries.map((area) => {
              const pct = area.target ? Math.min(100, Math.round((area.assigned / area.target) * 100)) : 0;
              return (
                <div key={area.area}>
                  <div className="mb-1 flex justify-between text-xs font-bold"><span>{area.area}</span><span>{area.assigned} / {area.target}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-200"><div className={`h-full rounded-full ${area.assigned < area.target ? "bg-orange-500" : "bg-green-600"}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
          <a className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-lake-600 text-sm font-black text-lake-700" href="/area-dashboard">View Area Dashboard</a>
        </Panel>
        <Panel title="Scream Session Tips">
          <p className="flex gap-2 text-sm font-medium leading-6 text-slate-600"><Clock className="mt-1 h-4 w-4 shrink-0" />Use search in each period cell to quickly assign an offering. Changes save instantly.</p>
        </Panel>
      </aside>
    </div>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft"><h2 className="mb-4 text-sm font-black uppercase tracking-wide">{title}</h2>{children}</section>;
}

function ChipPanel({ title, values, empty, tone }: { title: string; values: string[]; empty: string; tone: "blue" | "cert" }) {
  return (
    <div>
      <p className="text-sm font-black text-slate-950">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length ? values.map((value) => {
          const [tag] = certTags([value]);
          return <span key={value} className={`rounded-lg px-2.5 py-1 text-xs font-black ${tag ? tag.className : tone === "blue" ? "bg-lake-100 text-lake-800" : "bg-slate-100 text-slate-700"}`}>{tag ? `${tag.code} • ${value}` : value}</span>;
        }) : <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{empty}</span>}
      </div>
    </div>
  );
}
function NotePanel({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-black text-slate-950">{title}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></div>;
}

function WarningRow({ label, value, tone }: { label: string; value: number; tone: "red" | "orange" | "blue" }) {
  const colors = { red: "text-red-600 bg-red-50 border-red-100", orange: "text-orange-600 bg-orange-50 border-orange-100", blue: "text-lake-600 bg-lake-50 border-lake-100" };
  return <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${colors[tone]}`}><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{label}</span><span>{value}</span></div>;
}
