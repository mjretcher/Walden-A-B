"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Gender, Unit } from "@prisma/client";
import { Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { createCabin, deleteCabin, updateCabin } from "@/app/admin/cabins/actions";

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
  MALE: "Boys",
  FEMALE: "Girls",
  NON_BINARY: "Non-binary",
  UNSPECIFIED: "Unspecified"
};

export function BunkCabinsClient({
  cabins,
  units,
  genders
}: {
  cabins: CabinRow[];
  units: Unit[];
  genders: Gender[];
}) {
  const [rows, setRows] = useState(cabins);
  const [addingToUnit, setAddingToUnit] = useState<Unit | null>(null);

  function patchRow(id: string, patch: Partial<CabinRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const grouped = useMemo(() => {
    return units.map((unit) => ({
      unit,
      cabins: rows.filter((c) => c.unit === unit).sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [units, rows]);

  return (
    <div className="space-y-6">
      {grouped.map(({ unit, cabins: unitCabins }) => (
        <Panel key={unit}>
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title={UNIT_LABEL[unit]} detail={`${unitCabins.length} cabin${unitCabins.length === 1 ? "" : "s"}`} />
            <button type="button" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs`} onClick={() => setAddingToUnit(unit)}>
              <Plus className="h-3 w-3" />Add cabin
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {unitCabins.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No cabins in this unit.</p>
            ) : null}
            {unitCabins.map((cabin) => (
              <CabinRowEditor key={cabin.id} cabin={cabin} units={units} onPatched={(patch) => patchRow(cabin.id, patch)} onDeleted={() => removeRow(cabin.id)} />
            ))}
          </div>

          {addingToUnit === unit ? (
            <AddCabinRow unit={unit} genders={genders} onClose={() => setAddingToUnit(null)} />
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function CabinRowEditor({
  cabin,
  units,
  onPatched,
  onDeleted
}: {
  cabin: CabinRow;
  units: Unit[];
  onPatched: (patch: Partial<CabinRow>) => void;
  onDeleted: () => void;
}) {
  const [beds, setBeds] = useState(String(cabin.beds));
  const [unit, setUnit] = useState<Unit>(cabin.unit);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, startTransition] = useTransition();

  const overCapacity = cabin.camperCount + cabin.staffCount > Number(beds || 0);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function saveField(nextBeds: string, nextUnit: Unit) {
    setError(null);
    const formData = new FormData();
    formData.set("cabinId", cabin.id);
    formData.set("name", cabin.name);
    formData.set("unit", nextUnit);
    formData.set("gender", cabin.gender);
    formData.set("beds", nextBeds.trim());
    startTransition(async () => {
      const result = await updateCabin(formData);
      if (result.ok) {
        onPatched({ beds: Number(nextBeds || 0), unit: nextUnit });
        flashSaved();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    setError(null);
    const formData = new FormData();
    formData.set("cabinId", cabin.id);
    startTransition(async () => {
      const result = await deleteCabin(formData);
      if (result.ok) {
        onDeleted();
      } else {
        setError(result.error);
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-[3.5rem] font-black text-forest-900">{cabin.name}</span>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Beds
          <input
            className={`${inputClass} h-9 w-20`}
            type="number"
            min={0}
            step={1}
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            onBlur={() => {
              if (beds !== String(cabin.beds)) saveField(beds, unit);
            }}
          />
        </label>

        {saved ? <Check className="h-4 w-4 text-green-600" /> : null}
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}

        <select
          className={`${inputClass} h-9 w-32`}
          value={unit}
          onChange={(e) => {
            const nextUnit = e.target.value as Unit;
            setUnit(nextUnit);
            saveField(beds, nextUnit);
          }}
        >
          {units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
        </select>

        <span className="text-xs font-semibold text-slate-500">{cabin.camperCount} campers &middot; {cabin.staffCount} staff assigned</span>

        {overCapacity ? (
          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-800">
            <AlertTriangle className="h-3 w-3" />OVER CAPACITY
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-xs font-bold text-red-700">Delete {cabin.name}?</span>
              <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
              <button type="button" className={`${dangerButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={remove} disabled={busy}>Confirm</button>
            </>
          ) : (
            <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setConfirmingDelete(true)} disabled={busy}>
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

function AddCabinRow({
  unit,
  genders,
  onClose
}: {
  unit: Unit;
  genders: Gender[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>(genders[0]);
  const [beds, setBeds] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function create() {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("unit", unit);
    formData.set("gender", gender);
    formData.set("beds", beds.trim());
    startTransition(async () => {
      const result = await createCabin(formData);
      if (result.ok) {
        window.location.reload();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-lake-200 bg-lake-50 p-3">
      <input className={`${inputClass} h-9 w-28`} placeholder="e.g. G37" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <select className={`${inputClass} h-9 w-28`} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
        {genders.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        Beds
        <input className={`${inputClass} h-9 w-20`} type="number" min={0} step={1} value={beds} onChange={(e) => setBeds(e.target.value)} />
      </label>
      <button type="button" className={`${buttonClass} min-h-8 px-3 py-1 text-xs`} onClick={create} disabled={busy || !name.trim()}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}Create
      </button>
      <button type="button" className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs`} onClick={onClose} disabled={busy}>Cancel</button>
      {error ? <p className="w-full text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
