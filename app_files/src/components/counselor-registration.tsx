"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { Badge, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

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
  const [isPending, startTransition] = useTransition();

  const camperUnits = useMemo(() => uniqueSorted(campers.map((camper) => camper.unit)), [campers]);
  const camperGenders = useMemo(() => uniqueSorted(campers.map((camper) => camper.gender)), [campers]);
  const camperCabins = useMemo(() => uniqueSorted(campers.map((camper) => camper.cabin)), [campers]);
  const activityAreas = useMemo(() => uniqueSorted(offerings.map((offering) => offering.area)), [offerings]);
  const activityPeriods = useMemo(() => uniqueSorted(offerings.map((offering) => periodNumber(offering.period))), [offerings]);

  const selectedWindow = registrationWindows.find((window) => window.value === registrationWindow);

  const filteredCampers = useMemo(() => {
    const term = query.toLowerCase().trim();
    return campers
      .filter((camper) => {
        if (camperUnit && camper.unit !== camperUnit) return false;
        if (camperGender && camper.gender !== camperGender) return false;
        if (camperCabin && camper.cabin !== camperCabin) return false;
        if (term && !`${camper.name} ${camper.cabin} ${camper.unit} ${camper.gender}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .slice(0, 40);
  }, [campers, query, camperUnit, camperGender, camperCabin]);

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
  const remainingSpots = selectedOffering?.limit ? Math.max(selectedOffering.limit - selectedOffering.count, 0) : null;
  const isFull = selectedOffering?.limit ? selectedOffering.count >= selectedOffering.limit : selectedOffering?.limitType === "SPECIAL_APPROVAL";

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
      setMessage(`${data.registration.camper.firstName} ${data.registration.camper.lastName} added to ${data.registration.offering.activity.name} for ${registrationWindow}.`);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-white bg-white p-5 shadow-soft lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-forest-900">Registration Window</h2>
            <p className="text-sm text-slate-600">New activity sign-ups will be saved to this window.</p>
          </div>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <select className={inputClass} name="window" defaultValue={registrationWindow}>
              {registrationWindows.map((window) => <option key={window.value} value={window.value}>{window.label} - {window.description}</option>)}
            </select>
            <button className={secondaryButtonClass} type="submit">Switch</button>
          </form>
        </div>
        {selectedWindow ? <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Currently registering: {selectedWindow.label} - {selectedWindow.description}</p> : null}
      </section>

      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-forest-900">Find Camper</h2>
          <span className="text-sm font-semibold text-slate-500">{filteredCampers.length} shown</span>
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="min-h-8 flex-1 outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, cabin, unit, gender" />
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

        <div className="mt-4 grid gap-2">
          {filteredCampers.map((camper) => (
            <button
              key={camper.id}
              className={`rounded-md border p-3 text-left transition ${camper.id === camperId ? "border-forest-600 bg-forest-50" : "border-slate-100 bg-white hover:border-lake-200"}`}
              type="button"
              onClick={() => setCamperId(camper.id)}
            >
              <span className="block font-semibold text-forest-900">{camper.name}</span>
              <span className="text-sm text-slate-500">{camper.cabin} - {camper.unit} - {camper.gender} - Swim {camper.swim}</span>
            </button>
          ))}
          {!filteredCampers.length ? <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No campers match these filters.</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-forest-900">Add Activity</h2>
          {isFull ? <Badge tone={canOverride ? "amber" : "red"}>{canOverride ? "Override available" : "Needs override"}</Badge> : <Badge tone="green">Open</Badge>}
        </div>

        <div className="mt-4 grid gap-4">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input className="min-h-8 flex-1 outline-none" value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Search activity, area, or period" />
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
            <p className="text-sm font-semibold text-slate-500">{filteredOfferings.length} activities match these filters</p>
            <button className={`${secondaryButtonClass} min-h-9 px-3 py-1 text-xs`} type="button" onClick={clearActivityFilters}>Clear activity filters</button>
          </div>

          <select className={inputClass} value={offeringId} onChange={(event) => setOfferingId(event.target.value)} disabled={!filteredOfferings.length}>
            {filteredOfferings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.period} - {offering.area} - {offering.activity} - {offering.count}/{offering.limit ?? "approval"}
              </option>
            ))}
          </select>

          {selectedCamper && selectedOffering ? (
            <div className="rounded-md bg-paper p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-forest-900">{selectedCamper.name} to {selectedOffering.activity}</p>
                  <p className="mt-1">{registrationWindow} - {selectedOffering.period} - {selectedOffering.area}</p>
                </div>
                {selectedOffering.limit ? <Badge tone={isFull ? "amber" : "green"}>{remainingSpots} spot{remainingSpots === 1 ? "" : "s"} left</Badge> : <Badge tone="amber">Approval required</Badge>}
              </div>
              <p className="mt-2">Enrollment: {selectedOffering.count}/{selectedOffering.limit ?? "approval only"}</p>
              <p className="mt-1">Eligible units: {selectedOffering.eligibleUnits.join(", ")} - swim: {selectedOffering.eligibleSwimLevels.join(", ")}</p>
              {isFull ? <p className="mt-2 font-semibold text-amber-800">This activity needs {canOverride ? "an override before adding." : "Area Head or Executive approval."}</p> : null}
            </div>
          ) : <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500">No activity matches these filters.</p>}

          <input className={inputClass} value={approval} onChange={(event) => setApproval(event.target.value)} placeholder="Counselor initials/name" />

          {canOverride ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-forest-900">
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
          {message ? <p className="rounded-md bg-lake-50 px-3 py-2 text-sm font-medium text-lake-700">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
