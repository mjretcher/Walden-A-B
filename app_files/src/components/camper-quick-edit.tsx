"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { inputClass, buttonClass, secondaryButtonClass } from "@/components/ui";
import { quickUpdateCamperCabin } from "@/app/admin/campers/actions";

type CabinOption = { id: string; name: string; unit?: string | null };

export function CamperQuickEdit({
  camperId,
  camperName,
  currentCabinId,
  currentCabinName,
  cabins,
  canEdit
}: {
  camperId: string;
  camperName: string;
  currentCabinId: string | null;
  currentCabinName: string;
  cabins: CabinOption[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cabinId, setCabinId] = useState(currentCabinId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

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
    return <span className="text-sm font-bold text-slate-600">{currentCabinName}</span>;
  }

  function save() {
    setStatus("saving");
    const formData = new FormData();
    formData.set("camperId", camperId);
    formData.set("cabinId", cabinId);
    startTransition(async () => {
      try {
        await quickUpdateCamperCabin(formData);
        setStatus("saved");
        setTimeout(() => { setOpen(false); setStatus("idle"); }, 700);
      } catch {
        setStatus("error");
      }
    });
  }

  const dirty = cabinId !== (currentCabinId ?? "");

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-lake-700"
        onClick={() => setOpen((v) => !v)}
        title={`Quick-edit cabin for ${camperName}`}
      >
        {currentCabinName}
        <Pencil className="h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div ref={popoverRef} className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Edit cabin</p>
            <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mb-2 truncate text-sm font-black text-forest-900">{camperName}</p>
          <select
            className={`${inputClass} text-sm`}
            value={cabinId}
            onChange={(e) => setCabinId(e.target.value)}
            autoFocus
          >
            <option value="">No cabin</option>
            {cabins.map((cabin) => (
              <option key={cabin.id} value={cabin.id}>{cabin.name}{cabin.unit ? ` · ${cabin.unit}` : ""}</option>
            ))}
          </select>
          <div className="mt-3 flex items-center justify-between gap-2">
            {status === "saving" && <span className="text-xs font-bold text-slate-500">Saving…</span>}
            {status === "saved" && <span className="inline-flex items-center gap-1 text-xs font-black text-green-700"><Check className="h-3 w-3" />Saved</span>}
            {status === "error" && <span className="text-xs font-bold text-red-700">Error saving</span>}
            {status === "idle" && <span />}
            <div className="flex gap-2">
              <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={`${buttonClass} min-h-8 px-2 py-1 text-xs`} onClick={save} disabled={!dirty || status === "saving"}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}
