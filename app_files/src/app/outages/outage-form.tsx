"use client";

import { useMemo, useState } from "react";
import { OutageReason, OutageSubjectType } from "@prisma/client";
import { Search } from "lucide-react";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { createOutage } from "./actions";

type CamperOption = {
  id: string;
  name: string;
  cabinId: string | null;
  cabinName: string;
  unit: string;
};

type StaffOption = {
  id: string;
  name: string;
  area: string;
};

type CabinOption = {
  id: string;
  name: string;
};

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function OutageForm({ campers, staff, cabins }: { campers: CamperOption[]; staff: StaffOption[]; cabins: CabinOption[] }) {
  const [subjectType, setSubjectType] = useState<OutageSubjectType>(OutageSubjectType.CAMPER);
  const [camperQuery, setCamperQuery] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [selectedCamper, setSelectedCamper] = useState<CamperOption | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [selectedCabinId, setSelectedCabinId] = useState("");

  const camperMatches = useMemo(() => searchable(campers, camperQuery, (camper) => `${camper.name} ${camper.cabinName} ${camper.unit}`), [campers, camperQuery]);
  const staffMatches = useMemo(() => searchable(staff, staffQuery, (person) => `${person.name} ${person.area}`), [staff, staffQuery]);
  const effectiveCabinId = subjectType === OutageSubjectType.CAMPER ? selectedCamper?.cabinId ?? "" : selectedCabinId;

  return (
    <form action={createOutage} className="grid gap-4">
      <input name="camperId" type="hidden" value={subjectType === OutageSubjectType.CAMPER ? selectedCamper?.id ?? "" : ""} />
      <input name="staffId" type="hidden" value={subjectType === OutageSubjectType.STAFF ? selectedStaff?.id ?? "" : ""} />
      <input name="cabinId" type="hidden" value={subjectType === OutageSubjectType.CABIN || subjectType === OutageSubjectType.CAMPER ? effectiveCabinId : ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Subject type">
          <select className={inputClass} name="subjectType" value={subjectType} onChange={(event) => setSubjectType(event.target.value as OutageSubjectType)}>
            {Object.values(OutageSubjectType).map((type) => <option key={String(type)} value={String(type)}>{label(String(type) as OutageSubjectType)}</option>)}
          </select>
        </Field>
        <Field label="Reason">
          <select className={inputClass} name="reason" defaultValue={OutageReason.TRIP}>
            {Object.values(OutageReason).map((reason) => <option key={String(reason)} value={String(reason)}>{label(String(reason) as OutageReason)}</option>)}
          </select>
        </Field>
      </div>

      {subjectType === OutageSubjectType.CAMPER ? (
        <SearchPicker
          labelText="Camper"
          placeholder="Start typing a camper name..."
          query={camperQuery}
          selectedLabel={selectedCamper ? `${selectedCamper.name} • ${selectedCamper.cabinName}` : "No camper selected"}
          matches={camperMatches.map((camper) => ({
            id: camper.id,
            title: camper.name,
            detail: `${camper.cabinName} • ${camper.unit}`,
            onSelect: () => {
              setSelectedCamper(camper);
              setCamperQuery(camper.name);
            }
          }))}
          setQuery={setCamperQuery}
        />
      ) : null}

      {subjectType === OutageSubjectType.STAFF ? (
        <SearchPicker
          labelText="Staff"
          placeholder="Start typing a staff name..."
          query={staffQuery}
          selectedLabel={selectedStaff ? `${selectedStaff.name} • ${selectedStaff.area}` : "No staff selected"}
          matches={staffMatches.map((person) => ({
            id: person.id,
            title: person.name,
            detail: person.area,
            onSelect: () => {
              setSelectedStaff(person);
              setStaffQuery(person.name);
            }
          }))}
          setQuery={setStaffQuery}
        />
      ) : null}

      {subjectType === OutageSubjectType.CABIN ? (
        <Field label="Cabin">
          <select className={inputClass} value={selectedCabinId} onChange={(event) => setSelectedCabinId(event.target.value)}>
            <option value="">Select cabin</option>
            {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
          </select>
        </Field>
      ) : null}

      {subjectType === OutageSubjectType.CAMPER && selectedCamper ? (
        <div className="rounded-xl border border-lake-100 bg-lake-50 p-3 text-sm font-bold text-forest-900">
          Cabin auto-selected: {selectedCamper.cabinName}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Manual trip / custom title">
          <input className={inputClass} name="manualTitle" placeholder="Example: Unit 3 canoe trip" />
        </Field>
        <Field label="Start date">
          <input className={inputClass} name="startDate" type="date" defaultValue={dateValue(new Date())} required />
        </Field>
        <Field label="End date">
          <input className={inputClass} name="endDate" type="date" defaultValue={dateValue(new Date())} required />
        </Field>
      </div>
      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black">
        <input name="fullDay" type="checkbox" defaultChecked />
        Full day
      </label>
      <div>
        <p className="mb-2 text-sm font-black text-slate-700">Affected periods</p>
        <div className="flex flex-wrap gap-2">
          {STAFF_PERIODS.map((period) => (
            <label key={period} className="cursor-pointer">
              <input className="peer sr-only" name="periods" type="checkbox" value={period} />
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{PERIOD_LABEL[period]}</span>
            </label>
          ))}
        </div>
      </div>
      <Field label="Notes">
        <input className={inputClass} name="notes" />
      </Field>
      <button className={buttonClass} type="submit">Create outage</button>
    </form>
  );
}

function SearchPicker({
  labelText,
  placeholder,
  query,
  selectedLabel,
  matches,
  setQuery
}: {
  labelText: string;
  placeholder: string;
  query: string;
  selectedLabel: string;
  matches: { id: string; title: string; detail: string; onSelect: () => void }[];
  setQuery: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-black text-slate-700">{labelText}</label>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="min-h-11 flex-1 bg-transparent text-sm font-semibold outline-none" placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <p className="mt-2 text-sm font-black text-forest-900">{selectedLabel}</p>
        {query.trim() ? (
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
            {matches.length ? matches.map((match) => (
              <button key={match.id} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-lake-50" type="button" onClick={match.onSelect}>
                <span className="block text-sm font-black text-slate-900">{match.title}</span>
                <span className="block text-xs font-semibold text-slate-500">{match.detail}</span>
              </button>
            )) : <p className="px-3 py-2 text-sm font-semibold text-slate-500">No matches.</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function searchable<T>(items: T[], query: string, text: (item: T) => string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.slice(0, 8);
  return items.filter((item) => terms.every((term) => text(item).toLowerCase().includes(term))).slice(0, 12);
}
