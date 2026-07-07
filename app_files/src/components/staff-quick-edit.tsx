"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { inputClass, buttonClass, secondaryButtonClass } from "@/components/ui";
import { updateStaffCabin } from "@/app/admin/staff/actions";

/**
 * Free-text "where are they sleeping" housing note only -- NOT for real
 * cabin/bunk assignment. That moved entirely to CabinStaffAssignment
 * (/bunk-management/board), which is session-scoped and enforces one
 * cabin per staff member per session. This widget used to also offer a
 * "Cabin" mode that set Staff.cabinId directly from inside Scream
 * Session; per direct instruction, real cabin assignment is confirmed
 * to stay OUT of both Scream Session and Registration -- it now lives
 * only on the Staff Management profile page (with its own typed-name
 * confirmation) and the Bunk Management board.
 */
export function StaffQuickEdit({
  staffId,
  staffName,
  currentHousingLabel,
  canEdit
}: {
  staffId: string;
  staffName: string;
  currentHousingLabel: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [housingLabel, setHousingLabel] = useState(currentHousingLabel ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  const displayLabel = currentHousingLabel || "No housing note";

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
    formData.set("housingLabel", housingLabel.trim());
    formData.set("cabinId", "");
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
        title={`Quick-edit housing note for ${staffName}`}
      >
        {displayLabel}
        <Pencil className="h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div ref={popoverRef} className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Edit housing note</p>
            <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mb-2 truncate text-sm font-black text-forest-900">{staffName}</p>

          <input
            className={`${inputClass} text-sm`}
            value={housingLabel}
            onChange={(e) => setHousingLabel(e.target.value)}
            placeholder="e.g. Staff Lodge, Off-site"
            autoFocus
          />
          <p className="mt-1 text-[11px] text-slate-400">Real cabin/bunk assignment is on Staff Management or the Bunk Management board.</p>

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
