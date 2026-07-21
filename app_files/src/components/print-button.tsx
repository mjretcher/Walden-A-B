"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/ui";

type Orientation = "landscape" | "portrait";

export function PrintButton({
  label = "Print / Save PDF",
  fitToPage = false,
  orientationToggle = false,
  defaultOrientation = "landscape",
  pageOrientation
}: {
  label?: string;
  fitToPage?: boolean;
  // When true, shows a Landscape/Portrait chooser next to the print button.
  orientationToggle?: boolean;
  defaultOrientation?: Orientation;
  // Force a fixed orientation for this print run WITHOUT showing a chooser.
  // Injects a plain (un-named) @page rule at print time so the chosen
  // orientation wins the cascade in EVERY browser — including Safari, which
  // ignores CSS named pages (`page: foo` / `@page foo {}`) entirely and would
  // otherwise fall back to the site-wide landscape default and clip the sheet.
  pageOrientation?: Orientation;
}) {
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);

  function handlePrint() {
    const style = document.createElement("style");
    style.id = "__print-fit-override";

    // When the orientation toggle is in play we set @page size so the chosen
    // orientation wins for this print run (overrides the global landscape rule).
    // A forced `pageOrientation` does the same, sans chooser (see prop comment).
    const pageRule = orientationToggle
      ? `@page { size: letter ${orientation}; margin: 0.28in; }`
      : pageOrientation
        ? `@page { size: letter ${pageOrientation}; margin: 0.3in; }`
        : "";

    // Fit zoom: portrait is narrower (8.5in vs 11in) so it needs a smaller zoom
    // to keep all four period columns on the page. Landscape keeps the prior 0.82.
    const fitZoom = fitToPage || orientationToggle
      ? (orientation === "portrait" ? 0.62 : 0.82)
      : null;

    const fitRule = fitZoom
      ? `.ab-menu-sheet { zoom: ${fitZoom}; transform-origin: top left; } .ab-menu-sheet__cell { min-height: 0 !important; }`
      : "";

    if (pageRule || fitRule) {
      style.textContent = `@media print { ${pageRule} ${fitRule} }`;
      document.head.appendChild(style);
    }

    window.print();

    setTimeout(() => {
      if (style.parentNode) document.head.removeChild(style);
    }, 500);
  }

  return (
    <div className="no-print inline-flex flex-wrap items-center gap-2">
      {orientationToggle ? (
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          <button
            type="button"
            className={`px-3 py-2 text-xs font-black ${orientation === "landscape" ? "bg-forest-700 text-white" : "bg-white text-slate-700"}`}
            onClick={() => setOrientation("landscape")}
          >
            Landscape
          </button>
          <button
            type="button"
            className={`px-3 py-2 text-xs font-black ${orientation === "portrait" ? "bg-forest-700 text-white" : "bg-white text-slate-700"}`}
            onClick={() => setOrientation("portrait")}
          >
            Portrait
          </button>
        </div>
      ) : null}
      <button className={secondaryButtonClass} onClick={handlePrint} type="button">
        <Printer className="h-4 w-4" />
        {label}
      </button>
    </div>
  );
}
