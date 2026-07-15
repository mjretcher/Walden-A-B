import type { ReactNode } from "react";

export default function StaffWorkingPeriodsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* Same fix as Staff Off Periods' layout.tsx -- PageHeader doesn't
       * hide itself on print, so its wrapper div needs to be hidden here.
       * The print sheets below carry their own titles instead. */}
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
