"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOutOfCabinListing } from "./actions";

type Row = {
  staffId: string;
  name: string;
  position: string;
  housing: string;
  include: boolean;
  showOnStaffSheet: boolean;
  showOnCabinSheet: boolean;
  // MALE = boys pages, FEMALE = girls pages, null = both sides.
  side: "MALE" | "FEMALE" | null;
};

/**
 * Instant-save toggle table. Optimistic local state, one server action per
 * change; a failed save rolls the row back and surfaces the error. The
 * sheet checkboxes are disabled until the person is included at all, and
 * including someone defaults both sheets ON — matching "either or, or
 * both" without extra clicks for the common case.
 */
export function OutOfCabinClient({ rows: initialRows }: { rows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(next: Row, previous: Row) {
    setRows((current) => current.map((row) => (row.staffId === next.staffId ? next : row)));
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("staffId", next.staffId);
      formData.set("include", String(next.include));
      formData.set("showOnStaffSheet", String(next.showOnStaffSheet));
      formData.set("showOnCabinSheet", String(next.showOnCabinSheet));
      formData.set("side", next.side ?? "");
      const result = await setOutOfCabinListing(formData);
      if (!result.ok) {
        setRows((current) => current.map((row) => (row.staffId === previous.staffId ? previous : row)));
        setError(result.error ?? "Couldn't save — try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div> : null}
      <div className="max-h-[36rem] overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Print</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Housing</th>
              <th className="px-3 py-2 text-center">Staff sheet</th>
              <th className="px-3 py-2 text-center">Cabin sheets</th>
              <th className="px-3 py-2 text-center">Side</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.staffId} className={`border-t border-slate-100 ${row.include ? "bg-forest-50/50" : ""}`}>
                <td className="px-3 py-1.5">
                  <input
                    checked={row.include}
                    className="h-5 w-5 accent-forest-700"
                    onChange={(event) => save({ ...row, include: event.target.checked, showOnStaffSheet: event.target.checked ? row.showOnStaffSheet : true, showOnCabinSheet: event.target.checked ? row.showOnCabinSheet : true }, row)}
                    type="checkbox"
                  />
                </td>
                <td className={`px-3 py-1.5 ${row.include ? "font-black text-forest-900" : "font-medium text-slate-800"}`}>{row.name}</td>
                <td className="px-3 py-1.5 text-slate-600">{row.position}</td>
                <td className="px-3 py-1.5 text-slate-600">{row.housing}</td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    checked={row.include && row.showOnStaffSheet}
                    className="h-4 w-4 accent-forest-700 disabled:opacity-30"
                    disabled={!row.include}
                    onChange={(event) => save({ ...row, showOnStaffSheet: event.target.checked }, row)}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    checked={row.include && row.showOnCabinSheet}
                    className="h-4 w-4 accent-forest-700 disabled:opacity-30"
                    disabled={!row.include}
                    onChange={(event) => save({ ...row, showOnCabinSheet: event.target.checked }, row)}
                    type="checkbox"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <select
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold disabled:opacity-30"
                    disabled={!row.include}
                    onChange={(event) => save({ ...row, side: (event.target.value || null) as Row["side"] }, row)}
                    value={row.side ?? ""}
                  >
                    <option value="">Both</option>
                    <option value="MALE">Boys</option>
                    <option value="FEMALE">Girls</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
