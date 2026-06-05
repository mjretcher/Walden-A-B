"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { Badge, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass, subtlePanelClass } from "@/components/ui";

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
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [allMuskieConfirm, setAllMuskieConfirm] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = campers.map((camper) => camper.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const historyWindows = windows.filter((window) => visibleWindowValues.includes(window.value));
  const bulkUnlocked = selectedIds.length > 0 && bulkConfirm.trim().toUpperCase() === "SWIM";
  const allMuskieUnlocked = allMuskieConfirm.trim().toUpperCase() === "SET ALL TO MUSKIE";

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
      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-forest-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-forest-800">
              <Lock className="h-3.5 w-3.5" />
              Locked edits
            </div>
            <h2 className="mt-1 text-xl font-bold text-forest-900">{selectedIds.length} selected</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Camper records stay read-only by default. Bulk updates require selecting campers, opening a guarded action, and typing the confirmation phrase.
            </p>
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

          <div className="grid w-full gap-3 xl:max-w-xl">
            <details className={subtlePanelClass}>
              <summary className="cursor-pointer list-none text-sm font-black text-forest-900">
                Unlock selected swim-level change
              </summary>
              <form action={bulkUpdateAction} className="mt-4 grid gap-3">
                {selectedIds.map((id) => (
                  <input key={id} name="camperId" type="hidden" value={id} />
                ))}
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  New swim level
                  <select className={inputClass} defaultValue="MUSKIE" name="swimLevel">
                    {swimOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Type SWIM to confirm
                  <input
                    className={inputClass}
                    name="confirmBulkSwim"
                    placeholder="SWIM"
                    value={bulkConfirm}
                    onChange={(event) => setBulkConfirm(event.target.value)}
                  />
                </label>
                <button className={buttonClass} disabled={!bulkUnlocked} type="submit">
                  <ShieldCheck className="h-4 w-4" />
                  Apply to selected campers
                </button>
              </form>
            </details>

            <details className="rounded-lg border border-red-200 bg-red-50/70 p-4">
              <summary className="cursor-pointer list-none text-sm font-black text-red-900">
                Set all active campers to Muskie
              </summary>
              <form action={setAllMuskieAction} className="mt-4 grid gap-3">
                <div className="flex gap-2 text-sm font-semibold leading-6 text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  This changes every active camper in the active session. Use only after swim-test data has been reviewed.
                </div>
                <label className="grid gap-1.5 text-sm font-semibold text-red-900">
                  Type SET ALL TO MUSKIE to confirm
                  <input
                    className={inputClass}
                    name="confirmAllMuskie"
                    placeholder="SET ALL TO MUSKIE"
                    value={allMuskieConfirm}
                    onChange={(event) => setAllMuskieConfirm(event.target.value)}
                  />
                </label>
                <button className={dangerButtonClass} disabled={!allMuskieUnlocked} type="submit">
                  Confirm Muskie update
                </button>
              </form>
            </details>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        {campers.map((camper) => {
          const selected = selectedSet.has(camper.id);
          return (
            <article key={camper.id} className="rounded-lg border border-white bg-white p-4 shadow-soft">
              <div className="grid gap-4 xl:grid-cols-[auto_1fr_20rem] xl:items-start">
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
                    <Badge tone="blue">{camper.swimCode} - {camper.swimLabel}</Badge>
                    {camper.medicalFlags ? <Badge tone="amber">Medical</Badge> : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <ReadOnlyFact label="Cabin" value={camper.cabinName} />
                    <ReadOnlyFact label="Unit" value={camper.unit} />
                    <ReadOnlyFact label="Gender" value={camper.gender} />
                    <ReadOnlyFact label="Status" value={camper.status} />
                  </div>
                  {camper.medicalFlags ? <p className="mt-2 text-sm font-medium text-amber-800">{camper.medicalFlags}</p> : null}
                </div>

                <GuardedCabinEditor camper={camper} cabins={cabins} updateCabinAction={updateCabinAction} />
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

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-forest-900">{value}</p>
    </div>
  );
}

function GuardedCabinEditor({
  camper,
  cabins,
  updateCabinAction
}: {
  camper: CamperSummary;
  cabins: Option[];
  updateCabinAction: ServerAction;
}) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === camper.name.toLowerCase();

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <summary className="cursor-pointer list-none text-sm font-black text-forest-900">Change cabin</summary>
      <form action={updateCabinAction} className="mt-3 grid gap-3">
        <input name="camperId" type="hidden" value={camper.id} />
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Cabin
          <select className={inputClass} defaultValue={camper.cabinId ?? ""} name="cabinId">
            <option value="">No cabin</option>
            {cabins.map((cabin) => (
              <option key={cabin.value} value={cabin.value}>{cabin.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Type camper name to unlock
          <input
            className={inputClass}
            name="confirmCamperName"
            placeholder={camper.name}
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </label>
        <button className={secondaryButtonClass} disabled={!unlocked} type="submit">
          Save cabin change
        </button>
      </form>
    </details>
  );
}
