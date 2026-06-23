"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { inputClass, buttonClass, secondaryButtonClass } from "@/components/ui";
import { updateStaffCabin } from "@/app/admin/staff/actions";

type CabinOption = { id: string; name: string; unit?: string | null };

export function StaffQuickEdit({
  staffId,
  staffName,
  currentCabinId,
  currentHousingLabel,
  cabins,
  canEdit
}: {
  staffId: string;
  staffName: string;
  currentCabinId: string | null;
  currentHousingLabel: string | null;
  cabins: CabinOption[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cabin" | "label">(currentHousingLabel ? "label" : "cabin");
  const [cabinId, setCabinId] = useState(currentCabinId ?? "");
  const [housingLabel, setHousingLabel] = useState(currentHousingLabel ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  const displayLabel = currentHousingLabel || (cabins.find((c) => c.id === currentCabinId)?.name ?? "No housing");

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!canEdit) {
    return <span className="text-sm font-bold text-slate-600">{displayLabel}</span>;
  }

  function save() {
    setStatus("saving");
    const formData = new FormData();
    formData.set("staffId", staffId);
    if (mode === "label") {
      formData.set("housingLabel", housingLabel.trim());
      formData.set("cabinId", "");
    } else {
      formData.set("cabinId", cabinId);
      formData.set("housingLabel", "");
    }
    startTransition(async () => {
      try {
        await updateStaffCabin(formData);
        setStatus("saved");
        setTimeout(() => { setOpen(false); setStatus("idle"); }, 700);
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-lake-700"
        onClick={() => setOpen((v) => !v)}
        title={`Quick-edit housing for ${staffName}`}
      >
        {displayLabel}
        <Pencil className="h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div ref={popoverRef} className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Edit housing</p>
            <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mb-2 truncate text-sm font-black text-forest-900">{staffName}</p>

          <div className="mb-2 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-black">
            <button type="button" className={`flex-1 rounded px-2 py-1 ${mode === "cabin" ? "bg-white text-forest-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("cabin")}>Cabin</button>
            <button type="button" className={`flex-1 rounded px-2 py-1 ${mode === "label" ? "bg-white text-forest-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("label")}>Other (free text)</button>
          </div>

          {mode === "cabin" ? (
            <select className={`${inputClass} text-sm`} value={cabinId} onChange={(e) => setCabinId(e.target.value)} autoFocus>
              <option value="">No cabin</option>
              {cabins.map((cabin) => (
                <option key={cabin.id} value={cabin.id}>{cabin.name}{cabin.unit ? ` · ${cabin.unit}` : ""}</option>
              ))}
            </select>
          ) : (
            <input
              className={`${inputClass} text-sm`}
              value={housingLabel}
              onChange={(e) => setHousingLabel(e.target.value)}
              placeholder="e.g. Staff Lodge, Off-site"
              autoFocus
            />
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            {status === "saving" && <span className="text-xs font-bold text-slate-500">Saving…</span>}
            {status === "saved" && <span className="inline-flex items-center gap-1 text-xs font-black text-green-700"><Check className="h-3 w-3" />Saved</span>}
            {status === "error" && <span className="text-xs font-bold text-red-700">Error saving</span>}
            {status === "idle" && <span />}
            <div className="flex gap-2">
              <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={`${buttonClass} min-h-8 px-2 py-1 text-xs`} onClick={save} disabled={status === "saving"}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}
