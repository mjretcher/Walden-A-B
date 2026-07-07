"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Panel, SectionHeader, inputClass } from "@/components/ui";
import { setStaffHousing } from "./actions";

type StaffRow = { id: string; name: string; housingLabel: string | null };

export function StaffHousingClient({
  staff,
  housingOptions
}: {
  staff: StaffRow[];
  housingOptions: string[];
}) {
  const [rows, setRows] = useState(staff);

  const grouped = useMemo(() => {
    const labels = Array.from(new Set(rows.map((r) => r.housingLabel).filter((l): l is string => Boolean(l)))).sort();
    const groups = labels.map((label) => ({ label, staff: rows.filter((r) => r.housingLabel === label) }));
    groups.push({ label: "No custom housing", staff: rows.filter((r) => !r.housingLabel) });
    return groups;
  }, [rows]);

  function patch(id: string, housingLabel: string | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, housingLabel } : r)));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <datalist id="housing-options">
        {housingOptions.map((label) => <option key={label} value={label} />)}
      </datalist>
      {grouped.map((group) => (
        <Panel key={group.label}>
          <SectionHeader title={group.label} detail={`${group.staff.length} staff`} />
          <div className="mt-3 flex flex-col gap-2">
            {group.staff.map((row) => (
              <StaffHousingRow key={row.id} row={row} onSaved={(label) => patch(row.id, label)} />
            ))}
            {group.staff.length === 0 ? <p className="text-xs text-slate-400">Nobody here.</p> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function StaffHousingRow({ row, onSaved }: { row: StaffRow; onSaved: (label: string | null) => void }) {
  const [value, setValue] = useState(row.housingLabel ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function save() {
    if (value.trim() === (row.housingLabel ?? "")) return;
    setError(null);
    const formData = new FormData();
    formData.set("staffId", row.id);
    formData.set("housingLabel", value.trim());
    startTransition(async () => {
      const result = await setStaffHousing(formData);
      if (result.ok) {
        onSaved(value.trim() || null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="mb-1 text-sm font-bold text-slate-800">{row.name}</p>
      <div className="flex items-center gap-2">
        <input
          className={`${inputClass} h-9 flex-1 text-sm`}
          list="housing-options"
          placeholder="Custom housing (blank = none)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
        />
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" /> : null}
        {saved ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : null}
      </div>
      {error ? <p className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
