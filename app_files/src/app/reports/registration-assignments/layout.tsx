import type { ReactNode } from "react";

export default function RegistrationAssignmentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <style>{`
        @media print {
          .no-print,
          main > div:first-child,
          .registration-assignment-workspace > section.no-print {
            display: none !important;
          }

          html,
          body,
          main,
          .registration-assignment-workspace {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .registration-assignments-paper {
            display: grid !important;
            margin: 0 auto !important;
          }
        }
      `}</style>
    </>
  );
}
