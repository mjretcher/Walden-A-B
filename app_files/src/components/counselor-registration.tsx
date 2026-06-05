"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { ActivityIcon } from "@/components/activity-icon";
import { Badge, CapacityPill, Panel, SectionHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type CamperOption = {
  id: string;
  name: string;
  cabin: string;
  unit: string;
  gender: string;
  swim: string;
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
  active: boolean;
  eligibleUnits: string[];
  eligibleSwimLevels: string[];
};

type RegistrationWindowOption = {
  value: string;
  label: string;
  description: string;
};

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
  registrationWindow,
  registrationWindows
}: {
  campers: CamperOption[];
  offerings: OfferingOption[];
  canOverride: boolean;
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
  const [message, setMessage] = useState("");
  const [localCounts, setLocalCounts] = useState<Record<string, number>>({});
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

  const visibleOfferings = filteredOfferings.slice(0, 60);

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

  function register() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camperId, offeringId, counselorApproval: approval, override, registrationWindow })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Registration failed.");
        return;
      }
      setLocalCounts((current) => ({ ...current, [offeringId]: (current[offeringId] ?? 0) + 1 }));
      setApproval("");
      setMessage(`${data.registration.camper.firstName} ${data.registration.camper.lastName} added to ${data.registration.offering.activity.name} for ${registrationWindow}.`);
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.15fr]">
      <Panel className="xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-forest-900">Registration Window</h2>
            <p className="text-sm text-slate-600">New activity sign-ups save to the selected window.</p>
          </div>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <select className={inputClass} name="window" defaultValue={registrationWindow}>
              {registrationWindows.map((window) => <option key={window.value} value={window.value}>{window.label} - {window.description}</option>)}
            </select>
            <button className={secondaryButtonClass} type="submit">Switch</button>
          </form>
        </div>
        {selectedWindow ? <p className="mt-3 rounded-md border border-lake-100 bg-lake-50 px-3 py-2 text-sm font-bold text-lake-700">Currently registering: {selectedWindow.label} - {selectedWindow.description}</p> : null}
      </Panel>

      <Panel>
        <SectionHeader title="Find Camper" detail={`${matchingCampers.length} match${matchingCampers.length === 1 ? "" : "es"}`}>
          {matchingCampers.length > filteredCampers.length ? <Badge tone="amber">Showing first {filteredCampers.length}</Badge> : null}
        </SectionHeader>

        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="min-h-8 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, cabin, unit, gender" />
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className={inputClass} value={camperUnit} onChange={(event) => setCamperUnit(event.target.value)}>
            <option value="">All units</option>
            {camperUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          <select className={inputClass} value={camperGender} onChange={(event) => setCamperGender(event.target.value)}>
            <option value="">All genders</option>
            {camperGenders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
          </select>
          <select className={inputClass} value={camperCabin} onChange={(event) => setCamperCabin(event.target.value)}>
            <option value="">All cabins</option>
            {camperCabins.map((cabin) => <option key={cabin} value={cabin}>{cabin}</option>)}
          </select>
        </div>

        <button className={`${secondaryButtonClass} mt-3 min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearCamperFilters}>Clear camper filters</button>

        <div className="mt-4 grid max-h-[34rem] gap-2 overflow-auto pr-1">
          {filteredCampers.map((camper) => (
            <button
              key={camper.id}
              className={`rounded-lg border p-3 text-left transition ${camper.id === camperId ? "border-forest-600 bg-forest-50 shadow-sm" : "border-slate-200 bg-white hover:border-lake-200 hover:bg-lake-50/40"}`}
              type="button"
              onClick={() => setCamperId(camper.id)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-forest-900">{camper.name}</span>
                <Badge tone="blue">Swim {camper.swim}</Badge>
                {camper.medicalFlags ? <Badge tone="amber">Medical</Badge> : null}
              </span>
              <span className="mt-1 block text-sm text-slate-500">{camper.cabin} - {camper.unit} - {camper.gender}</span>
            </button>
          ))}
          {!filteredCampers.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No campers match these filters.</p> : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Choose Activity" detail={`${filteredOfferings.length} offering${filteredOfferings.length === 1 ? "" : "s"} match`}>
          {isFull ? <Badge tone={canOverride ? "amber" : "red"}>{canOverride ? "Override available" : "Needs override"}</Badge> : <Badge tone="green">Open</Badge>}
        </SectionHeader>

        <div className="grid gap-4">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input className="min-h-8 flex-1 bg-transparent text-sm outline-none" value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Search activity, area, or period" />
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            <select className={inputClass} value={activityArea} onChange={(event) => setActivityArea(event.target.value)}>
              <option value="">All areas</option>
              {activityAreas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
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
            {filteredOfferings.length > visibleOfferings.length ? <Badge tone="amber">Showing first {visibleOfferings.length}</Badge> : <span />}
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearActivityFilters}>Clear activity filters</button>
          </div>

          <div className="grid max-h-[26rem] gap-2 overflow-auto pr-1">
            {visibleOfferings.map((offering) => {
              const count = offering.count + (localCounts[offering.id] ?? 0);
              return (
                <button
                  key={offering.id}
                  className={`rounded-lg border p-3 text-left transition ${offering.id === offeringId ? "border-forest-600 bg-forest-50 shadow-sm" : "border-slate-200 bg-white hover:border-lake-200 hover:bg-lake-50/40"}`}
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
                    <CapacityPill count={count} limit={offering.limit} limitType={offering.limitType} />
                  </span>
                </button>
              );
            })}
            {!visibleOfferings.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No activity matches these filters.</p> : null}
          </div>

          {selectedCamper && selectedOffering ? (
            <div className="rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <ActivityIcon activity={selectedOffering.activity} area={selectedOffering.area} size="sm" />
                  <p className="font-bold text-forest-900">{selectedCamper.name} to {selectedOffering.activity}</p>
                </div>
                <CapacityPill count={selectedCount} limit={selectedOffering.limit} limitType={selectedOffering.limitType} />
              </div>
              <p className="mt-1">{registrationWindow} - {selectedOffering.period} - {selectedOffering.area}</p>
              <p className="mt-1">Eligible units: {selectedOffering.eligibleUnits.join(", ")} - swim: {selectedOffering.eligibleSwimLevels.join(", ")}</p>
            </div>
          ) : null}

          <input className={inputClass} value={approval} onChange={(event) => setApproval(event.target.value)} placeholder="Counselor initials/name" />

          {canOverride ? (
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-forest-900">
              <input checked={override} onChange={(event) => setOverride(event.target.checked)} type="checkbox" />
              Use Area Head / Executive override
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} type="button" disabled={isPending || !camperId || !offeringId || !filteredOfferings.length || !filteredCampers.length} onClick={register}>
              <CheckCircle2 className="h-4 w-4" />
              Add camper
            </button>
            <button className={secondaryButtonClass} type="button" onClick={() => setMessage("")}>Clear message</button>
          </div>
          {message ? <p className="rounded-md bg-lake-50 px-3 py-2 text-sm font-bold text-lake-700">{message}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
