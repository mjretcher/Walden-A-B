"use client";

import { Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/ui";

/**
 * Print mode: ALL A-day and B-day periods on a single portrait page, pure
 * black & white, tight cells, full staff names on one line. Intended for
 * the schedule sheet that gets posted on the wall.
 *
 * Mechanism:
 *  - Adds body class `print-mode-staff-compact-ab` so CSS can:
 *      • hide the standard two-page A/B print layout
 *      • show the .staff-schedule-print-compact section
 *      • apply the tight B&W typography from globals.css
 *  - Injects a temporary <style> with `@page { size: letter portrait }`
 *    so the printed paper is portrait regardless of the global default.
 *  - Calls window.print(), then cleans up both the class and the style.
 *
 * No state for orientation — this mode is always portrait by definition.
 * Pure B&W is enforced by the CSS rules tied to the body class.
 */
export function PrintCompactAbButton() {
  function handlePrint() {
    const body = document.body;
    const className = "print-mode-staff-compact-ab";
    body.classList.add(className);

    const style = document.createElement("style");
    style.id = "__print-compact-ab-override";
    // Tight portrait margins so the 12-column grid (Staff | Cert | 1A..5B)
    // gets every horizontal pixel possible. 0.2in is about the minimum
    // most desktop printers accept without the driver clipping content.
    style.textContent = `@media print { @page { size: letter portrait; margin: 0.2in; } }`;
    document.head.appendChild(style);

    // The actual print call. After it returns, the modal has been dismissed
    // (whether the user printed or cancelled), so clean up immediately.
    window.print();

    setTimeout(() => {
      body.classList.remove(className);
      if (style.parentNode) document.head.removeChild(style);
    }, 500);
  }

  return (
    <button className={secondaryButtonClass} onClick={handlePrint} type="button" title="All A-day and B-day periods on one portrait page, black & white">
      <Printer className="h-4 w-4" />
      Print A+B (1 page B&W)
    </button>
  );
}
