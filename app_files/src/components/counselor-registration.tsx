"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { Badge, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type CamperOption = {
  id: string;
  name: string;
  cabin: string;
  unit: string;
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

export function CounselorRegistration({
  campers,
  offerings,
  canOverride
}: {
  campers: CamperOption[];
  offerings: OfferingOption[];
  canOverride: boolean;
}) {
  const [query, setQuery] = useState("");
  const [camperId, setCamperId] = useState(campers[0]?.id ?? "");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const [approval, setApproval] = useState("");
  const [override, setOverride] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredCampers = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return campers.slice(0, 24);
    return campers.filter((camper) => `${camper.name} ${camper.cabin}`.toLowerCase().includes(term)).slice(0, 24);
  }, [campers, query]);

  const selectedOffering = offerings.find((offering) => offering.id === offeringId);
  const selectedCamper = campers.find((camper) => camper.id === camperId);
  const isFull = selectedOffering?.limit ? selectedOffering.count >= selectedOffering.limit : selectedOffering?.limitType === "SPECIAL_APPROVAL";

  function register() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camperId, offeringId, counselorApproval: approval, override })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Registration failed.");
        return;
      }
      setMessage(`${data.registration.camper.firstName} ${data.registration.camper.lastName} added to ${data.registration.offering.activity.name}.`);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-forest-900">Find Camper</h2>
        <label className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="min-h-8 flex-1 outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or cabin" />
        </label>
        <div className="mt-4 grid gap-2">
          {filteredCampers.map((camper) => (
            <button
              key={camper.id}
              className={`rounded-md border p-3 text-left transition ${camper.id === camperId ? "border-forest-600 bg-forest-50" : "border-slate-100 bg-white hover:border-lake-200"}`}
              type="button"
              onClick={() => setCamperId(camper.id)}
            >
              <span className="block font-semibold text-forest-900">{camper.name}</span>
              <span className="text-sm text-slate-500">{camper.cabin} - {camper.unit} - Swim {camper.swim}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-forest-900">Add Activity</h2>
          {isFull ? <Badge tone={canOverride ? "amber" : "red"}>{canOverride ? "Override available" : "Needs override"}</Badge> : <Badge tone="green">Open</Badge>}
        </div>

        <div className="mt-4 grid gap-4">
          <select className={inputClass} value={offeringId} onChange={(event) => setOfferingId(event.target.value)}>
            {offerings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.period} - {offering.area} - {offering.activity} - {offering.count}/{offering.limit ?? "approval"}
              </option>
            ))}
          </select>

          {selectedCamper && selectedOffering ? (
            <div className="rounded-md bg-paper p-4 text-sm text-slate-700">
              <p className="font-semibold text-forest-900">{selectedCamper.name} to {selectedOffering.activity}</p>
              <p className="mt-1">{selectedOffering.period} - {selectedOffering.area} - {selectedOffering.count}/{selectedOffering.limit ?? "approval"}</p>
              <p className="mt-1">Eligible units: {selectedOffering.eligibleUnits.join(", ")} - swim: {selectedOffering.eligibleSwimLevels.join(", ")}</p>
            </div>
          ) : null}

          <input className={inputClass} value={approval} onChange={(event) => setApproval(event.target.value)} placeholder="Counselor initials/name" />

          {canOverride ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-forest-900">
              <input checked={override} onChange={(event) => setOverride(event.target.checked)} type="checkbox" />
              Use Area Head / Executive override
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} type="button" disabled={isPending || !camperId || !offeringId} onClick={register}>
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
