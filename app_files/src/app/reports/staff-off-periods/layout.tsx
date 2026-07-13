import type { ReactNode } from "react";

export default function StaffOffPeriodsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* PageHeader doesn't wrap itself in .no-print, so its wrapper div
       * needs to be hidden here explicitly on print -- same fix
       * Registration Assignments and Optionals Assignments apply for the
       * same reason (see those layout.tsx files). The print sheets below
       * carry their own titles instead. */}
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
