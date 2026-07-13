import type { ReactNode } from "react";

export default function OptionalsAssignmentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* PageHeader doesn't wrap itself in .no-print, so its wrapper div
       * needs to be hidden here explicitly -- same fix Registration
       * Assignments applies for the same reason (see that layout.tsx). */}
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
