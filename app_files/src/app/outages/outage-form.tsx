"use client";

import { useMemo, useState } from "react";
import { OutageReason } from "@prisma/client";
import { Search, X } from "lucide-react";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

export type CamperOption = {
  id: string;
  name: string;
  cabinId: string | null;
  cabinName: string;
  unit: string;
};

export type StaffOption = {
  id: string;
  name: string;
  area: string;
};

export type CabinOption = {
  id: string;
  name: string;
};

export type SelectedStaff = {
  id: string;
  name: string;
  area: string;
  phone: string;
};

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type OutageFormInitial = {
  campers: CamperOption[];
  staff: SelectedStaff[];
  reason: OutageReason;
  manualTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  fullDay: boolean;
  periods: string[];
  notes: string;
};

export function OutageForm({
  campers,
  staff,
  cabins,
  action,
  outageId,
  initial,
  submitLabel = "Create outage"
}: {
  campers: CamperOption[];
  staff: StaffOption[];
  cabins: CabinOption[];
  action: (formData: FormData) => Promise<void>;
  outageId?: string;
  initial?: OutageFormInitial;
  submitLabel?: string;
}) {
  const [camperQuery, setCamperQuery] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [selectedCampers, setSelectedCampers] = useState<CamperOption[]>(initial?.campers ?? []);
  const [selectedStaff, setSelectedStaff] = useState<SelectedStaff[]>(initial?.staff ?? []);
  const [cabinQuickAddId, setCabinQuickAddId] = useState("");

  const selectedCamperIds = useMemo(() => new Set(selectedCampers.map((c) => c.id)), [selectedCampers]);
  const selectedStaffIds = useMemo(() => new Set(selectedStaff.map((s) => s.id)), [selectedStaff]);

  const camperMatches = useMemo(
    () => searchable(campers.filter((c) => !selectedCamperIds.has(c.id)), camperQuery, (camper) => `${camper.name} ${camper.cabinName} ${camper.unit}`),
    [campers, camperQuery, selectedCamperIds]
  );
  const staffMatches = useMemo(
    () => searchable(staff.filter((s) => !selectedStaffIds.has(s.id)), staffQuery, (person) => `${person.name} ${person.area}`),
    [staff, staffQuery, selectedStaffIds]
  );

  function addCamper(camper: CamperOption) {
    setSelectedCampers((prev) => (prev.some((c) => c.id === camper.id) ? prev : [...prev, camper]));
    setCamperQuery("");
  }

  function removeCamper(id: string) {
    setSelectedCampers((prev) => prev.filter((c) => c.id !== id));
  }

  function addStaff(person: StaffOption) {
    setSelectedStaff((prev) => (prev.some((s) => s.id === person.id) ? prev : [...prev, { ...person, phone: "" }]));
    setStaffQuery("");
  }

  function removeStaff(id: string) {
    setSelectedStaff((prev) => prev.filter((s) => s.id !== id));
  }

  function setStaffPhone(id: string, phone: string) {
    setSelectedStaff((prev) => prev.map((s) => (s.id === id ? { ...s, phone } : s)));
  }

  function addWholeCabin() {
    if (!cabinQuickAddId) return;
    const cabinCampers = campers.filter((c) => c.cabinId === cabinQuickAddId);
    setSelectedCampers((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const additions = cabinCampers.filter((c) => !existingIds.has(c.id));
      return [...prev, ...additions];
    });
  }

  return (
    <form action={action} className="grid gap-4">
      {outageId ? <input name="outageId" type="hidden" value={outageId} /> : null}
      {selectedCampers.map((camper) => (
        <input key={camper.id} name="camperIds" type="hidden" value={camper.id} />
      ))}
      {selectedStaff.map((person) => (
        <input key={person.id} name="staffEntries" type="hidden" value={JSON.stringify({ id: person.id, phone: person.phone.trim() })} />
      ))}

      <Field label="Reason">
        <select className={inputClass} name="reason" defaultValue={initial?.reason ?? OutageReason.TRIP}>
          {Object.values(OutageReason).map((reason) => <option key={String(reason)} value={String(reason)}>{label(String(reason) as OutageReason)}</option>)}
        </select>
      </Field>

      <div className="grid gap-2">
        <label className="text-sm font-black text-slate-700">Campers</label>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="min-h-11 flex-1 bg-transparent text-sm font-semibold outline-none"
              placeholder="Search campers by name, cabin, or unit..."
              value={camperQuery}
              onChange={(event) => setCamperQuery(event.target.value)}
            />
          </label>
          {camperQuery.trim() ? (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
              {camperMatches.length ? camperMatches.map((camper) => (
                <button key={camper.id} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-lake-50" type="button" onClick={() => addCamper(camper)}>
                  <span className="block text-sm font-black text-slate-900">{camper.name}</span>
                  <span className="block text-xs font-semibold text-slate-500">{camper.cabinName} • {camper.unit}</span>
                </button>
              )) : <p className="px-3 py-2 text-sm font-semibold text-slate-500">No matches.</p>}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Quick add</span>
            <select className={`${inputClass} !min-h-9 w-auto`} value={cabinQuickAddId} onChange={(event) => setCabinQuickAddId(event.target.value)}>
              <option value="">Whole cabin...</option>
              {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
            </select>
            <button type="button" className={`${secondaryButtonClass} !min-h-9 px-3 py-1.5`} onClick={addWholeCabin} disabled={!cabinQuickAddId}>
              Add all campers
            </button>
          </div>

          <div className="mt-3">
            {selectedCampers.length ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedCampers.map((camper) => (
                  <span key={camper.id} className="inline-flex items-center gap-1.5 rounded-full border border-lake-200 bg-lake-50 py-1 pl-3 pr-1.5 text-sm font-bold text-forest-900">
                    {camper.name} <span className="text-xs font-semibold text-slate-500">· {camper.cabinName}</span>
                    <button type="button" onClick={() => removeCamper(camper.id)} className="rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600" aria-label={`Remove ${camper.name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-500">No campers added yet — search above, or use "Quick add" for a whole cabin.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-black text-slate-700">Staff (optional)</label>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="min-h-11 flex-1 bg-transparent text-sm font-semibold outline-none"
              placeholder="Search staff by name or area..."
              value={staffQuery}
              onChange={(event) => setStaffQuery(event.target.value)}
            />
          </label>
          {staffQuery.trim() ? (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
              {staffMatches.length ? staffMatches.map((person) => (
                <button key={person.id} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-lake-50" type="button" onClick={() => addStaff(person)}>
                  <span className="block text-sm font-black text-slate-900">{person.name}</span>
                  <span className="block text-xs font-semibold text-slate-500">{person.area}</span>
                </button>
              )) : <p className="px-3 py-2 text-sm font-semibold text-slate-500">No matches.</p>}
            </div>
          ) : null}

          <div className="mt-3">
            {selectedStaff.length ? (
              <div className="grid gap-2">
                {selectedStaff.map((person) => (
                  <div key={person.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-lake-200 bg-lake-50 p-2">
                    <span className="text-sm font-black text-forest-900">{person.name}</span>
                    <span className="text-xs font-semibold text-slate-500">{person.area}</span>
                    <input
                      className={`${inputClass} !min-h-9 ml-auto w-40`}
                      placeholder="Contact phone (optional)"
                      value={person.phone}
                      onChange={(event) => setStaffPhone(person.id, event.target.value)}
                    />
                    <button type="button" onClick={() => removeStaff(person.id)} className="rounded-full p-1 text-slate-400 hover:bg-red-100 hover:text-red-600" aria-label={`Remove ${person.name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-500">No staff added — optional, but useful for trips off camp.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Trip name / title">
          <input className={inputClass} name="manualTitle" placeholder="Example: Unit 3 canoe trip" defaultValue={initial?.manualTitle ?? ""} />
        </Field>
        <Field label="Location">
          <input className={inputClass} name="location" placeholder="Example: Town — ice cream trip" defaultValue={initial?.location ?? ""} />
        </Field>
        <Field label="Start date">
          <input className={inputClass} name="startDate" type="date" defaultValue={initial?.startDate ?? dateValue(new Date())} required />
        </Field>
        <Field label="End date">
          <input className={inputClass} name="endDate" type="date" defaultValue={initial?.endDate ?? dateValue(new Date())} required />
        </Field>
      </div>
      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black">
        <input name="fullDay" type="checkbox" defaultChecked={initial?.fullDay ?? true} />
        Full day
      </label>
      <div>
        <p className="mb-2 text-sm font-black text-slate-700">Affected periods</p>
        <div className="flex flex-wrap gap-2">
          {STAFF_PERIODS.map((period) => (
            <label key={period} className="cursor-pointer">
              <input className="peer sr-only" name="periods" type="checkbox" value={period} defaultChecked={initial?.periods.includes(period) ?? false} />
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{PERIOD_LABEL[period]}</span>
            </label>
          ))}
        </div>
      </div>
      <Field label="Notes">
        <input className={inputClass} name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
      <button className={buttonClass} type="submit" disabled={!selectedCampers.length && !selectedStaff.length}>
        {submitLabel}
      </button>
      {!selectedCampers.length && !selectedStaff.length ? (
        <p className="-mt-2 text-xs font-semibold text-slate-500">Add at least one camper or staff member to create an outage.</p>
      ) : null}
    </form>
  );
}

function searchable<T>(items: T[], query: string, text: (item: T) => string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.slice(0, 8);
  return items.filter((item) => terms.every((term) => text(item).toLowerCase().includes(term))).slice(0, 12);
}
