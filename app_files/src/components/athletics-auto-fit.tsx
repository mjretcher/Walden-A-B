"use client";

import { cloneElement, isValidElement, useLayoutEffect, useRef, type ReactElement } from "react";

/**
 * Guarantees the Athletics Assignments sheet (a single table — no separate
 * header div like Waterfront has, since the ATH corner/period columns/banner
 * all live inside this table's own <thead>) always fits on one printed page,
 * no matter how much data a given day has.
 *
 * Same reasoning as WaterfrontAutoFit (see waterfront-auto-fit.tsx): the
 * server computes a per-row height guess from station content (see
 * rowHeightIn/rowLinesNeeded), but CSS `height` on a table row is a
 * *minimum*, not a cap — a genuinely busy period (several activities
 * sharing a station, staff, and a CA box all stacked in one cell) can still
 * render taller than guessed and push the sheet onto a second page. Rather
 * than guessing harder, this measures the real rendered height in the
 * browser and shrinks a single `--athletics-scale` CSS variable (font-size,
 * padding, and row-height all read off it via calc() in globals.css) until
 * the table actually fits the page budget.
 */

// @page athleticsAssignments in globals.css: `size: letter portrait;
// margin: 0.3in`, so the physical page is 11in tall with 0.3in top+bottom
// margins => 10.4in usable. Portrait, unlike Waterfront's landscape sheet.
const PAGE_USABLE_HEIGHT_IN = 11 - 0.3 * 2;

// .athletics-sheet's own border (1.5pt) + padding (0.2in), top+bottom.
const SHEET_CHROME_IN = 0.2 * 2 + (1.5 / 72) * 2;

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

export function AthleticsAutoFit({ table }: { table: ReactElement }) {
  const tableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const tableEl = tableRef.current;
    if (!tableEl) return;

    // Always start from natural (unscaled) size before measuring, so a
    // previous shrink from stale data never compounds into this pass.
    tableEl.style.setProperty("--athletics-scale", "1");

    let scale = 1;
    for (let i = 0; i < MAX_PASSES; i++) {
      const height = tableEl.scrollHeight;
      if (height <= AVAILABLE_HEIGHT_PX || scale <= MIN_SCALE) break;
      scale = Math.max(MIN_SCALE, scale * (AVAILABLE_HEIGHT_PX / height));
      tableEl.style.setProperty("--athletics-scale", scale.toFixed(4));
    }
  });

  return isValidElement(table) ? cloneElement(table as ReactElement<Record<string, unknown>>, { ref: tableRef }) : table;
}
