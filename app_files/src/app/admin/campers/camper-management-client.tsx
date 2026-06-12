"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList, Fish, MoreVertical, ShieldCheck } from "lucide-react";
import { Badge, dangerButtonClass, inputClass } from "@/components/ui";

type ServerAction = (formData: FormData) => Promise<void> | void;

type Option = {
  value: string;
  label: string;
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
  genderIdentity: string | null;
  age: number | null;
  campGrade: string | null;
  unit: string;
  swimLabel: string;
  swimCode: string;
  status: string;
  medicalFlags: string | null;
  weeks: { block: string; cabin: string }[];
  updatedAt: string;
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
  updateCabinAction,
  updateMedicalAction
}: {
  campers: CamperSummary[];
  cabins: Option[];
  swimOptions: Option[];
  windows: Option[];
  visibleWindowValues: string[];
  bulkUpdateAction: ServerAction;
  setAllMuskieAction: ServerAction;
  updateCabinAction: ServerAction;
  updateMedicalAction: ServerAction;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState(campers[0]?.id ?? "");
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [allMuskieConfirm, setAllMuskieConfirm] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = campers.length > 0 && campers.every((camper) => selectedSet.has(camper.id));
  const historyWindows = windows.filter((window) => visibleWindowValues.includes(window.value));
  const bulkUnlocked = selectedIds.length > 0 && bulkConfirm.trim().toUpperCase() === "SWIM";
  const allMuskieUnlocked = allMuskieConfirm.trim().toUpperCase() === "SET ALL TO MUSKIE";

  function toggleCamper(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });
  }

  function toggleAll(selected: boolean) {
    setSelectedIds(selected ? campers.map((camper) => camper.id) : []);
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-green-300 bg-green-50/70 p-4 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <label className="flex items-center gap-4">
            <input checked={allVisibleSelected} onChange={(event) => toggleAll(event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-forest-700" type="checkbox" />
            <span className="text-sm font-black text-forest-900">{selectedIds.length} selected</span>
            <span className="text-sm font-bold text-lake-700">Select all {campers.length} on this page</span>
          </label>

          <form action={bulkUpdateAction} className="flex flex-wrap items-center gap-2">
            {selectedIds.map((id) => <input key={id} name="camperId" type="hidden" value={id} />)}
            <input name="confirmBulkSwim" type="hidden" value={bulkUnlocked ? "SWIM" : ""} />
            <span className="mr-2 text-sm font-black text-slate-700">Bulk Swim Level</span>
            <input className="min-h-10 w-24 rounded-lg border border-slate-200 px-3 text-sm font-bold" placeholder="SWIM" value={bulkConfirm} onChange={(event) => setBulkConfirm(event.target.value)} />
            {swimOptions.map((option) => (
              <button key={option.value} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black transition ${option.value === "MUSKIE" ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`} disabled={!bulkUnlocked} name="swimLevel" value={option.value} type="submit">
                <Fish className="h-4 w-4" />
                <span>{option.label}</span>
              </button>
            ))}
          </form>

          <details className="relative">
            <summary className={`${dangerButtonClass} cursor-pointer list-none`}>
              <AlertTriangle className="h-4 w-4" />
              Set All Active to Muskie
            </summary>
            <form action={setAllMuskieAction} className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-panel">
              <p className="text-sm font-bold text-red-800">Type the full phrase to update every active camper in the active session.</p>
              <input className={`${inputClass} mt-3 w-full`} name="confirmAllMuskie" placeholder="SET ALL TO MUSKIE" value={allMuskieConfirm} onChange={(event) => setAllMuskieConfirm(event.target.value)} />
              <button className={`${dangerButtonClass} mt-3 w-full`} disabled={!allMuskieUnlocked} type="submit">Confirm update</button>
            </form>
          </details>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
        <div className="hidden grid-cols-[44px_1.7fr_1fr_0.55fr_0.7fr_0.9fr_1.1fr_0.9fr_0.55fr] border-b border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 xl:grid">
          <span />
          <span>Camper</span>
          <span>Cabin</span>
          <span>Unit</span>
          <span>Gender</span>
          <span>Swim Level</span>
          <span>Medical</span>
          <span>Last Updated</span>
          <span>Actions</span>
        </div>

        {campers.map((camper) => {
          const selected = selectedSet.has(camper.id);
          const expanded = expandedId === camper.id;
          const initials = camper.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
          return (
            <article key={camper.id} className="border-b border-slate-200 last:border-b-0">
              <div className="grid gap-3 px-4 py-4 xl:grid-cols-[44px_1.7fr_1fr_0.55fr_0.7fr_0.9fr_1.1fr_0.9fr_0.55fr] xl:items-center">
                <label className="flex items-center">
                  <input checked={selected} onChange={(event) => toggleCamper(camper.id, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-forest-700" type="checkbox" />
                </label>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-lake-100 font-black text-lake-700">{initials}</div>
                  <div className="min-w-0">
                    <h3 className="truncate font-black text-lake-700">{camper.name}</h3>
                    <p className="mt-0.5 text-sm font-medium text-slate-500">
                      ID: {camper.id.slice(-6).toUpperCase()}
                      {camper.campGrade ? ` • ${camper.campGrade}` : ""}
                      {camper.age ? ` • Age ${camper.age}` : ""}
                    </p>
                  </div>
                </div>
                <GuardedCabinSelect camper={camper} cabins={cabins} updateCabinAction={updateCabinAction} />
                <p className="text-sm font-medium text-slate-700">{camper.unit.replace("Unit ", "")}</p>
                <p className="text-sm font-medium text-slate-700">{camper.genderIdentity || camper.gender}</p>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-lake-700 text-xs font-black text-white">{camper.swimCode}</span>
                  <span className="text-sm font-medium text-slate-700">{camper.swimLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">{camper.medicalFlags ? camper.medicalFlags.split(/[,;]/).slice(0, 2).map((flag) => <Badge key={flag} tone="amber">{flag.trim()}</Badge>) : <Badge tone="green">None</Badge>}</div>
                <p className="text-sm font-medium text-slate-600">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(camper.updatedAt))}</p>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50" type="button" aria-label="Camper actions"><MoreVertical className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 hover:bg-slate-100" type="button" onClick={() => setExpandedId(expanded ? "" : camper.id)} aria-label="Toggle schedule">
                    {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {expanded ? (
                <div className="px-4 pb-4 xl:pl-[88px]">
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    <GuardedMedicalEditor camper={camper} updateMedicalAction={updateMedicalAction} />
                  </div>
                  <div className="mb-3 rounded-xl border border-lake-100 bg-lake-50/60 p-3">
                    <p className="text-sm font-black text-forest-900">Camper weeks / bunks</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {camper.weeks.length ? camper.weeks.map((week) => (
                        <Badge key={`${camper.id}-${week.block}`} tone="blue">{week.block}: {week.cabin}</Badge>
                      )) : <Badge>No week blocks loaded</Badge>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white">
                    {historyWindows.map((window) => {
                      const registrations = camper.registrations.filter((registration) => registration.registrationWindow === window.value);
                      return (
                        <div key={window.value} className="grid gap-3 border-b border-slate-200 p-3 last:border-b-0 md:grid-cols-[64px_1fr]">
                          <div className="flex items-start">
                            <Badge tone={window.value === "Q1" ? "green" : window.value === "Q2" ? "blue" : "amber"}>{window.label}</Badge>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-slate-200">
                            <div className="grid grid-cols-[0.45fr_1.15fr_1fr_0.7fr] bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500">
                              <span>Period</span><span>Activity</span><span>Area</span><span>Status</span>
                            </div>
                            {registrations.length ? registrations.map((registration) => (
                              <div key={registration.id} className="grid grid-cols-[0.45fr_1.15fr_1fr_0.7fr] px-3 py-1.5 text-sm">
                                <span className="font-black">{registration.period}</span>
                                <span>{registration.activity}</span>
                                <span>{registration.area}</span>
                                <span><Badge tone={registration.status === "Active" || registration.status === "Overridden" ? "green" : "neutral"}>{registration.status}</Badge></span>
                              </div>
                            )) : (
                              <p className="px-3 py-3 text-sm font-medium text-slate-500">No registrations.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 text-sm font-medium text-slate-600">
          <span>Showing 1-{campers.length} of {campers.length} campers</span>
          <span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" />24 per page</span>
        </div>
      </section>
    </div>
  );
}

function GuardedMedicalEditor({ camper, updateMedicalAction }: { camper: CamperSummary; updateMedicalAction: ServerAction }) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === camper.name.toLowerCase();

  return (
    <details>
      <summary className="cursor-pointer list-none text-sm font-black text-amber-900">Medical / allergy notes</summary>
      <form action={updateMedicalAction} className="mt-3 grid gap-3 lg:grid-cols-[1fr_18rem_auto] lg:items-end">
        <input name="camperId" type="hidden" value={camper.id} />
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          Notes shown to registration/card users
          <input className={inputClass} name="medicalFlags" defaultValue={camper.medicalFlags ?? ""} placeholder="Example: Peanut allergy; EpiPen" />
        </label>
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          Type camper name to unlock
          <input className={inputClass} name="confirmCamperName" placeholder={camper.name} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
        </label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-black text-amber-900 disabled:opacity-50" disabled={!unlocked} type="submit">
          Save Medical Notes
        </button>
      </form>
    </details>
  );
}

function GuardedCabinSelect({ camper, cabins, updateCabinAction }: { camper: CamperSummary; cabins: Option[]; updateCabinAction: ServerAction }) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === camper.name.toLowerCase();

  return (
    <details className="relative">
      <summary className="list-none">
        <span className="inline-flex min-h-10 w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm">
          {camper.cabinName}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </span>
      </summary>
      <form action={updateCabinAction} className="absolute left-0 z-10 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
        <input name="camperId" type="hidden" value={camper.id} />
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          New cabin
          <select className={inputClass} defaultValue={camper.cabinId ?? ""} name="cabinId">
            <option value="">No cabin</option>
            {cabins.map((cabin) => <option key={cabin.value} value={cabin.value}>{cabin.label}</option>)}
          </select>
        </label>
        <label className="mt-3 grid gap-1.5 text-sm font-black text-slate-700">
          Type camper name to unlock
          <input className={inputClass} name="confirmCamperName" placeholder={camper.name} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
        </label>
        <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 disabled:opacity-50" disabled={!unlocked} type="submit">
          <ShieldCheck className="h-4 w-4" />
          Save cabin change
        </button>
      </form>
    </details>
  );
}
