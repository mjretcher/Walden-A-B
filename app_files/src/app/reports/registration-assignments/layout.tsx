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
            grid-template-rows: auto auto 1fr !important;
            height: 10.35in !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            width: 7.8in !important;
          }

          .registration-assignments__top-wave,
          .registration-assignments-paper::before,
          .registration-assignments-paper::after,
          .registration-assignments__header::before,
          .registration-assignments__header::after,
          .registration-assignments__section h3::after {
            display: none !important;
          }

          .registration-assignments__header {
            padding: 0.11in 0.18in 0.08in !important;
          }

          .registration-assignments__header h2 {
            font-size: 0.33in !important;
            line-height: 1 !important;
            margin: 0 !important;
            white-space: nowrap !important;
          }

          .registration-assignments__instructions {
            font-size: 0.115in !important;
            line-height: 1.15 !important;
            margin: 0 !important;
            padding: 0.07in 0.15in !important;
          }

          .registration-assignments__layout {
            display: grid !important;
            grid-template-columns: 38% 34% 28% !important;
            grid-template-rows: none !important;
            height: 100% !important;
            min-height: 0 !important;
            width: 100% !important;
          }

          .registration-assignments__column {
            border-right: 3px solid #111 !important;
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            min-height: 0 !important;
          }

          .registration-assignments__column--last {
            border-right: 0 !important;
          }

          .registration-assignments__section {
            border-bottom: 3px solid #111 !important;
            border-right: 0 !important;
            min-height: 0 !important;
            overflow: hidden !important;
            padding: 0.065in 0.075in !important;
          }

          .registration-assignments__section--last {
            border-bottom: 0 !important;
          }

          .registration-assignments__section::before,
          .registration-assignments__section::after {
            display: none !important;
          }

          .registration-assignments__section h3 {
            font-size: 0.17in !important;
            line-height: 1 !important;
            margin: 0 0 0.055in !important;
            text-decoration-line: underline !important;
            text-decoration-style: wavy !important;
            text-decoration-thickness: 1.3px !important;
            text-transform: uppercase !important;
            text-underline-offset: 0.037in !important;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.125in !important;
            text-decoration: none !important;
          }

          .registration-assignments__rows {
            display: grid !important;
            gap: 0.004in !important;
          }

          .registration-assignments__row {
            min-height: 0.112in !important;
          }

          .registration-assignments__slot-label {
            font-size: 0.088in !important;
          }

          .registration-assignments__print-name {
            font-size: 0.082in !important;
            white-space: normal !important;
          }
        }
      `}</style>
    </>
  );
}
