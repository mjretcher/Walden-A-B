import { Unit } from "@prisma/client";
import { formatGenderTally, genderTallyTotal, UnitGenderTally } from "@/lib/camper-breakdown";
import { ALL_UNITS, UNIT_LABEL } from "@/lib/periods";

/**
 * One row per area (or whatever `label` the caller passes), one column per
 * unit that actually has anyone in it this period, each cell a compact
 * "8M 7F" gender split. When `awayUnits` is given (Trip Planner's "units
 * marked away" selection), those unit columns are flagged red and a
 * Remaining column shows the total with them subtracted out — Right Now
 * calls this with no awayUnits and just gets the plain breakdown.
 */
export function UnitGenderTable({
  rows,
  awayUnits = []
}: {
  rows: { label: string; tally: UnitGenderTally }[];
  awayUnits?: Unit[];
}) {
  const activeUnits = ALL_UNITS.filter((u) => rows.some((r) => genderTallyTotal(r.tally[u]) > 0));
  const units = activeUnits.length ? activeUnits : ALL_UNITS;
  const awaySet = new Set(awayUnits);
  const showRemaining = awaySet.size > 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">Area</th>
            {units.map((u) => (
              <th key={u} className={`px-3 py-1.5 text-right ${awaySet.has(u) ? "text-red-600" : ""}`}>
                {UNIT_LABEL[u]}
              </th>
            ))}
            <th className="py-1.5 pl-3 text-right">Total</th>
            {showRemaining ? <th className="py-1.5 pl-3 text-right">Remaining</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = units.reduce((sum, u) => sum + genderTallyTotal(row.tally[u]), 0);
            const away = units.filter((u) => awaySet.has(u)).reduce((sum, u) => sum + genderTallyTotal(row.tally[u]), 0);
            return (
              <tr key={row.label} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 font-bold text-forest-900">{row.label}</td>
                {units.map((u) => (
                  <td key={u} className={`px-3 py-1.5 text-right font-semibold ${awaySet.has(u) ? "text-red-500" : "text-slate-700"}`}>
                    {formatGenderTally(row.tally[u])}
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right font-black text-forest-900">{total}</td>
                {showRemaining ? <td className="py-1.5 pl-3 text-right font-black text-forest-700">{total - away}</td> : null}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={units.length + (showRemaining ? 3 : 2)} className="py-3 text-center text-sm font-bold text-slate-400">
                No offerings to break down.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
