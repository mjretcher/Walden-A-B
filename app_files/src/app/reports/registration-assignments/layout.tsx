import type { ReactNode } from "react";

export default function RegistrationAssignmentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* The paper layout (sizing, grid, fonts) lives in one place now:
       * RegistrationAssignmentPrintStyles in page.tsx. This file used to carry
       * a second, independent copy of that same CSS - an older column-based
       * layout that didn't even match the current grid-area design - and
       * globals.css carried a THIRD, still older copy underneath both. Three
       * stylesheets targeting identical class names with different values
       * meant the browser's cascade order silently decided which one "won"
       * for any property that wasn't consistently marked !important - which
       * is exactly what produced the unpredictable print layout and the
       * stray blank second page. All three are now consolidated into
       * page.tsx's version; this file only keeps the one rule that has
       * nowhere else to live: PageHeader doesn't wrap itself in .no-print, so
       * its wrapper div has to be hidden here explicitly. */}
      <style>{`
        @media print {
          main > div:first-child {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
