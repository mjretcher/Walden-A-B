"use client";

import { Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/ui";

export function PrintButton({ label = "Print / Save PDF", fitToPage = false }: { label?: string; fitToPage?: boolean }) {
  function handlePrint() {
    if (fitToPage) {
      // Temporarily inject a style that shrinks content to fit one page per sheet.
      // The browser's built-in "Scale to fit" in the print dialog is unreliable when
      // content overflows, so we do it ourselves.
      const style = document.createElement("style");
      style.id = "__print-fit-override";
      style.textContent = `
        @media print {
          .ab-menu-sheet {
            zoom: 0.82;
            transform-origin: top left;
          }
          .ab-menu-sheet__cell {
            min-height: 0 !important;
          }
        }
      `;
      document.head.appendChild(style);
      window.print();
      // Remove after print dialog closes
      setTimeout(() => {
        document.head.removeChild(style);
      }, 500);
    } else {
      window.print();
    }
  }

  return (
    <button className={`${secondaryButtonClass} no-print`} onClick={handlePrint} type="button">
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
