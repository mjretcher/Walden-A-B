"use client";

import { cloneElement, isValidElement, useLayoutEffect, useRef, type ReactElement } from "react";

/**
 * Guarantees the Waterfront Staffing sheet (header + table) always fits on
 * one printed page, no matter how much staff data a given day has.
 *
 * Why this exists: the server computes a per-row height guess from staff
 * counts (see rowHeightIn/columnLinesNeeded in page.tsx), but that's only an
 * estimate — and CSS `height` on a table row is a *minimum*, not a cap, so a
 * genuinely busy period (a loaded SKI column, several SWIM sub-boxes plus a
 * CA box stacked up) can still render taller than guessed and push the sheet
 * onto a second page. Rather than guessing harder, this measures the real
 * rendered height in the browser and shrinks a single `--waterfront-scale`
 * CSS variable (font-size, padding, and row-height all read off it via
 * calc() in globals.css) until the table actually fits the page budget.
 *
 * Runs client-side via useLayoutEffect so it settles before the person ever
 * opens the print dialog, and reruns whenever the underlying data changes.
 */

// @page in globals.css: `size: letter landscape; margin: 0.2in`, so the
// physical page is 8.5in tall with 0.2in top+bottom margins => 8.1in usable.
const PAGE_USABLE_HEIGHT_IN = 8.5 - 0.2 * 2;

// .waterfront-sheet's own border (1.5pt) + padding (0.18in), top+bottom.
const SHEET_CHROME_IN = 0.18 * 2 + (1.5 / 72) * 2;

// Small cushion so rounding differences between the browser's screen
// renderer and its print engine never accidentally spill a line onto page 2.
const SAFETY_MARGIN_IN = 0.05;

const AVAILABLE_HEIGHT_IN = PAGE_USABLE_HEIGHT_IN - SHEET_CHROME_IN - SAFETY_MARGIN_IN;

// CSS "in" units are a fixed 96px per inch regardless of screen DPI, so this
// conversion holds for on-screen measurement even though nothing is printing.
const PX_PER_IN = 96;
const AVAILABLE_HEIGHT_PX = AVAILABLE_HEIGHT_IN * PX_PER_IN;

// Never shrink text past ~60% of natural size — beyond that it stops being
// legible on paper, which defeats the point of a duty sheet.
const MIN_SCALE = 0.6;

// Each pass re-measures after applying a new scale (font-size changes can
// reflow text and change how many lines wrap, so one shot isn't always
// enough). Converges in 1-2 passes in practice; capped well above that.
const MAX_PASSES = 8;

export function WaterfrontAutoFit({ header, table }: { header: ReactElement; table: ReactElement }) {
  const headerRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const headerEl = headerRef.current;
    const tableEl = tableRef.current;
    if (!headerEl || !tableEl) return;

    // Always start from natural (unscaled) size before measuring, so a
    // previous shrink from stale data never compounds into this pass.
    tableEl.style.setProperty("--waterfront-scale", "1");

    // getBoundingClientRect() only covers the header's own border box — the
    // CSS gap between header and table comes from the header's
    // margin-bottom, which isn't part of that box. Add it explicitly so the
    // table doesn't get budgeted a few extra pixels it doesn't actually have.
    const headerRect = headerEl.getBoundingClientRect();
    const headerMarginBottom = parseFloat(getComputedStyle(headerEl).marginBottom) || 0;
    const headerHeight = headerRect.height + headerMarginBottom;
    const tableBudget = AVAILABLE_HEIGHT_PX - headerHeight;

    let scale = 1;
    for (let i = 0; i < MAX_PASSES; i++) {
      const height = tableEl.scrollHeight;
      if (height <= tableBudget || scale <= MIN_SCALE) break;
      scale = Math.max(MIN_SCALE, scale * (tableBudget / height));
      tableEl.style.setProperty("--waterfront-scale", scale.toFixed(4));
    }
  });

  const headerWithRef = isValidElement(header)
    ? cloneElement(header as ReactElement<Record<string, unknown>>, { ref: headerRef })
    : header;
  const tableWithRef = isValidElement(table)
    ? cloneElement(table as ReactElement<Record<string, unknown>>, { ref: tableRef })
    : table;

  return (
    <>
      {headerWithRef}
      {tableWithRef}
    </>
  );
}
