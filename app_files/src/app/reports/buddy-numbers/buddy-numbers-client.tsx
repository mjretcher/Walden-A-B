"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Must match globals.css: .buddy-list-col-name { font-size: 9pt; font-weight: 700 }
// and padding: 1pt 5pt on .buddy-list-table td. Used to measure whether a
// given name actually fits on one line at the current name column width --
// see nameFits below. Long names wrap to a real 2nd line instead of
// truncating with an ellipsis, so this measures actual wrap, not a guess.
const NAME_FONT_SIZE_PT = 9;
const NAME_FONT_WEIGHT = 700;
const NAME_FONT_FAMILY = "Arial, Helvetica, sans-serif";
const NAME_CELL_PADDING_PT = 5; // horizontal, each side
const PT_TO_PX = 96 / 72;

const PAGE_HEIGHT_IN = 11;
const PAGE_MARGIN_IN = 0.4;
// A little slack below the literal available height, since a table
// landing exactly at the limit is one rounding error from spilling over.
const HEIGHT_SAFETY_FACTOR = 0.96;

// This is deliberately a rough, conservative starting guess, not tuned
// math -- static row-height predictions have been wrong twice now (once
// missing 2-line name wraps entirely, then again just underestimating
// real rendered row height even with that accounted for). Rather than
// trying to out-guess Safari's print renderer a third time, this is only
// ever the INITIAL target; the effect below measures the real rendered
// height of the actual DOM after every render and corrects rowsPerColumn
// down if it doesn't fit, converging on whatever the true number is
// instead of assuming one.
const STATIC_FALLBACK_ROWS_PER_COLUMN = 35;

const DEFAULT_COLUMNS = 3;
const TARGET_PAGES = 2;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === "undefined") return null; // SSR pass -- no canvas available yet
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

function textWidthIn(text: string): number | null {
  const ctx = getMeasureCtx();
  if (!ctx) return null;
  ctx.font = `${NAME_FONT_WEIGHT} ${NAME_FONT_SIZE_PT * PT_TO_PX}px ${NAME_FONT_FAMILY}`;
  return ctx.measureText(text).width / 96;
}

type NameFit = { camper: BuddyCamper; label: string; units: 1 | 2 };

// Rather than assuming every row is the same height, actually measure
// each name against the current name column width and mark it as
// costing 1 unit (fits on one line) or 2 (needs to wrap) -- packIntoColumns
// below then fills each column by that budget, not a flat camper count.
function computeNameFits(campers: BuddyCamper[], nameWidthIn: number): NameFit[] {
  const availableWidthIn = nameWidthIn - (2 * NAME_CELL_PADDING_PT) / 72;
  return campers.map((camper) => {
    const displayFirst = camper.nickname?.trim() || camper.firstName;
    const label = `${displayFirst} ${camper.lastName}`;
    const width = textWidthIn(label);
    const units: 1 | 2 = width === null ? 1 : width > availableWidthIn ? 2 : 1;
    return { camper, label, units };
  });
}

// Greedily fills each column up to unitBudget units, moving to a new
// column once the next camper would push it over -- preserves
// buddy-number order (column 1 top-to-bottom, then column 2, etc.)
// while respecting real per-row height.
function packIntoColumns(items: NameFit[], unitBudget: number): NameFit[][] {
  const columns: NameFit[][] = [];
  let current: NameFit[] = [];
  let currentUnits = 0;
  for (const item of items) {
    if (current.length > 0 && currentUnits + item.units > unitBudget) {
      columns.push(current);
      current = [];
      currentUnits = 0;
    }
    current.push(item);
    currentUnits += item.units;
  }
  if (current.length > 0) columns.push(current);
  return columns;
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
  const [numWidth, setNumWidth] = useState(NUM_WIDTH_BOUNDS.default);
  const [cabinWidth, setCabinWidth] = useState(CABIN_WIDTH_BOUNDS.default);
  // Name width auto-follows the columns-based default (3.6in/2.2in/1.35in
  // for 1/2/3 columns) right up until the person types their own value --
  // then it stops auto-following so it doesn't fight with them. "Reset"
  // puts it back on autopilot.
  const [nameWidth, setNameWidth] = useState<number>(DEFAULT_NAME_WIDTH_BY_COLUMNS[DEFAULT_COLUMNS]);
  const [nameWidthTouched, setNameWidthTouched] = useState(false);

  // Canvas text measurement and DOM height measurement only exist in the
  // browser. Starting this false on both the server render and the
  // client's first (hydration) render keeps them identical -- everything
  // is provisionally treated as 1-line/fits until this flips true right
  // after mount, at which point real measurements kick in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Measured live against the current name width -- widen it and fewer
  // names wrap; narrow it and more do. This is what "rows per column"
  // is actually budgeting against now (1 unit = fits on one line, 2 =
  // wraps to two), not a flat camper count.
  const nameFits = useMemo(
    () => (mounted ? computeNameFits(campers, nameWidth) : campers.map((camper) => ({ camper, label: `${camper.nickname?.trim() || camper.firstName} ${camper.lastName}`, units: 1 as const }))),
    [campers, nameWidth, mounted]
  );
  const totalUnits = useMemo(() => nameFits.reduce((sum, f) => sum + f.units, 0), [nameFits]);

  // Initial guess (assumes every row is 1 line, same fallback used before
  // mount) so this matches on the server and the client's first render.
  // Once mounted flips true, this effect recomputes a rough target from
  // real wrap measurements -- unless the person has already typed their
  // own value. The DOM-measurement effect further down does the actual
  // fit correction against the real rendered height; this just picks
  // where to start.
  const [rowsPerColumn, setRowsPerColumn] = useState(() =>
    clamp(Math.ceil(campers.length / (DEFAULT_COLUMNS * TARGET_PAGES)), MIN_ROWS_PER_COLUMN, Math.min(MAX_ROWS_PER_COLUMN, STATIC_FALLBACK_ROWS_PER_COLUMN))
  );
  const [rowsPerColumnTouched, setRowsPerColumnTouched] = useState(false);

  useEffect(() => {
    if (!mounted || rowsPerColumnTouched) return;
    setRowsPerColumn(clamp(Math.ceil(totalUnits / (columns * TARGET_PAGES)), MIN_ROWS_PER_COLUMN, Math.min(MAX_ROWS_PER_COLUMN, STATIC_FALLBACK_ROWS_PER_COLUMN)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, totalUnits, columns, rowsPerColumnTouched]);

  function handleColumnsChange(next: number) {
    setColumns(next);
    if (!nameWidthTouched) setNameWidth(DEFAULT_NAME_WIDTH_BY_COLUMNS[next]);
  }

  const columnTableWidth = numWidth + nameWidth + cabinWidth;
  const totalRowWidth = columns * columnTableWidth + (columns - 1) * COLUMN_GAP_IN;
  const overflowsPage = totalRowWidth > PAGE_USABLE_WIDTH_IN;

  const allColumns = useMemo(() => packIntoColumns(nameFits, rowsPerColumn), [nameFits, rowsPerColumn]);
  const pages = useMemo(() => {
    const result: NameFit[][][] = [];
    for (let i = 0; i < allColumns.length; i += columns) {
      result.push(allColumns.slice(i, i + columns));
    }
    return result;
  }, [allColumns, columns]);

  const wrappedCount = useMemo(() => nameFits.filter((f) => f.units === 2).length, [nameFits]);

  // The actual fix for pages overflowing: measure the real rendered
  // height of every column table after each render and shrink
  // rowsPerColumn if any of them are taller than one physical page can
  // hold, then let it re-render and measure again. This replaces trying
  // to predict row height with CSS math (wrong twice now -- first for
  // not accounting for 2-line wraps at all, then for still
  // underestimating real rendered height even after accounting for
  // those) with checking the one thing that's actually authoritative:
  // what the browser rendered. Only auto-corrects when rowsPerColumn
  // hasn't been manually touched; otherwise it surfaces a warning
  // instead of overriding a deliberate choice.
  const printStackRef = useRef<HTMLDivElement>(null);
  const [manualHeightOverflow, setManualHeightOverflow] = useState(false);

  useLayoutEffect(() => {
    if (!mounted || !printStackRef.current) return;
    const tables = printStackRef.current.querySelectorAll<HTMLTableElement>(".buddy-list-table");
    const header = printStackRef.current.querySelector<HTMLDivElement>(".buddy-list-page-header");
    if (tables.length === 0 || !header) return;
    let maxHeightPx = 0;
    tables.forEach((t) => {
      if (t.offsetHeight > maxHeightPx) maxHeightPx = t.offsetHeight;
    });
    const maxHeightIn = maxHeightPx / 96;
    const headerHeightIn = header.offsetHeight / 96;
    const availableHeightIn = PAGE_HEIGHT_IN - 2 * PAGE_MARGIN_IN - headerHeightIn;
    const limitIn = availableHeightIn * HEIGHT_SAFETY_FACTOR;
    if (maxHeightIn <= limitIn) {
      setManualHeightOverflow(false);
      return;
    }
    if (rowsPerColumnTouched) {
      setManualHeightOverflow(true);
      return;
    }
    const scale = limitIn / maxHeightIn;
    const next = Math.max(MIN_ROWS_PER_COLUMN, Math.floor(rowsPerColumn * scale));
    if (next < rowsPerColumn) setRowsPerColumn(next);
  });

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
            onChange={(e) => {
              setRowsPerColumnTouched(true);
              setRowsPerColumn(clamp(e.target.valueAsNumber, MIN_ROWS_PER_COLUMN, MAX_ROWS_PER_COLUMN));
            }}
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
        {rowsPerColumnTouched ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setRowsPerColumnTouched(false)}
          >
            Reset rows per column
          </button>
        ) : null}
      </div>

      {overflowsPage ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {columns} columns at these widths add up to {totalRowWidth.toFixed(2)}in, wider than the {PAGE_USABLE_WIDTH_IN}in a portrait page has to work with — the extra will get cut off at the page edge when printed. Narrow a column or drop to fewer columns.
        </div>
      ) : null}

      {manualHeightOverflow ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {rowsPerColumn} rows per column is taller than one printed page holds at this font size — a column will spill onto an extra page. Lower it, or Reset rows per column to let it size itself automatically.
        </div>
      ) : null}

      {wrappedCount > 0 ? (
        <div className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {wrappedCount} name{wrappedCount === 1 ? "" : "s"} {wrappedCount === 1 ? "doesn't" : "don't"} fit on one line at this Name width and will wrap to a 2nd line instead of being cut off. Widen Name width to reduce how many wrap.
        </div>
      ) : null}

      <div className="buddy-list-print-stack" ref={printStackRef}>
        {pages.map((pageColumns, pageIndex) => (
          <div key={pageIndex} className="buddy-list-page">
            <div className="buddy-list-page-header">
              <span className="buddy-list-title-main">Buddy Numbers</span>
              <span className="buddy-list-title-session">{sessionName} · {sessionYear}</span>
              <span className="buddy-list-title-page">Page {pageIndex + 1} of {pages.length}</span>
            </div>
            <div className="buddy-list-columns" style={{ gridTemplateColumns: `repeat(${columns}, ${columnTableWidth}in)` }}>
              {pageColumns.map((colFits, colIndex) => (
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
                    {colFits.map(({ camper, label }) => (
                      <tr key={camper.id}>
                        <td className="buddy-list-col-num">{camper.buddyNumber}</td>
                        <td className="buddy-list-col-name">{label}</td>
                        <td className="buddy-list-col-cabin">{camper.cabinName ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
