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
            overflow: visible !important;
            padding: 0 !important;
          }

          .registration-assignments-paper {
            --ink: #111 !important;
            background: #fffdf8 !important;
            border: 3px solid var(--ink) !important;
            color: var(--ink) !important;
            display: grid !important;
            font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
            grid-template-rows: auto auto 1fr !important;
            height: 10.35in !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
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

          .registration-assignments__header h2,
          .registration-assignments__instructions,
          .registration-assignments__section h3,
          .registration-assignments__slot-label,
          .registration-assignments__print-name {
            font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
          }

          .registration-assignments__header {
            border-bottom: 3px solid var(--ink) !important;
            padding: 0.12in 0.18in 0.09in !important;
            position: relative !important;
          }

          .registration-assignments__header h2 {
            font-size: 0.34in !important;
            letter-spacing: 0.008em !important;
            line-height: 1 !important;
            margin: 0 !important;
            text-align: left !important;
            white-space: nowrap !important;
          }

          .registration-assignments__instructions {
            border-bottom: 3px solid var(--ink) !important;
            font-size: 0.127in !important;
            font-weight: 900 !important;
            line-height: 1.2 !important;
            margin: 0 !important;
            padding: 0.08in 0.16in !important;
            text-align: left !important;
          }

          .registration-assignments__layout {
            grid-template-columns: 38% 34% 28% !important;
            grid-template-rows: 1.32fr 1.43fr 1.45fr 1.03fr 1.2fr !important;
            min-height: 0 !important;
            width: 100% !important;
          }

          .registration-assignments__section {
            border-bottom: 3px solid var(--ink) !important;
            border-right: 3px solid var(--ink) !important;
            min-height: 0 !important;
            overflow: hidden !important;
            padding: 0.08in 0.09in !important;
            position: relative !important;
          }

          .registration-assignments__section::before,
          .registration-assignments__section::after {
            display: none !important;
          }

          .registration-assignments__section--arts,
          .registration-assignments__section--outdoor,
          .registration-assignments__section--checkout,
          .registration-assignments__section--additional {
            border-right: 0 !important;
          }

          .registration-assignments__section--media,
          .registration-assignments__section--performing,
          .registration-assignments__section--additional {
            border-bottom: 0 !important;
          }

          .registration-assignments__section h3 {
            display: inline-block !important;
            font-size: 0.19in !important;
            line-height: 1 !important;
            margin: 0 0 0.07in !important;
            text-decoration-color: var(--ink) !important;
            text-decoration-line: underline !important;
            text-decoration-style: wavy !important;
            text-decoration-thickness: 1.5px !important;
            text-transform: uppercase !important;
            text-underline-offset: 0.045in !important;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.135in !important;
            max-width: none !important;
            text-decoration: none !important;
          }

          .registration-assignments__rows {
            display: grid !important;
            gap: 0.014in !important;
          }

          .registration-assignments__row {
            display: block !important;
            min-height: 0.142in !important;
          }

          .registration-assignments__slot-label {
            display: inline !important;
            font-size: 0.108in !important;
            font-weight: 900 !important;
            letter-spacing: 0 !important;
            line-height: 1 !important;
            text-transform: uppercase !important;
            white-space: nowrap !important;
          }

          .registration-assignments__print-name {
            border: 0 !important;
            border-bottom: 0 !important;
            box-shadow: none !important;
            display: inline !important;
            font-size: 0.108in !important;
            line-height: 1 !important;
            min-height: 0 !important;
            min-width: 0 !important;
            padding: 0 !important;
            text-decoration: none !important;
            white-space: nowrap !important;
          }

          .registration-assignments__print-name:empty {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
