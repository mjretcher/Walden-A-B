"use client";

import { useMemo, useState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/ui";

export type BuddyCamper = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  buddyNumber: number | null;
  cabinName: string | null;
};

const VALID_COLUMN_COUNTS = [1, 2, 3] as const;
const MIN_ROWS_PER_COLUMN = 10;
const MAX_ROWS_PER_COLUMN = 70;
const NUM_WIDTH_BOUNDS = { default: 0.4, min: 0.25, max: 1 };
const CABIN_WIDTH_BOUNDS = { default: 0.65, min: 0.4, max: 1.2 };
const NAME_WIDTH_BOUNDS = { min: 0.8, max: 4.5 };
const DEFAULT_NAME_WIDTH_BY_COLUMNS: Record<number, number> = { 1: 3.6, 2: 2.2, 3: 1.35 };
const COLUMN_GAP_IN = 0.18;
const PAGE_USABLE_WIDTH_IN = 7.7; // letter portrait, 0.4in margins each side

const DEFAULT_COLUMNS = 3;
const TARGET_PAGES = 2;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Mike wants 3 columns / 2 pages as the starting point. Rather than
// hardcoding a rows-per-column number that only works for today's exact
// camper count (and quietly breaks the "2 pages" target the next time a
// buddy number gets added), compute it from however many campers are
// actually on the list right now: enough rows per column that 3 columns
// across 2 pages holds everyone.
function defaultRowsPerColumnForTwoPages(camperCount: number, columns: number) {
  const needed = Math.ceil(camperCount / (columns * TARGET_PAGES));
  return clamp(needed, MIN_ROWS_PER_COLUMN, MAX_ROWS_PER_COLUMN);
}

/**
 * All of the layout controls here (columns, rows per column, and the
 * three widths) only ever change CSS/chunking, never the underlying
 * data -- so this is entirely client-side React state. Every keystroke
 * or spinner click re-renders the preview instantly with no server
 * round trip, no page navigation, and no "Update" button to click.
 * That's the whole point versus the old GET-form version: this is a
 * live layout tool, not a filter you submit.
 */
export function BuddyNumbersClient({
  campers,
  sessionName,
  sessionYear
}: {
  campers: BuddyCamper[];
  sessionName: string;
  sessionYear: number;
}) {
  const [columns, setColumns] = useState<number>(DEFAULT_COLUMNS);
  const [rowsPerColumn, setRowsPerColumn] = useState(() => defaultRowsPerColumnForTwoPages(campers.length, DEFAULT_COLUMNS));
  const [numWidth, setNumWidth] = useState(NUM_WIDTH_BOUNDS.default);
  const [cabinWidth, setCabinWidth] = useState(CABIN_WIDTH_BOUNDS.default);
  // Name width auto-follows the columns-based default (3.6in/2.2in/1.35in
  // for 1/2/3 columns) right up until the person types their own value --
  // then it stops auto-following so it doesn't fight with them. "Reset"
  // puts it back on autopilot.
  const [nameWidth, setNameWidth] = useState<number>(DEFAULT_NAME_WIDTH_BY_COLUMNS[DEFAULT_COLUMNS]);
  const [nameWidthTouched, setNameWidthTouched] = useState(false);

  function handleColumnsChange(next: number) {
    setColumns(next);
    if (!nameWidthTouched) setNameWidth(DEFAULT_NAME_WIDTH_BY_COLUMNS[next]);
  }

  const columnTableWidth = numWidth + nameWidth + cabinWidth;
  const totalRowWidth = columns * columnTableWidth + (columns - 1) * COLUMN_GAP_IN;
  const overflowsPage = totalRowWidth > PAGE_USABLE_WIDTH_IN;

  const perPage = rowsPerColumn * columns;
  const pages = useMemo(() => {
    const result: BuddyCamper[][] = [];
    for (let i = 0; i < campers.length; i += perPage) {
      result.push(campers.slice(i, i + perPage));
    }
    return result;
  }, [campers, perPage]);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Columns per page
          <select
            value={columns}
            onChange={(e) => handleColumnsChange(Number(e.target.value))}
            className={`${inputClass} w-24`}
          >
            {VALID_COLUMN_COUNTS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Rows per column
          <input
            type="number"
            value={rowsPerColumn}
            min={MIN_ROWS_PER_COLUMN}
            max={MAX_ROWS_PER_COLUMN}
            onChange={(e) => setRowsPerColumn(clamp(e.target.valueAsNumber, MIN_ROWS_PER_COLUMN, MAX_ROWS_PER_COLUMN))}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          # width (in)
          <input
            type="number"
            step={0.05}
            value={numWidth}
            min={NUM_WIDTH_BOUNDS.min}
            max={NUM_WIDTH_BOUNDS.max}
            onChange={(e) => setNumWidth(clamp(e.target.valueAsNumber, NUM_WIDTH_BOUNDS.min, NUM_WIDTH_BOUNDS.max))}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Name width (in)
          <input
            type="number"
            step={0.1}
            value={nameWidth}
            min={NAME_WIDTH_BOUNDS.min}
            max={NAME_WIDTH_BOUNDS.max}
            onChange={(e) => {
              setNameWidthTouched(true);
              setNameWidth(clamp(e.target.valueAsNumber, NAME_WIDTH_BOUNDS.min, NAME_WIDTH_BOUNDS.max));
            }}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Cabin width (in)
          <input
            type="number"
            step={0.05}
            value={cabinWidth}
            min={CABIN_WIDTH_BOUNDS.min}
            max={CABIN_WIDTH_BOUNDS.max}
            onChange={(e) => setCabinWidth(clamp(e.target.valueAsNumber, CABIN_WIDTH_BOUNDS.min, CABIN_WIDTH_BOUNDS.max))}
            className={`${inputClass} w-24`}
          />
        </label>
        {nameWidthTouched ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setNameWidthTouched(false);
              setNameWidth(DEFAULT_NAME_WIDTH_BY_COLUMNS[columns]);
            }}
          >
            Reset name width
          </button>
        ) : null}
      </div>

      {overflowsPage ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {columns} columns at these widths add up to {totalRowWidth.toFixed(2)}in, wider than the {PAGE_USABLE_WIDTH_IN}in a portrait page has to work with — the extra will get cut off at the page edge when printed. Narrow a column or drop to fewer columns.
        </div>
      ) : null}

      <div className="buddy-list-print-stack">
        {pages.map((pageCampers, pageIndex) => {
          const columnChunks: BuddyCamper[][] = [];
          for (let i = 0; i < pageCampers.length; i += rowsPerColumn) {
            columnChunks.push(pageCampers.slice(i, i + rowsPerColumn));
          }
          return (
            <div key={pageIndex} className="buddy-list-page">
              <div className="buddy-list-page-header">
                <span className="buddy-list-title-main">Buddy Numbers</span>
                <span className="buddy-list-title-session">{sessionName} · {sessionYear}</span>
                <span className="buddy-list-title-page">Page {pageIndex + 1} of {pages.length}</span>
              </div>
              <div className="buddy-list-columns" style={{ gridTemplateColumns: `repeat(${columns}, ${columnTableWidth}in)` }}>
                {columnChunks.map((colCampers, colIndex) => (
                  <table key={colIndex} className="buddy-list-table" style={{ width: `${columnTableWidth}in` }}>
                    <colgroup>
                      <col style={{ width: `${numWidth}in` }} />
                      <col style={{ width: `${nameWidth}in` }} />
                      <col style={{ width: `${cabinWidth}in` }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="buddy-list-col-num">#</th>
                        <th>NAME</th>
                        <th className="buddy-list-col-cabin">CABIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colCampers.map((camper) => {
                        const displayFirst = camper.nickname?.trim() || camper.firstName;
                        return (
                          <tr key={camper.id}>
                            <td className="buddy-list-col-num">{camper.buddyNumber}</td>
                            <td className="buddy-list-col-name">{displayFirst} {camper.lastName}</td>
                            <td className="buddy-list-col-cabin">{camper.cabinName ?? ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
