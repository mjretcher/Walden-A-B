"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Gender, Unit } from "@prisma/client";
import { Badge, Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { applyDashStrip, createCabin, deleteCabin, previewDashStrip, updateCabin } from "./actions";

type CabinRow = {
  id: string;
  name: string;
  unit: Unit;
  gender: Gender;
  beds: number;
  camperCount: number;
  staffCount: number;
};

const UNIT_LABEL: Record<Unit, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

const GENDER_LABEL: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  NON_BINARY: "Non-binary",
  UNSPECIFIED: "Unspecified"
};

export function CabinsAdminClient({
  cabins,
  units,
  genders
}: {
  cabins: CabinRow[];
  units: Unit[];
  genders: Gender[];
}) {
  const [editing, setEditing] = useState<CabinRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [stripPreview, setStripPreview] = useState<null | {
    renames: { id: string; oldName: string; newName: string }[];
    collisions: { oldName: string; newName: string }[];
  }>(null);
  const [stripResult, setStripResult] = useState<null | { applied?: number; error?: string }>(null);
  const [, startTransition] = useTransition();
  const [stripBusy, setStripBusy] = useState(false);

  const dashedCabins = cabins.filter((c) => c.name.includes("-"));

  function previewStrip() {
    setStripResult(null);
    setStripBusy(true);
    startTransition(async () => {
      try {
        const result = await previewDashStrip();
        setStripPreview(result);
      } finally {
        setStripBusy(false);
      }
    });
  }

  function applyStrip() {
    setStripBusy(true);
    setStripResult(null);
    startTransition(async () => {
      try {
        const result = await applyDashStrip();
        if (result.ok) {
          setStripResult({ applied: result.applied });
          setStripPreview(null);
          // Page is revalidated server-side; show success briefly then reload
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setStripResult({ error: result.error });
        }
      } finally {
        setStripBusy(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Dash-strip banner */}
      {dashedCabins.length > 0 ? (
        <Panel>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-900">
                  <AlertTriangle className="h-4 w-4" />Cabins with dashes in their names
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  {dashedCabins.length} cabin{dashedCabins.length === 1 ? " has" : "s have"} a dash that should probably be removed:
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-amber-900">{dashedCabins.map((c) => c.name).join(", ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {stripPreview ? null : (
                  <button type="button" className={secondaryButtonClass} onClick={previewStrip} disabled={stripBusy}>
                    {stripBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Preview dash-strip
                  </button>
                )}
              </div>
            </div>

            {stripPreview ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-white p-3 text-sm">
                {stripPreview.collisions.length > 0 ? (
                  <>
                    <p className="font-black text-red-700">Cannot strip — these would collide with existing cabin names:</p>
                    <ul className="mt-1 list-disc pl-5 text-red-900">
                      {stripPreview.collisions.map((c) => (
                        <li key={c.oldName}><span className="font-mono">{c.oldName} → {c.newName}</span> (target already exists)</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-slate-700">Rename one of the conflicting cabins manually first.</p>
                  </>
                ) : (
                  <>
                    <p className="font-black text-forest-900">{stripPreview.renames.length} rename{stripPreview.renames.length === 1 ? "" : "s"} ready:</p>
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                      {stripPreview.renames.map((r) => (
                        <li key={r.id} className="font-mono"><span className="text-slate-500">{r.oldName}</span> → <span className="font-bold text-forest-900">{r.newName}</span></li>
                      ))}
                    </ul>
                    <p className="mt-2 text-slate-600">Also updates CamperWeekEnrollment.cabinName snapshots that reference these cabins.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setStripPreview(null)}>Cancel</button>
                      <button type="button" className={buttonClass} onClick={applyStrip} disabled={stripBusy}>
                        {stripBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Apply {stripPreview.renames.length} rename{stripPreview.renames.length === 1 ? "" : "s"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {stripResult?.applied !== undefined ? (
              <p className="mt-2 text-sm font-black text-green-700">✓ Stripped dashes from {stripResult.applied} cabin{stripResult.applied === 1 ? "" : "s"}. Reloading…</p>
            ) : null}
            {stripResult?.error ? (
              <p className="mt-2 text-sm font-bold text-red-700">{stripResult.error}</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {/* Top bar */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title={`${cabins.length} cabins`} detail="Click any row to edit name, unit, or gender." />
          <button type="button" className={buttonClass} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />New cabin
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-forest-900 text-white">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">Gender</th>
                <th className="p-2 text-right">Beds</th>
                <th className="p-2 text-right">Campers</th>
                <th className="p-2 text-right">Staff</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {cabins.map((cabin) => (
                <tr key={cabin.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-bold text-forest-900">
                    {cabin.name}
                    {cabin.name.includes("-") ? <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />has dash</span> : null}
                  </td>
                  <td className="p-2"><Badge tone="blue">{UNIT_LABEL[cabin.unit]}</Badge></td>
                  <td className="p-2"><Badge tone={cabin.gender === Gender.MALE ? "blue" : "amber"}>{GENDER_LABEL[cabin.gender]}</Badge></td>
                  <td className="p-2 text-right font-mono">
                    {cabin.beds}
                    {cabin.beds > 0 && cabin.camperCount + cabin.staffCount > cabin.beds ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-800">
                        <AlertTriangle className="h-3 w-3" />OVER CAPACITY
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-right font-mono">{cabin.camperCount}</td>
                  <td className="p-2 text-right font-mono">{cabin.staffCount}</td>
                  <td className="p-2 text-right">
                    <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setEditing(cabin)}>
                      <Pencil className="h-3 w-3" />Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Edit modal */}
      {editing ? (
        <CabinEditModal
          cabin={editing}
          units={units}
          genders={genders}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); window.location.reload(); }}
        />
      ) : null}

      {/* Create modal */}
      {creating ? (
        <CabinCreateModal
          units={units}
          genders={genders}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); window.location.reload(); }}
        />
      ) : null}
    </div>
  );
}

function CabinEditModal({
  cabin,
  units,
  genders,
  onClose,
  onSaved
}: {
  cabin: CabinRow;
  units: Unit[];
  genders: Gender[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cabin.name);
  const [unit, setUnit] = useState<Unit>(cabin.unit);
  const [gender, setGender] = useState<Gender>(cabin.gender);
  const [beds, setBeds] = useState(String(cabin.beds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [, startTransition] = useTransition();

  const unitChanged = unit !== cabin.unit;
  const nameChanged = name.trim() !== cabin.name;
  const bedsChanged = beds !== String(cabin.beds);
  const dirty = nameChanged || unitChanged || gender !== cabin.gender || bedsChanged;

  function save() {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("cabinId", cabin.id);
    formData.set("name", name.trim());
    formData.set("unit", unit);
    formData.set("gender", gender);
    formData.set("beds", beds.trim());
    startTransition(async () => {
      try {
        const result = await updateCabin(formData);
        if (result.ok) {
          onSaved();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    });
  }

  function remove() {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("cabinId", cabin.id);
    startTransition(async () => {
      try {
        const result = await deleteCabin(formData);
        if (result.ok) {
          onSaved();
        } else {
          setError(result.error);
          setConfirmingDelete(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setConfirmingDelete(false);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Edit cabin</p>
            <h2 className="text-2xl font-black text-forest-900">{cabin.name}</h2>
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-black text-slate-700">Name</label>
            <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. B1" />
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Unit</label>
            <select className={`${inputClass} mt-1`} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
            {unitChanged && cabin.camperCount > 0 ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-black">⚠️ Cascade warning</p>
                <p className="mt-0.5">{cabin.camperCount} camper{cabin.camperCount === 1 ? "" : "s"} currently in this cabin will be moved to {UNIT_LABEL[unit]}.</p>
                <p className="mt-0.5">Their existing class registrations are NOT removed but may no longer match unit eligibility — review on Camper Mgmt after.</p>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Gender (this session)</label>
            <select className={`${inputClass} mt-1`} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              {genders.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">Camper and staff gender fields are never auto-changed by editing a cabin&apos;s gender.</p>
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Beds</label>
            <input
              className={`${inputClass} mt-1`}
              type="number"
              min={0}
              step={1}
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
            />
            {cabin.camperCount + cabin.staffCount > Number(beds || 0) ? (
              <p className="mt-1 flex items-center gap-1 text-xs font-black text-red-700">
                <AlertTriangle className="h-3 w-3" />OVER CAPACITY — {cabin.camperCount + cabin.staffCount} assigned vs. {beds || 0} beds. This will still save; it&apos;s a warning, not a block.
              </p>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-700">Delete {cabin.name}?</span>
              <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
              <button type="button" className={`${dangerButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={remove} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Confirm delete
              </button>
            </div>
          ) : (
            <button type="button" className={`${dangerButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setConfirmingDelete(true)} disabled={busy}>
              <Trash2 className="h-3 w-3" />Delete cabin
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
            <button type="button" className={buttonClass} onClick={save} disabled={!dirty || busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CabinCreateModal({
  units,
  genders,
  onClose,
  onSaved
}: {
  units: Unit[];
  genders: Gender[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>(units[0]);
  const [gender, setGender] = useState<Gender>(genders[0]);
  const [beds, setBeds] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save() {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("unit", unit);
    formData.set("gender", gender);
    formData.set("beds", beds.trim());
    startTransition(async () => {
      try {
        const result = await createCabin(formData);
        if (result.ok) {
          onSaved();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Create cabin</p>
            <h2 className="text-2xl font-black text-forest-900">New cabin</h2>
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-black text-slate-700">Name</label>
            <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. G37" autoFocus />
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Unit</label>
            <select className={`${inputClass} mt-1`} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Gender (this session)</label>
            <select className={`${inputClass} mt-1`} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              {genders.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">Beds</label>
            <input className={`${inputClass} mt-1`} type="number" min={0} step={1} value={beds} onChange={(e) => setBeds(e.target.value)} />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancel</button>
          <button type="button" className={buttonClass} onClick={save} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
