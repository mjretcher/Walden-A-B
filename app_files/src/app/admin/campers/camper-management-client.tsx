"use client";

import { useMemo, useState } from "react";
import { Badge, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type ServerAction = (formData: FormData) => Promise<void> | void;

type Option = {
  value: string;
  label: string;
  description?: string;
};

type RegistrationSummary = {
  id: string;
  registrationWindow: string;
  period: string;
  activity: string;
  area: string;
  status: string;
};

type CamperSummary = {
  id: string;
  name: string;
  cabinId: string | null;
  cabinName: string;
  gender: string;
  unit: string;
  swimLabel: string;
  swimCode: string;
  status: string;
  medicalFlags: string | null;
  registrations: RegistrationSummary[];
};

export function CamperManagementClient({
  campers,
  cabins,
  swimOptions,
  windows,
  visibleWindowValues,
  bulkUpdateAction,
  setAllMuskieAction,
  updateCabinAction
}: {
  campers: CamperSummary[];
  cabins: Option[];
  swimOptions: Option[];
  windows: Option[];
  visibleWindowValues: string[];
  bulkUpdateAction: ServerAction;
  setAllMuskieAction: ServerAction;
  updateCabinAction: ServerAction;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = campers.map((camper) => camper.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const historyWindows = windows.filter((window) => visibleWindowValues.includes(window.value));

  function setCamperSelected(camperId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(camperId);
      else next.delete(camperId);
      return Array.from(next);
    });
  }

  function setAllVisible(selected: boolean) {
    setSelectedIds(selected ? visibleIds : []);
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-white bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">Bulk actions</p>
            <h2 className="mt-1 text-xl font-bold text-forest-900">{selectedIds.length} selected</h2>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-forest-900">
              <input
                checked={allVisibleSelected}
                className="h-4 w-4 rounded border-slate-300 text-forest-700"
                onChange={(event) => setAllVisible(event.target.checked)}
                type="checkbox"
              />
              Select all visible campers
            </label>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <form action={bulkUpdateAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              {selectedIds.map((id) => (
                <input key={id} name="camperId" type="hidden" value={id} />
              ))}
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Set selected swim level
                <select className={inputClass} defaultValue="MUSKIE" name="swimLevel">
                  {swimOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button className={buttonClass} disabled={selectedIds.length === 0} type="submit">Apply to selected</button>
            </form>

            <form action={setAllMuskieAction}>
              <button className={secondaryButtonClass} type="submit">Set all active campers to Muskie</button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        {campers.map((camper) => {
          const selected = selectedSet.has(camper.id);
          return (
            <article key={camper.id} className="rounded-lg border border-white bg-white p-4 shadow-soft">
              <div className="grid gap-4 xl:grid-cols-[auto_1fr_22rem] xl:items-start">
                <label className="flex cursor-pointer items-center gap-3 xl:pt-2">
                  <input
                    checked={selected}
                    className="h-5 w-5 rounded border-slate-300 text-forest-700"
                    onChange={(event) => setCamperSelected(camper.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="sr-only">Select {camper.name}</span>
                </label>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-forest-900">{camper.name}</h3>
                    <Badge tone="blue">{camper.swimLabel}</Badge>
                    {camper.medicalFlags ? <Badge tone="amber">Medical</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {camper.cabinName} - {camper.unit} - {camper.gender} - {camper.swimLabel} - {camper.status}
                  </p>
                  {camper.medicalFlags ? <p className="mt-2 text-sm font-medium text-amber-800">{camper.medicalFlags}</p> : null}
                </div>

                <form action={updateCabinAction} className="grid gap-2 rounded-md bg-paper p-3 sm:grid-cols-[1fr_auto] xl:grid-cols-1">
                  <input name="camperId" type="hidden" value={camper.id} />
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Cabin
                    <select className={inputClass} defaultValue={camper.cabinId ?? ""} name="cabinId">
                      <option value="">No cabin</option>
                      {cabins.map((cabin) => (
                        <option key={cabin.value} value={cabin.value}>{cabin.label}</option>
                      ))}
                    </select>
                  </label>
                  <button className={secondaryButtonClass} type="submit">Save cabin</button>
                </form>
              </div>

              <details className="mt-4 rounded-md border border-slate-100 bg-slate-50/70 p-3">
                <summary className="cursor-pointer text-sm font-bold text-forest-900">Registration history / schedule</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {historyWindows.map((window) => {
                    const registrations = camper.registrations.filter((registration) => registration.registrationWindow === window.value);
                    return (
                      <div key={window.value} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-forest-900">{window.label}</p>
                          <Badge>{registrations.length}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2">
                          {registrations.length ? registrations.map((registration) => (
                            <div key={registration.id} className="rounded-md bg-paper p-2 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-slate-900">{registration.period} - {registration.activity}</p>
                                <Badge tone={registration.status === "Active" || registration.status === "Overridden" ? "green" : "neutral"}>{registration.status}</Badge>
                              </div>
                              <p className="mt-1 text-slate-500">{registration.area}</p>
                            </div>
                          )) : <p className="text-sm text-slate-500">No registrations.</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}
