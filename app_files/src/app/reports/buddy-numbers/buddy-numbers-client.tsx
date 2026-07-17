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

const PAGE_HEIGHT_IN = 11;
const PAGE_MARGIN_IN = 0.4;
// Safari (and other browsers) can optionally print their own header/
// footer -- page title and date up top, page number at the bottom --
// via a "Print headers and footers" checkbox in the print dialog. This
// component has no way to see or control that checkbox, so a fixed
// allowance is reserved up front regardless of whether it's on.
const BROWSER_PRINT_CHROME_ALLOWANCE_IN = 0.5;
// Real print rendering measurably runs taller than what's measured
// on-screen -- confirmed directly: a column computed (from real,
// accurately-measured on-screen row heights) to hold 37 rows still
// spilled 1-2 rows onto a continuation page when actually printed.
// BUT that measurement was taken under the old multi-table-per-page
// grid structure (see the restructuring below this component), which
// had its own print-fragmentation bug layered on top -- so "37 rows
// overflowed" conflates two separate problems and can't be trusted to
// calibrate this factor on its own. The clean data point, taken after
// that structural fix, is: 0.80 -> 31 rows/column, printing correctly
// with real headroom to spare (visibly too much -- most of a page left
// blank). 0.92 is a proportional walk-back from that clean point
// (31 * 0.92/0.80 =~ 35-36 rows), landing right around what a ~210-
// camper roster at 3 columns needs for exactly 2 pages, while staying
// a few rows under the 37 that overflowed before -- keeping a margin
// against whatever smaller residual screen-vs-print gap remains now
// that the structural bug is gone, without giving back all the room
// 0.80 wasted.
const HEIGHT_SAFETY_FACTOR = 0.92;

// Matches `.buddy-list-table tbody td { height: 0.175in }` in globals.css --
// used only as a provisional guess before the real probe measurement below
// has run (SSR / first client paint), and to detect "did this name wrap"
// for the informational banner (a row taller than this really did wrap).
const SINGLE_LINE_HEIGHT_IN = 0.175;

const DEFAULT_COLUMNS = 3;
const TARGET_PAGES = 2;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function camperLabel(camper: BuddyCamper): string {
  const displayFirst = camper.nickname?.trim() || camper.firstName;
  return `${displayFirst} ${camper.lastName}`;
}

/**
 * All of the layout controls here (columns, rows per column, and the
 * three widths) only ever change CSS/chunking, never the underlying
 * data -- so this is entirely client-side React state. Every keystroke
 * or spinner click re-renders the preview instantly with no server
 * round trip, no page navigation, and no "Update" button to click.
 *
 * Page-fitting works by MEASURING, not predicting: a hidden probe table
 * (below, in .buddy-list-probe) renders every camper once, off-screen,
 * using the exact same markup and CSS classes as the real columns. Its
 * real rendered row heights -- which correctly capture a name wrapping
 * to 2, 3, or more lines, exactly as the browser will actually print it
 * -- drive the column-packing math directly. Earlier versions estimated
 * each row's cost via canvas text measurement (1 line vs "must wrap",
 * flatly counted as 2 units) and then corrected after the fact by
 * shrinking rows-per-column when a render measured too tall. That
 * correction was the bug: shrinking rows-per-column always increases
 * the number of columns needed, which can push the total page count up
 * instead of down -- exactly backwards from the goal. Measuring real
 * heights up front and packing directly against them removes the
 * guess-then-correct cycle entirely.
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

  // Canvas/DOM measurement only exists in the browser. Starting this
  // false on both the server render and the client's first (hydration)
  // render keeps them identical -- every row is provisionally treated
  // as one baseline-height line until this flips true right after
  // mount, at which point the real probe measurement below kicks in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // "Rows per column" is a literal camper count, not an abstract unit
  // budget. In manual (touched) mode it's used exactly as typed -- the
  // person's explicit choice, which may deliberately overflow (see the
  // warning banner below). In auto mode it's not used to drive packing
  // at all; it's kept in sync purely for display, reflecting how many
  // campers the first auto-packed column actually holds.
  const [rowsPerColumn, setRowsPerColumn] = useState(() =>
    clamp(Math.ceil(campers.length / (DEFAULT_COLUMNS * TARGET_PAGES)), MIN_ROWS_PER_COLUMN, MAX_ROWS_PER_COLUMN)
  );
  const [rowsPerColumnTouched, setRowsPerColumnTouched] = useState(false);

  function handleColumnsChange(next: number) {
    setColumns(next);
    if (!nameWidthTouched) setNameWidth(DEFAULT_NAME_WIDTH_BY_COLUMNS[next]);
  }

  const columnTableWidth = numWidth + nameWidth + cabinWidth;
  const totalRowWidth = columns * columnTableWidth + (columns - 1) * COLUMN_GAP_IN;
  const overflowsPage = totalRowWidth > PAGE_USABLE_WIDTH_IN;

  // ------------------------------------------------------------------
  // Real height measurement: a hidden probe table (rendered below, off-
  // screen) holds one row per camper using the live numWidth/nameWidth/
  // cabinWidth. Whenever those widths (or the roster) change, re-measure
  // every row's real rendered height plus the header row's height.
  // ------------------------------------------------------------------
  const probeRef = useRef<HTMLDivElement>(null);
  const [rowHeightsIn, setRowHeightsIn] = useState<number[] | null>(null);
  const [theadHeightIn, setTheadHeightIn] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!mounted || !probeRef.current) return;
    const theadRow = probeRef.current.querySelector<HTMLTableRowElement>("thead tr");
    const bodyRows = probeRef.current.querySelectorAll<HTMLTableRowElement>("tbody tr");
    if (!theadRow || bodyRows.length !== campers.length) return; // probe hasn't (re)rendered yet
    const heights: number[] = [];
    bodyRows.forEach((tr) => heights.push(tr.getBoundingClientRect().height / 96));
    setRowHeightsIn(heights);
    setTheadHeightIn(theadRow.getBoundingClientRect().height / 96);
  }, [mounted, numWidth, nameWidth, cabinWidth, campers]);

  // Outer print title bar height (session name, "Page X of Y") -- static
  // markup, so its height is stable regardless of which page renders it.
  // Measured from whatever page is currently rendered; a reasonable
  // initial guess is used until the first real measurement lands.
  const printStackRef = useRef<HTMLDivElement>(null);
  const [pageHeaderHeightIn, setPageHeaderHeightIn] = useState(0.4);

  useLayoutEffect(() => {
    if (!mounted || !printStackRef.current) return;
    const header = printStackRef.current.querySelector<HTMLDivElement>(".buddy-list-page-header");
    if (!header) return;
    const h = header.getBoundingClientRect().height / 96;
    if (h > 0 && Math.abs(h - pageHeaderHeightIn) > 0.005) setPageHeaderHeightIn(h);
  });

  const availableHeightIn = PAGE_HEIGHT_IN - 2 * PAGE_MARGIN_IN - pageHeaderHeightIn - BROWSER_PRINT_CHROME_ALLOWANCE_IN;
  const limitIn = availableHeightIn * HEIGHT_SAFETY_FACTOR;

  const allColumns = useMemo(() => {
    if (rowsPerColumnTouched) {
      // Manual mode: exactly `rowsPerColumn` campers per column, no
      // height check -- the person's explicit override.
      const cols: BuddyCamper[][] = [];
      for (let i = 0; i < campers.length; i += rowsPerColumn) {
        cols.push(campers.slice(i, i + rowsPerColumn));
      }
      return cols;
    }

    // Auto mode: greedily fill each column up to the real measured page
    // capacity. Each column repeats its own header, so thead height is
    // charged once per column, then real per-row heights accumulate
    // until the next row would push past what a physical page can hold.
    const thead = theadHeightIn ?? SINGLE_LINE_HEIGHT_IN;
    const cols: BuddyCamper[][] = [];
    let current: BuddyCamper[] = [];
    let currentHeight = thead;
    campers.forEach((camper, i) => {
      const rowH = rowHeightsIn?.[i] ?? SINGLE_LINE_HEIGHT_IN;
      if (current.length > 0 && currentHeight + rowH > limitIn) {
        cols.push(current);
        current = [];
        currentHeight = thead;
      }
      current.push(camper);
      currentHeight += rowH;
    });
    if (current.length > 0) cols.push(current);
    return cols;
  }, [campers, rowHeightsIn, theadHeightIn, rowsPerColumnTouched, rowsPerColumn, limitIn]);

  const pages = useMemo(() => {
    const result: BuddyCamper[][][] = [];
    for (let i = 0; i < allColumns.length; i += columns) {
      result.push(allColumns.slice(i, i + columns));
    }
    return result;
  }, [allColumns, columns]);

  // Keep the displayed "rows per column" number honest in auto mode --
  // it reflects what the first auto-packed column actually holds, not a
  // target being driven toward. It never feeds back into allColumns
  // above (untouched mode ignores rowsPerColumn entirely), so this is a
  // one-way display sync, not a loop.
  const autoRepresentativeRows = allColumns[0]?.length;
  useEffect(() => {
    if (rowsPerColumnTouched || !autoRepresentativeRows) return;
    if (autoRepresentativeRows !== rowsPerColumn) setRowsPerColumn(autoRepresentativeRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPerColumnTouched, autoRepresentativeRows]);

  // Manual mode only: warn if the person's explicit rows-per-column
  // choice renders taller than one physical page. Auto mode can't
  // overflow by construction (it packs directly against limitIn), so
  // this only ever applies when touched.
  const [manualHeightOverflow, setManualHeightOverflow] = useState(false);
  useLayoutEffect(() => {
    if (!mounted || !printStackRef.current || !rowsPerColumnTouched) {
      setManualHeightOverflow(false);
      return;
    }
    const tables = printStackRef.current.querySelectorAll<HTMLTableElement>(".buddy-list-table");
    if (tables.length === 0) return;
    let maxHeightPx = 0;
    tables.forEach((t) => {
      if (t.offsetHeight > maxHeightPx) maxHeightPx = t.offsetHeight;
    });
    setManualHeightOverflow(maxHeightPx / 96 > limitIn);
  });

  const wrappedCount = useMemo(
    () => (rowHeightsIn ? rowHeightsIn.filter((h) => h > SINGLE_LINE_HEIGHT_IN * 1.3).length : 0),
    [rowHeightsIn]
  );

  const autoModeTooManyPages = !rowsPerColumnTouched && mounted && rowHeightsIn !== null && pages.length > TARGET_PAGES;

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

      {autoModeTooManyPages ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          This roster needs {pages.length} pages at the current column widths, even packed as tightly as a real page allows — narrowing Name width, adding a column, or accepting {pages.length} pages are the real options.
        </div>
      ) : null}

      {wrappedCount > 0 ? (
        <div className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {wrappedCount} name{wrappedCount === 1 ? "" : "s"} {wrappedCount === 1 ? "doesn't" : "don't"} fit on one line at this Name width and will wrap to a 2nd line instead of being cut off. Widen Name width to reduce how many wrap.
        </div>
      ) : null}

      {/* Hidden probe: every camper rendered once, off-screen, with the
          exact same markup/CSS as the real columns, purely so its real
          rendered row heights can be measured above. Never visible on
          screen (positioned off-screen) or in print (.no-print). */}
      <div className="buddy-list-probe no-print" ref={probeRef} aria-hidden="true">
        <table className="buddy-list-table" style={{ width: `${columnTableWidth}in` }}>
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
            {campers.map((camper) => (
              <tr key={camper.id}>
                <td className="buddy-list-col-num">{camper.buddyNumber}</td>
                <td className="buddy-list-col-name">{camperLabel(camper)}</td>
                <td className="buddy-list-col-cabin">{camper.cabinName ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="buddy-list-print-stack" ref={printStackRef}>
        {pages.map((pageColumns, pageIndex) => {
          const totalTableColumns = pageColumns.length * 3 + Math.max(0, pageColumns.length - 1);
          const maxRowsOnPage = pageColumns.reduce((max, col) => Math.max(max, col.length), 0);
          return (
            <div key={pageIndex} className="buddy-list-page">
              {/* One self-contained table per page -- title row, column
                  headers, and every data row all inside the same <table>,
                  with the `columns` groups laid out as real table columns
                  (colgroup) rather than as separate side-by-side <table>
                  elements in a CSS grid. This mirrors reports/mac-swim,
                  which solved the identical problem: a print engine
                  fragmenting several independently-avoiding tables inside
                  a grid is unreliable, while a single table's native
                  row-by-row pagination is exactly what browsers handle
                  predictably. */}
              <table className="buddy-list-table" style={{ width: `${totalRowWidth}in` }}>
                <colgroup>
                  {pageColumns.flatMap((_, g) => {
                    const cols = [
                      <col key={`${g}-num`} style={{ width: `${numWidth}in` }} />,
                      <col key={`${g}-name`} style={{ width: `${nameWidth}in` }} />,
                      <col key={`${g}-cabin`} style={{ width: `${cabinWidth}in` }} />
                    ];
                    if (g < pageColumns.length - 1) cols.push(<col key={`${g}-gap`} style={{ width: `${COLUMN_GAP_IN}in` }} />);
                    return cols;
                  })}
                </colgroup>
                <thead>
                  <tr>
                    <th className="buddy-list-page-title-cell" colSpan={totalTableColumns}>
                      <div className="buddy-list-page-header">
                        <span className="buddy-list-title-main">Buddy Numbers</span>
                        <span className="buddy-list-title-session">{sessionName} · {sessionYear}</span>
                        <span className="buddy-list-title-page">Page {pageIndex + 1} of {pages.length}</span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    {pageColumns.flatMap((_, g) => {
                      const heads = [
                        <th key={`${g}-num`} className="buddy-list-col-num">#</th>,
                        <th key={`${g}-name`}>NAME</th>,
                        <th key={`${g}-cabin`} className="buddy-list-col-cabin">CABIN</th>
                      ];
                      if (g < pageColumns.length - 1) heads.push(<th key={`${g}-gap`} className="buddy-list-spacer" />);
                      return heads;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRowsOnPage }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {pageColumns.flatMap((colCampers, g) => {
                        const camper = colCampers[rowIndex];
                        const cells = camper
                          ? [
                              <td key={`${g}-num`} className="buddy-list-col-num">{camper.buddyNumber}</td>,
                              <td key={`${g}-name`} className="buddy-list-col-name">{camperLabel(camper)}</td>,
                              <td key={`${g}-cabin`} className="buddy-list-col-cabin">{camper.cabinName ?? ""}</td>
                            ]
                          : [<td key={`${g}-fill`} className="buddy-list-fill" colSpan={3} />];
                        if (g < pageColumns.length - 1) cells.push(<td key={`${g}-gap`} className="buddy-list-spacer" />);
                        return cells;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}
