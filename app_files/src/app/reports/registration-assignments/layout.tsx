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

          .registration-assignments__row {
            display: block !important;
            min-height: 0.155in !important;
          }

          .registration-assignments__slot-label {
            display: inline !important;
          }

          .registration-assignments__print-name {
            border: 0 !important;
            border-bottom: 0 !important;
            box-shadow: none !important;
            display: inline !important;
            min-height: 0 !important;
            min-width: 0 !important;
            padding: 0 !important;
            text-decoration: none !important;
          }

          .registration-assignments__section h3 {
            text-decoration-line: underline !important;
            text-decoration-style: wavy !important;
            text-decoration-thickness: 1.4px !important;
            text-underline-offset: 0.055in !important;
          }

          .registration-assignments__section h3::after,
          .registration-assignments__header::before,
          .registration-assignments-paper::before,
          .registration-assignments-paper::after {
            display: none !important;
          }

          .registration-assignments__section--additional h3 {
            text-decoration: none !important;
          }
        }
      `}</style>
    </>
  );
}
