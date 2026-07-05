"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { ActivityIcon } from "@/components/activity-icon";
import { Badge, CapacityPill, Panel, SectionHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { CamperQuickEdit } from "@/components/camper-quick-edit";

type CamperOption = {
  id: string;
  name: string;
  cabin: string;
  cabinId?: string | null;
  weeks?: string[];
  unit: string;
  gender: string;
  swim: string;
  counselorAssistant?: boolean;
  medicalFlags?: string | null;
};

type OfferingOption = {
  id: string;
  period: string;
  activity: string;
  area: string;
  count: number;
  limit?: number | null;
  limitType: string;
  preAssigned: boolean;
  allowWaitlist: boolean;
  active: boolean;
  eligibleUnits: string[];
  eligibleSwimLevels: string[];
  eligibleSwimCodes: string[];
};

type RegistrationWindowOption = {
  value: string;
  label: string;
  description: string;
};

type ScheduleEntry = {
  id: string;
  period: string;
  activity: string;
  area: string;
  approval: string;
  isTeachingAssistant: boolean;
};

// Mirrors the printed registration card: A-day column (left), B-day column (right).
const CARD_A_PERIODS = ["1A", "2A", "3A", "4A"] as const;
const CARD_B_PERIODS = ["1B", "2B", "3B", "4B"] as const;

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function dayFromPeriod(period: string) {
  return period.endsWith("A") ? "A" : period.endsWith("B") ? "B" : "";
}

function periodNumber(period: string) {
  return period.replace(/[^0-9]/g, "");
}

export function CounselorRegistration({
  campers,
  offerings,
  canOverride,
  canEditCampers = false,
  cabins = [],
  registrationWindow,
  registrationWindows
}: {
  campers: CamperOption[];
  offerings: OfferingOption[];
  canOverride: boolean;
  canEditCampers?: boolean;
  cabins?: { id: string; name: string; unit?: string | null }[];
  registrationWindow: string;
  registrationWindows: RegistrationWindowOption[];
}) {
  const [query, setQuery] = useState("");
  const [activityQuery, setActivityQuery] = useState("");
  const [camperUnit, setCamperUnit] = useState("");
  const [camperGender, setCamperGender] = useState("");
  const [camperCabin, setCamperCabin] = useState("");
  const [activityArea, setActivityArea] = useState("");
  const [activityDay, setActivityDay] = useState("");
  const [activityPeriod, setActivityPeriod] = useState("");
  const [camperId, setCamperId] = useState(campers[0]?.id ?? "");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const [approval, setApproval] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideApprovedBy, setOverrideApprovedBy] = useState("");
  const [registrationRole, setRegistrationRole] = useState<"CAMPER" | "TEACHING_ASSISTANT">("CAMPER");
  const [message, setMessage] = useState("");
  const [localCounts, setLocalCounts] = useState<Record<string, number>>({});
  const [showCamperFilters, setShowCamperFilters] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const camperUnits = useMemo(() => uniqueSorted(campers.map((camper) => camper.unit)), [campers]);
  const camperGenders = useMemo(() => uniqueSorted(campers.map((camper) => camper.gender)), [campers]);
  const camperCabins = useMemo(() => uniqueSorted(campers.map((camper) => camper.cabin)), [campers]);
  const activityAreas = useMemo(() => uniqueSorted(offerings.map((offering) => offering.area)), [offerings]);
  const activityPeriods = useMemo(() => uniqueSorted(offerings.map((offering) => periodNumber(offering.period))), [offerings]);
  const selectedWindow = registrationWindows.find((window) => window.value === registrationWindow);

  const matchingCampers = useMemo(() => {
    const term = query.toLowerCase().trim();
    return campers.filter((camper) => {
      if (camperUnit && camper.unit !== camperUnit) return false;
      if (camperGender && camper.gender !== camperGender) return false;
      if (camperCabin && camper.cabin !== camperCabin) return false;
      if (term && !`${camper.name} ${camper.cabin} ${camper.unit} ${camper.gender}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [campers, query, camperUnit, camperGender, camperCabin]);

  const filteredCampers = matchingCampers.slice(0, 40);

  const filteredOfferings = useMemo(() => {
    const term = activityQuery.toLowerCase().trim();
    return offerings.filter((offering) => {
      if (activityArea && offering.area !== activityArea) return false;
      if (activityDay && dayFromPeriod(offering.period) !== activityDay) return false;
      if (activityPeriod && periodNumber(offering.period) !== activityPeriod) return false;
      if (term && !`${offering.activity} ${offering.area} ${offering.period}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [offerings, activityArea, activityDay, activityPeriod, activityQuery]);

  // Only cap the unfiltered firehose (all areas / all days / all periods / no search).
  // As soon as any filter or search narrows the list, show every match so nothing
  // the user is looking for — e.g. Programming classes — gets silently cut off.
  const activityFiltersActive = Boolean(activityArea || activityDay || activityPeriod || activityQuery.trim());
  const visibleOfferings = activityFiltersActive ? filteredOfferings : filteredOfferings.slice(0, 120);

  useEffect(() => {
    if (filteredCampers.length && !filteredCampers.some((camper) => camper.id === camperId)) {
      setCamperId(filteredCampers[0].id);
    }
  }, [filteredCampers, camperId]);

  useEffect(() => {
    if (filteredOfferings.length && !filteredOfferings.some((offering) => offering.id === offeringId)) {
      setOfferingId(filteredOfferings[0].id);
    }
  }, [filteredOfferings, offeringId]);

  const selectedOffering = offerings.find((offering) => offering.id === offeringId);
  const selectedCamper = campers.find((camper) => camper.id === camperId);
  const selectedCount = selectedOffering ? selectedOffering.count + (localCounts[selectedOffering.id] ?? 0) : 0;
  const isFull = selectedOffering?.limit ? selectedCount >= selectedOffering.limit : selectedOffering?.limitType === "SPECIAL_APPROVAL";

  useEffect(() => {
    if (!selectedCamper?.counselorAssistant && registrationRole !== "CAMPER") {
      setRegistrationRole("CAMPER");
    }
  }, [selectedCamper?.counselorAssistant, registrationRole]);

  // Live-load the selected camper's current schedule for card verification.
  useEffect(() => {
    if (!camperId) {
      setSchedule([]);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setScheduleLoading(true);
    fetch(`/api/campers/${camperId}/schedule?window=${encodeURIComponent(registrationWindow)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { registrations: [] }))
      .then((data) => {
        if (!cancelled) setSchedule(data.registrations ?? []);
      })
      .catch((error) => {
        // An aborted request (camper switched, or a refresh superseded this one)
        // must NOT wipe the card — a newer fetch is already in flight.
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setSchedule([]);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [camperId, registrationWindow, scheduleRefresh]);

  function clearCamperFilters() {
    setQuery("");
    setCamperUnit("");
    setCamperGender("");
    setCamperCabin("");
  }

  function clearActivityFilters() {
    setActivityQuery("");
    setActivityArea("");
    setActivityDay("");
    setActivityPeriod("");
  }

  function focusCamperSearch() {
    setShowCamperFilters(true);
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    setMessage("Ready to scan or type a camper ID/name.");
  }

  function openRosterReport() {
    window.location.href = "/reports/area-block-plan";
  }

  // Group the camper's schedule by period label for the verification grid.
  const scheduleByPeriod = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {};
    for (const entry of schedule) {
      if (!map[entry.period]) map[entry.period] = [];
      map[entry.period].push(entry);
    }
    return map;
  }, [schedule]);

  const filledSlotCount = [...CARD_A_PERIODS, ...CARD_B_PERIODS].filter((slot) => scheduleByPeriod[slot]?.length).length;

  // Real eligibility, computed from the same data the server actually
  // enforces (see lib/eligibility.ts) — replaces a checklist that used to
  // show four hardcoded green checkmarks unconditionally, regardless of
  // whether the camper was actually eligible. That was tolerable back when
  // unit/swim mismatches were the server's problem alone; now that an
  // override needs to be deliberately triggered for exactly those reasons,
  // showing "eligible" right before a rejection is actively misleading.
  // Counselor Assistants are exempt from unit/swim eligibility everywhere
  // else in the app, so they're exempt here too. An empty eligible list on
  // the offering means "open to everyone," matching the server's reading.
  const camperIsExempt = Boolean(selectedCamper?.counselorAssistant);
  const unitEligible = !selectedOffering || !selectedCamper || camperIsExempt || !selectedOffering.eligibleUnits.length || selectedOffering.eligibleUnits.includes(selectedCamper.unit);
  const swimEligible = !selectedOffering || !selectedCamper || camperIsExempt || !selectedOffering.eligibleSwimCodes.length || selectedOffering.eligibleSwimCodes.includes(selectedCamper.swim);
  const periodConflict = Boolean(selectedOffering && scheduleByPeriod[selectedOffering.period]?.length);

  const [waitlistOffer, setWaitlistOffer] = useState<{ offeringId: string; activityName: string } | null>(null);
  const [overrideOffer, setOverrideOffer] = useState<{ offeringId: string; activityName: string } | null>(null);

  useEffect(() => {
    setWaitlistOffer(null);
    setOverrideOffer(null);
  }, [offeringId]);

  // Shared gate for every path into an override (the pre-emptive checkbox
  // AND the reactive "Allow override" button below): no name, no override.
  // Returns the trimmed name, or null if the person cancelled or left it
  // blank.
  function promptForOverrideApproval() {
    const name = window.prompt("This needs Area Head / Executive Admin approval to override. Type the name of the person approving it, then click OK to assign the camper.");
    return name?.trim() || null;
  }

  function register(options: { joinWaitlist?: boolean; overrideNow?: boolean; approvedBy?: string } = {}) {
    const joinWaitlist = options.joinWaitlist ?? false;
    const useOverride = options.overrideNow ?? override;
    const approvedBy = options.approvedBy ?? overrideApprovedBy;
    setMessage("");
    if (!joinWaitlist) setWaitlistOffer(null);
    setOverrideOffer(null);
    startTransition(async () => {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camperId,
          offeringId,
          counselorApproval: approval,
          override: useOverride,
          overrideApprovedBy: useOverride ? approvedBy : "",
          registrationWindow,
          registrationRole,
          joinWaitlist
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Registration failed.");
        setWaitlistOffer(data.waitlistAvailable ? { offeringId, activityName: offerings.find((item) => item.id === offeringId)?.activity ?? "this class" } : null);
        setOverrideOffer(canOverride && data.requiresOverride ? { offeringId, activityName: offerings.find((item) => item.id === offeringId)?.activity ?? "this class" } : null);
        return;
      }
      setWaitlistOffer(null);
      setOverrideOffer(null);
      if (registrationRole === "CAMPER" && !data.waitlisted) {
        setLocalCounts((current) => ({ ...current, [offeringId]: (current[offeringId] ?? 0) + 1 }));
      }
      setApproval("");
      setRegistrationRole("CAMPER");
      // Every override is a one-time, deliberately-confirmed action — it
      // should never silently carry over and apply to the next, unrelated
      // registration.
      setOverride(false);
      setOverrideApprovedBy("");
      setScheduleRefresh((value) => value + 1);
      const windowLabel = selectedWindow?.label ?? registrationWindow;
      const roleSuffix = registrationRole === "TEACHING_ASSISTANT" ? " as a teaching assistant" : "";
      setMessage(
        data.waitlisted
          ? `${data.registration.camper.firstName} ${data.registration.camper.lastName} added to the waitlist for ${data.registration.offering.activity.name} (position ${data.registration.waitlistPosition ?? "?"}) for ${windowLabel}.`
          : `${data.registration.camper.firstName} ${data.registration.camper.lastName} added to ${data.registration.offering.activity.name} for ${windowLabel}${roleSuffix}.`
      );
    });
  }

  // Triggered by the reactive "Allow override" button that appears after a
  // rejection that an override would actually fix. Prompts once, and if a
  // name is given, immediately resubmits with the override applied — no
  // separate second click needed.
  function allowOverrideAndRegister() {
    const name = promptForOverrideApproval();
    if (!name) {
      setMessage("Override not applied — an approver name is required.");
      return;
    }
    setOverride(true);
    setOverrideApprovedBy(name);
    register({ overrideNow: true, approvedBy: name });
  }

  function removeRegistration(registrationId: string, activityName: string, periodLabel: string) {
    if (!window.confirm(`Remove ${activityName} from period ${periodLabel}? This cannot be undone.`)) return;
    setRemovingId(registrationId);
    // Optimistic: drop the row from the card immediately so it feels instant.
    setSchedule((current) => current.filter((entry) => entry.id !== registrationId));
    startTransition(async () => {
      try {
        const response = await fetch(`/api/registration?registrationId=${encodeURIComponent(registrationId)}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.error ?? "Could not remove registration.");
          // Reconcile with the server — this will restore the row if the delete failed.
          setScheduleRefresh((value) => value + 1);
          return;
        }
        setMessage(`Removed ${activityName} from period ${periodLabel}.`);
        // Reconcile with the server to confirm the authoritative state.
        setScheduleRefresh((value) => value + 1);
      } catch {
        setMessage("Could not remove registration.");
        setScheduleRefresh((value) => value + 1);
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1fr_0.82fr]">
      <Panel className="xl:col-span-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-forest-900">Registration<br className="hidden sm:block" /> Window</h2>
            <form className="flex flex-wrap items-center gap-3" method="get">
              {registrationWindows.map((window) => (
                <button
                  key={window.value}
                  className={`min-h-16 rounded-lg border px-7 text-center shadow-sm transition ${window.value === registrationWindow ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-lake-50"}`}
                  name="window"
                  value={window.value}
                  type="submit"
                >
                  <span className="block text-lg font-black">{window.label}</span>
                  <span className="block text-xs font-bold">{window.description}</span>
                </button>
              ))}
            </form>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className={secondaryButtonClass} type="button" onClick={focusCamperSearch}><Search className="h-4 w-4" />Scan Camper ID</button>
            <button className={secondaryButtonClass} type="button" onClick={openRosterReport}>View My Roster</button>
          </div>
        </div>
        {selectedWindow ? <p className="mt-3 text-sm font-bold text-slate-500">Currently registering: {selectedWindow.label} • {selectedWindow.description}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader title="Find Camper" detail="Search by name, cabin, or scan QR code">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-900 text-sm font-black text-white">1</span>
        </SectionHeader>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input ref={searchInputRef} className="min-h-8 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, cabin, unit, gender" />
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-black" type="button" onClick={() => setShowCamperFilters((current) => !current)} aria-label="Toggle camper filters"><SlidersHorizontal className="h-4 w-4" /></button>
        </label>

        {showCamperFilters ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-black text-slate-700">Unit</p>
                <div className="flex flex-wrap gap-2">
                  {["", ...camperUnits].map((unit) => <button key={unit || "all"} className={`rounded-lg px-3 py-2 text-sm font-black ${camperUnit === unit ? "bg-forest-700 text-white" : "bg-forest-50 text-forest-900"}`} type="button" onClick={() => setCamperUnit(unit)}>{unit ? unit.replace("Unit ", "") : "All"}</button>)}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-black text-slate-700">Gender</p>
                <div className="flex flex-wrap gap-2">
                  {["", ...camperGenders].map((gender) => <button key={gender || "all"} className={`rounded-lg px-3 py-2 text-sm font-black ${camperGender === gender ? "bg-forest-700 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200"}`} type="button" onClick={() => setCamperGender(gender)}>{gender || "All"}</button>)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <select className={inputClass} value={camperCabin} onChange={(event) => setCamperCabin(event.target.value)}>
                <option value="">All cabins</option>
                {camperCabins.map((cabin) => <option key={cabin} value={cabin}>{cabin}</option>)}
              </select>
              <button className={secondaryButtonClass} type="button" onClick={clearCamperFilters}>Clear filters</button>
            </div>
          </>
        ) : null}

        <div className="mt-4 grid max-h-[34rem] gap-2 overflow-auto pr-1">
          {filteredCampers.map((camper) => (
            <button
              key={camper.id}
              className={`rounded-xl border p-4 text-left transition ${camper.id === camperId ? "border-lake-600 bg-lake-50 shadow-sm ring-1 ring-lake-600" : "border-slate-200 bg-white hover:border-lake-200 hover:bg-lake-50/40"}`}
              type="button"
              onClick={() => setCamperId(camper.id)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 font-black text-slate-700">{camper.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
                <span className="font-bold text-forest-900">{camper.name}</span>
                <Badge tone="blue">Swim {camper.swim}</Badge>
                {camper.counselorAssistant ? <Badge tone="blue">CA</Badge> : null}
                {camper.medicalFlags ? <Badge tone="amber">Medical</Badge> : null}
              </span>
              <span className="mt-1 block pl-14 text-sm text-slate-500">{camper.cabin} • {camper.unit}</span>
              {camper.weeks?.length ? <span className="mt-1 block truncate pl-14 text-xs font-semibold text-slate-500">{camper.weeks.join(" · ")}</span> : null}
            </button>
          ))}
          {!filteredCampers.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No campers match these filters.</p> : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Choose Activity" detail="Tap an area, or search to jump straight to a class">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-900 text-sm font-black text-white">2</span>
        </SectionHeader>

        <div className="grid gap-4">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input className="min-h-8 flex-1 bg-transparent text-sm outline-none" value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Search activity, area, or period" />
          </label>

          <div>
            <p className="mb-2 text-sm font-black text-slate-700">Area</p>
            <div className="flex flex-wrap gap-2">
              <button
                key="all-areas"
                className={`rounded-lg px-3 py-2 text-sm font-black ${activityArea === "" ? "bg-forest-700 text-white" : "bg-forest-50 text-forest-900"}`}
                type="button"
                onClick={() => setActivityArea("")}
              >
                All
              </button>
              {activityAreas.map((area) => (
                <button
                  key={area}
                  className={`rounded-lg px-3 py-2 text-sm font-black ${activityArea === area ? "bg-forest-700 text-white" : "bg-forest-50 text-forest-900"}`}
                  type="button"
                  onClick={() => setActivityArea(area)}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select className={inputClass} value={activityDay} onChange={(event) => setActivityDay(event.target.value)}>
              <option value="">A & B days</option>
              <option value="A">A Day</option>
              <option value="B">B Day</option>
            </select>
            <select className={inputClass} value={activityPeriod} onChange={(event) => setActivityPeriod(event.target.value)}>
              <option value="">All periods</option>
              {activityPeriods.map((period) => <option key={period} value={period}>Period {period}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {filteredOfferings.length > visibleOfferings.length
              ? <Badge tone="amber">Showing first {visibleOfferings.length} of {filteredOfferings.length} — pick an area to see all</Badge>
              : <Badge tone="green">{filteredOfferings.length} {filteredOfferings.length === 1 ? "offering" : "offerings"}</Badge>}
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearActivityFilters}>Clear activity filters</button>
          </div>

          <div className="grid max-h-[33rem] gap-3 overflow-auto pr-1">
            {visibleOfferings.map((offering) => {
              const count = offering.count + (localCounts[offering.id] ?? 0);
              return (
                <button
                  key={offering.id}
                  className={`rounded-xl border p-4 text-left transition ${offering.id === offeringId ? "border-lake-600 bg-lake-50 shadow-sm ring-1 ring-lake-600" : "border-slate-200 bg-white hover:border-lake-200 hover:bg-lake-50/40"}`}
                  type="button"
                  onClick={() => setOfferingId(offering.id)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-3">
                      <ActivityIcon activity={offering.activity} area={offering.area} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-forest-900">{offering.activity}</span>
                        <span className="mt-1 block text-sm text-slate-500">{offering.period} - {offering.area}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <CapacityPill count={count} limit={offering.limit} limitType={offering.limitType} />
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </span>
                  </span>
                </button>
              );
            })}
            {!visibleOfferings.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No activity matches these filters.</p> : null}
          </div>

        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Selection Summary" />
        <div className="grid gap-4">
          {selectedCamper ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-black text-forest-900">Camper</p>
              <p className="font-black">{selectedCamper.name}</p>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <CamperQuickEdit
                  camperId={selectedCamper.id}
                  camperName={selectedCamper.name}
                  currentCabinId={selectedCamper.cabinId ?? null}
                  currentCabinName={selectedCamper.cabin}
                  cabins={cabins}
                  canEdit={canEditCampers}
                />
                <span>• {selectedCamper.unit}</span>
              </p>
              {selectedCamper.weeks?.length ? <p className="mt-1 text-xs font-semibold text-slate-500">{selectedCamper.weeks.join(" · ")}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2"><Badge tone="blue">{selectedCamper.swim}</Badge>{selectedCamper.medicalFlags ? <Badge tone="amber">{selectedCamper.medicalFlags}</Badge> : null}</div>
              {selectedCamper.counselorAssistant ? (
                <div className="mt-3 rounded-lg border border-lake-100 bg-lake-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-lake-900">CA role for this activity</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className={`rounded-lg border px-3 py-2 text-sm font-black ${registrationRole === "CAMPER" ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700"}`} type="button" onClick={() => setRegistrationRole("CAMPER")}>Camper in activity</button>
                    <button className={`rounded-lg border px-3 py-2 text-sm font-black ${registrationRole === "TEACHING_ASSISTANT" ? "border-lake-700 bg-lake-700 text-white" : "border-slate-200 bg-white text-slate-700"}`} type="button" onClick={() => setRegistrationRole("TEACHING_ASSISTANT")}>CA assisting</button>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-lake-900">CA assisting does not count as class capacity or lead staff.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedCamper ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-forest-900">Card Check — current schedule</p>
                <span className="text-xs font-bold text-slate-500">
                  {scheduleLoading ? "Loading…" : `${filledSlotCount} of 8 periods filled`}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Laid out like the paper card. A-day left, B-day right. Use ✕ to remove a class entered by mistake.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[CARD_A_PERIODS, CARD_B_PERIODS].map((periods, columnIndex) => (
                  <table key={columnIndex} className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-forest-900 text-white">
                        <th className="w-10 border border-forest-900 p-1.5 text-left">Pd</th>
                        <th className="border border-forest-900 p-1.5 text-left">Activity</th>
                        <th className="w-8 border border-forest-900 p-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((slot) => {
                        const entries = scheduleByPeriod[slot] ?? [];
                        const entry = entries[0];
                        return (
                          <tr key={slot}>
                            <td className="border border-slate-300 p-1.5 text-base font-extrabold text-forest-900">{slot}</td>
                            <td className="border border-slate-300 p-1.5 align-middle font-semibold leading-snug text-slate-900">
                              {entry ? (
                                <>
                                  {entry.activity}
                                  {entry.isTeachingAssistant ? <span className="ml-1 text-[10px] font-black text-lake-700">(TA)</span> : null}
                                  {entries.length > 1 ? <span className="ml-1 text-[10px] font-black text-red-600">+{entries.length - 1} more</span> : null}
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="border border-slate-300 p-0.5 text-center align-middle">
                              {entry ? (
                                <button
                                  type="button"
                                  className="grid h-7 w-7 place-items-center rounded-md text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                  onClick={() => removeRegistration(entry.id, entry.activity, slot)}
                                  disabled={removingId === entry.id || isPending}
                                  aria-label={`Remove ${entry.activity} from period ${slot}`}
                                  title={`Remove ${entry.activity}`}
                                >
                                  {removingId === entry.id ? <span className="text-[10px] font-black">…</span> : <X className="h-4 w-4" />}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          ) : null}

          {selectedOffering ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <ActivityIcon activity={selectedOffering.activity} area={selectedOffering.area} />
                  <div>
                    <p className="font-black text-forest-900">{selectedOffering.activity}</p>
                    <p className="text-sm text-slate-500">{selectedOffering.area} • {selectedOffering.period}</p>
                  </div>
                </div>
                <CapacityPill count={selectedCount} limit={selectedOffering.limit} limitType={selectedOffering.limitType} />
              </div>
            </div>
          ) : null}

          <div className={`rounded-xl border p-4 ${!unitEligible || !swimEligible || periodConflict ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-forest-900">Eligibility Check</p>
                <p className="mt-1 text-sm text-slate-600">
                  {!unitEligible || !swimEligible || periodConflict
                    ? "This registration will need an override to go through."
                    : isFull
                      ? "This offering may require override approval."
                      : "This camper is eligible for this activity."}
                </p>
              </div>
              <CheckCircle2 className={`h-6 w-6 ${!unitEligible || !swimEligible || periodConflict ? "text-amber-600" : "text-green-700"}`} />
            </div>
            <div className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
              <span>{unitEligible ? "✓" : "✕"} Unit allowed{camperIsExempt ? " (CA — exempt)" : ""}</span>
              <span>{swimEligible ? "✓" : "✕"} Swim level open{camperIsExempt ? " (CA — exempt)" : ""}</span>
              <span>{periodConflict ? "✕" : "✓"} No period conflict</span>
            </div>
          </div>

          <input className={inputClass} value={approval} onChange={(event) => setApproval(event.target.value)} placeholder="Counselor initials/name" />

          {canOverride ? (
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-forest-900">
              <input
                checked={override}
                onChange={(event) => {
                  if (!event.target.checked) {
                    setOverride(false);
                    setOverrideApprovedBy("");
                    return;
                  }
                  const name = promptForOverrideApproval();
                  if (name) {
                    setOverride(true);
                    setOverrideApprovedBy(name);
                  } else {
                    setMessage("Override not enabled — an approver name is required.");
                  }
                }}
                type="checkbox"
              />
              {override && overrideApprovedBy ? `Override approved by ${overrideApprovedBy}` : "Use Area Head / Executive override"}
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button className={`${buttonClass} w-full`} type="button" disabled={isPending || !camperId || !offeringId || !filteredOfferings.length || !filteredCampers.length} onClick={() => register()}>
              <Plus className="h-4 w-4" />
              Add {registrationRole === "TEACHING_ASSISTANT" ? "Teaching Assistant" : "Camper"} to {selectedOffering?.activity ?? "Activity"}
            </button>
          </div>
          {overrideOffer && overrideOffer.offeringId === offeringId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-900">
              <span>{overrideOffer.activityName} needs Area Head / Executive Admin approval to override.</span>
              <button className="inline-flex min-h-9 items-center gap-1 rounded-md border border-orange-400 bg-white px-3 text-sm font-black text-orange-900 hover:bg-orange-100" disabled={isPending} type="button" onClick={allowOverrideAndRegister}>
                Allow override
              </button>
            </div>
          ) : null}
          {waitlistOffer && waitlistOffer.offeringId === offeringId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              <span>{waitlistOffer.activityName} is full, but has a waitlist.</span>
              <button className="inline-flex min-h-9 items-center gap-1 rounded-md border border-amber-400 bg-white px-3 text-sm font-black text-amber-900 hover:bg-amber-100" disabled={isPending} type="button" onClick={() => register({ joinWaitlist: true })}>
                Add to waitlist instead
              </button>
            </div>
          ) : null}
          {message ? <p className="rounded-md bg-lake-50 px-3 py-2 text-sm font-bold text-lake-700">{message}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
