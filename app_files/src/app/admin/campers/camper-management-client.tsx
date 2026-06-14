"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList, Fish, MoreVertical, ShieldCheck } from "lucide-react";
import { Badge, dangerButtonClass, inputClass } from "@/components/ui";

type ServerAction = (formData: FormData) => Promise<void> | void;

type Option = {
  value: string;
  label: string;
};

type AllergyOption = Option & {
  category: string;
};

type RegistrationSummary = {
  id: string;
  registrationWindow: string;
  period: string;
  activity: string;
  area: string;
  role: string;
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
  counselorAssistant: boolean;
  unit: string;
  swimLabel: string;
  swimCode: string;
  status: string;
  medicalFlags: string | null;
  allergies: { id: string; name: string; category: string | null; notes: string | null }[];
  weeks: { block: string; cabin: string }[];
  designations: string[];
  updatedAt: string;
  registrations: RegistrationSummary[];
};

export function CamperManagementClient({
  campers,
  cabins,
  allergyOptions,
  swimOptions,
  windows,
  visibleWindowValues,
  bulkUpdateAction,
  setAllMuskieAction,
  setAllPendingSwimTestAction,
  updateCabinAction,
  updateMedicalAction,
  updateCounselorAssistantAction,
  updateAllergiesAction
}: {
  campers: CamperSummary[];
  cabins: Option[];
  allergyOptions: AllergyOption[];
  swimOptions: Option[];
  windows: Option[];
  visibleWindowValues: string[];
  bulkUpdateAction: ServerAction;
  setAllMuskieAction: ServerAction;
  setAllPendingSwimTestAction: ServerAction;
  updateCabinAction: ServerAction;
  updateMedicalAction: ServerAction;
  updateCounselorAssistantAction: ServerAction;
  updateAllergiesAction: ServerAction;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState(campers[0]?.id ?? "");
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [allMuskieConfirm, setAllMuskieConfirm] = useState("");
  const [allPendingConfirm, setAllPendingConfirm] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = campers.length > 0 && campers.every((camper) => selectedSet.has(camper.id));
  const historyWindows = windows.filter((window) => visibleWindowValues.includes(window.value));
  const bulkUnlocked = selectedIds.length > 0 && bulkConfirm.trim().toUpperCase() === "SWIM";
  const allMuskieUnlocked = allMuskieConfirm.trim().toUpperCase() === "SET ALL TO MUSKIE";
  const allPendingUnlocked = allPendingConfirm.trim().toUpperCase() === "SET ALL TO PENDING SWIM TEST";

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

          <div className="flex flex-wrap gap-2">
            <details className="relative">
              <summary className={`${dangerButtonClass} cursor-pointer list-none`}>
                <AlertTriangle className="h-4 w-4" />
                Set All Active to Muskie
              </summary>
              <form action={setAllMuskieAction} className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-panel">
                <input name="swimLevel" type="hidden" value="MUSKIE" />
                <p className="text-sm font-bold text-red-800">Type the full phrase to continue.</p>
                <input className={`${inputClass} mt-3 w-full`} name="confirmAllSwim" placeholder="SET ALL TO MUSKIE" value={allMuskieConfirm} onChange={(event) => setAllMuskieConfirm(event.target.value)} />
                <button className={`${dangerButtonClass} mt-3 w-full`} disabled={!allMuskieUnlocked} type="submit">Confirm update</button>
              </form>
            </details>
            <details className="relative">
              <summary className={`${dangerButtonClass} cursor-pointer list-none`}>
                <AlertTriangle className="h-4 w-4" />
                Set All Active to Pending Swim Test
              </summary>
              <form action={setAllPendingSwimTestAction} className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-panel">
                <input name="swimLevel" type="hidden" value="PENDING_SWIM_TEST" />
                <p className="text-sm font-bold text-red-800">Type the full phrase to continue.</p>
                <input className={`${inputClass} mt-3 w-full`} name="confirmAllSwim" placeholder="SET ALL TO PENDING SWIM TEST" value={allPendingConfirm} onChange={(event) => setAllPendingConfirm(event.target.value)} />
                <button className={`${dangerButtonClass} mt-3 w-full`} disabled={!allPendingUnlocked} type="submit">Confirm update</button>
              </form>
            </details>
          </div>
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
                    {camper.counselorAssistant ? <Badge tone="blue">CA</Badge> : null}
                  </div>
                </div>
                <GuardedCabinSelect camper={camper} cabins={cabins} updateCabinAction={updateCabinAction} />
                <p className="text-sm font-medium text-slate-700">{camper.unit.replace("Unit ", "")}</p>
                <p className="text-sm font-medium text-slate-700">{camper.genderIdentity || camper.gender}</p>
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-lake-700 text-xs font-black text-white">{camper.swimCode}</span>
                  <span className="text-sm font-medium text-slate-700">{camper.swimLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {camper.allergies.slice(0, 2).map((allergy) => <Badge key={allergy.id} tone="amber">{allergy.name}</Badge>)}
                  {!camper.allergies.length && camper.medicalFlags ? camper.medicalFlags.split(/[,;]/).slice(0, 2).map((flag) => <Badge key={flag} tone="amber">{flag.trim()}</Badge>) : null}
                  {!camper.allergies.length && !camper.medicalFlags ? <Badge tone="green">None</Badge> : null}
                </div>
                <p className="text-sm font-medium text-slate-600">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(camper.updatedAt))}</p>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50" type="button" aria-label="Camper actions" onClick={() => setExpandedId(camper.id)}><MoreVertical className="h-4 w-4" /></button>
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
                  <div className="mb-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
                    <GuardedAllergyEditor camper={camper} allergyOptions={allergyOptions} updateAllergiesAction={updateAllergiesAction} />
                  </div>
                  <div className="mb-3 rounded-xl border border-lake-100 bg-white p-3">
                    <GuardedCounselorAssistantEditor camper={camper} updateCounselorAssistantAction={updateCounselorAssistantAction} />
                  </div>
                  <div className="mb-3 rounded-xl border border-lake-100 bg-lake-50/60 p-3">
                    <p className="text-sm font-black text-forest-900">Camper weeks / bunks</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {camper.weeks.length ? camper.weeks.map((week) => (
                        <Badge key={`${camper.id}-${week.block}`} tone="blue">{week.block}: {week.cabin}</Badge>
                      )) : <Badge>No week blocks loaded</Badge>}
                    </div>
                  </div>
                  <div className="mb-3 rounded-xl border border-forest-100 bg-forest-50/60 p-3">
                    <p className="text-sm font-black text-forest-900">Session designations</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {camper.designations.length ? camper.designations.map((designation) => (
                        <Badge key={`${camper.id}-${designation}`} tone="green">{designation}</Badge>
                      )) : <Badge>No imported designations yet</Badge>}
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
                            <div className="grid grid-cols-[0.45fr_1.05fr_0.9fr_0.65fr_0.7fr] bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500">
                              <span>Period</span><span>Activity</span><span>Area</span><span>Role</span><span>Status</span>
                            </div>
                            {registrations.length ? registrations.map((registration) => (
                              <div key={registration.id} className="grid grid-cols-[0.45fr_1.05fr_0.9fr_0.65fr_0.7fr] px-3 py-1.5 text-sm">
                                <span className="font-black">{registration.period}</span>
                                <span>{registration.activity}</span>
                                <span>{registration.area}</span>
                                <span><Badge tone={registration.role === "Teaching Assistant" ? "blue" : "neutral"}>{registration.role === "Teaching Assistant" ? "TA" : "Camper"}</Badge></span>
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

function GuardedCounselorAssistantEditor({ camper, updateCounselorAssistantAction }: { camper: CamperSummary; updateCounselorAssistantAction: ServerAction }) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === camper.name.toLowerCase();

  return (
    <details>
      <summary className="cursor-pointer list-none text-sm font-black text-lake-900">Counselor Assistant designation</summary>
      <form action={updateCounselorAssistantAction} className="mt-3 grid gap-3 lg:grid-cols-[1fr_18rem_auto] lg:items-end">
        <input name="camperId" type="hidden" value={camper.id} />
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
          <input name="counselorAssistant" type="checkbox" defaultChecked={camper.counselorAssistant} />
          This camper is a Counselor Assistant
        </label>
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          Type camper name to unlock
          <input className={inputClass} name="confirmCamperName" placeholder={camper.name} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
        </label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-lg border border-lake-200 bg-white px-4 text-sm font-black text-lake-900 disabled:opacity-50" disabled={!unlocked} type="submit">
          Save CA Status
        </button>
      </form>
    </details>
  );
}

function GuardedAllergyEditor({ camper, allergyOptions, updateAllergiesAction }: { camper: CamperSummary; allergyOptions: AllergyOption[]; updateAllergiesAction: ServerAction }) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === camper.name.toLowerCase();
  const selectedIds = new Set(camper.allergies.map((allergy) => allergy.id));
  const grouped = allergyOptions.reduce<Record<string, AllergyOption[]>>((groups, option) => {
    groups[option.category] = groups[option.category] ?? [];
    groups[option.category].push(option);
    return groups;
  }, {});

  return (
    <details>
      <summary className="cursor-pointer list-none text-sm font-black text-red-900">Allergy labels</summary>
      <form action={updateAllergiesAction} className="mt-3 grid gap-4">
        <input name="camperId" type="hidden" value={camper.id} />
        <div className="grid gap-3 lg:grid-cols-3">
          {Object.entries(grouped).map(([category, options]) => (
            <fieldset key={category} className="rounded-lg border border-white bg-white p-3">
              <legend className="px-1 text-xs font-black uppercase tracking-wide text-slate-500">{category}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input className="peer sr-only" defaultChecked={selectedIds.has(option.value)} name="allergyLabelId" type="checkbox" value={option.value} />
                    <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 peer-checked:border-red-300 peer-checked:bg-red-100 peer-checked:text-red-900">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_18rem_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm font-black text-slate-700">
            Add custom labels
            <input className={inputClass} name="customAllergies" placeholder="Example: Bees; Pollen; Latex" />
          </label>
          <label className="grid gap-1.5 text-sm font-black text-slate-700">
            Type camper name to unlock
            <input className={inputClass} name="confirmCamperName" placeholder={camper.name} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
          </label>
          <button className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-900 disabled:opacity-50" disabled={!unlocked} type="submit">
            Save Allergies
          </button>
        </div>
      </form>
    </details>
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
