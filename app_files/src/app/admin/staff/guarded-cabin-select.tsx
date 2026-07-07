"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { inputClass } from "@/components/ui";
import { setStaffCabinAssignment } from "./actions";

type CabinOption = { id: string; name: string; unit?: string | null };

/**
 * Mirrors GuardedCabinSelect in app/admin/campers/camper-management-client.tsx
 * exactly -- typed-name confirmation required before the submit button
 * unlocks. Real cabin assignment for a staff member goes through this one
 * place on their profile page; it's deliberately split out of the main
 * "Save staff" form so it can never change as a side effect of an
 * unrelated edit.
 */
export function GuardedStaffCabinSelect({
  staffId,
  staffName,
  currentCabinId,
  currentCabinName,
  cabins
}: {
  staffId: string;
  staffName: string;
  currentCabinId: string | null;
  currentCabinName: string;
  cabins: CabinOption[];
}) {
  const [typedName, setTypedName] = useState("");
  const unlocked = typedName.trim().toLowerCase() === staffName.toLowerCase();

  return (
    <details className="relative">
      <summary className="list-none">
        <span className="inline-flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm">
          {currentCabinName}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </span>
      </summary>
      <form action={setStaffCabinAssignment} className="absolute left-0 z-10 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
        <input name="staffId" type="hidden" value={staffId} />
        <label className="grid gap-1.5 text-sm font-black text-slate-700">
          New cabin
          <select className={inputClass} defaultValue={currentCabinId ?? ""} name="cabinId">
            <option value="">No cabin</option>
            {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}{cabin.unit ? ` · ${cabin.unit}` : ""}</option>)}
          </select>
        </label>
        <label className="mt-3 grid gap-1.5 text-sm font-black text-slate-700">
          Type staff name to unlock
          <input className={inputClass} name="confirmStaffName" placeholder={staffName} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
        </label>
        <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 disabled:opacity-50" disabled={!unlocked} type="submit">
          <ShieldCheck className="h-4 w-4" />
          Save cabin change
        </button>
      </form>
    </details>
  );
}
