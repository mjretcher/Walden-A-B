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
            --ink: #111 !important;
            background: #fffdf8 !important;
            border: 3px solid var(--ink) !important;
            display: grid !important;
            font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
            margin: 0 auto !important;
          }

          .registration-assignments-paper::before,
          .registration-assignments-paper::after,
          .registration-assignments__header::before,
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
            padding-top: 0.2in !important;
          }

          .registration-assignments__header::after {
            background: repeating-linear-gradient(95deg, transparent 0 10px, rgba(17,17,17,0.95) 10px 12px, transparent 12px 22px), repeating-linear-gradient(84deg, transparent 0 11px, rgba(17,17,17,0.65) 11px 13px, transparent 13px 23px) !important;
            content: "" !important;
            display: block !important;
            height: 8px !important;
            left: 0.18in !important;
            opacity: 0.7 !important;
            position: absolute !important;
            right: 0.18in !important;
            top: 0.04in !important;
          }

          .registration-assignments__header h2 {
            font-size: 0.43in !important;
            letter-spacing: 0.01em !important;
            line-height: 1 !important;
          }

          .registration-assignments__instructions {
            font-size: 0.155in !important;
            line-height: 1.22 !important;
          }

          .registration-assignments__section {
            border-bottom: 0 !important;
            border-right: 0 !important;
            padding: 0.1in 0.11in !important;
            position: relative !important;
          }

          .registration-assignments__section::before,
          .registration-assignments__section::after {
            content: "" !important;
            opacity: 0.95 !important;
            position: absolute !important;
            z-index: 2 !important;
          }

          .registration-assignments__section::before {
            background: repeating-linear-gradient(182deg, #111 0 12px, transparent 12px 13px) !important;
            bottom: -2px !important;
            right: -2px !important;
            top: -2px !important;
            width: 3px !important;
          }

          .registration-assignments__section::after {
            background: repeating-linear-gradient(92deg, #111 0 12px, transparent 12px 13px) !important;
            bottom: -2px !important;
            height: 3px !important;
            left: -2px !important;
            right: -2px !important;
          }

          .registration-assignments__section--arts::before,
          .registration-assignments__section--outdoor::before,
          .registration-assignments__section--checkout::before,
          .registration-assignments__section--additional::before {
            display: none !important;
          }

          .registration-assignments__section--media::after,
          .registration-assignments__section--performing::after,
          .registration-assignments__section--additional::after {
            display: none !important;
          }

          .registration-assignments__section h3 {
            display: inline-block !important;
            font-size: 0.205in !important;
            line-height: 1 !important;
            margin-bottom: 0.08in !important;
            text-decoration-color: var(--ink) !important;
            text-decoration-line: underline !important;
            text-decoration-style: wavy !important;
            text-decoration-thickness: 1.5px !important;
            text-underline-offset: 0.055in !important;
          }

          .registration-assignments__section--additional h3 {
            font-size: 0.145in !important;
            max-width: none !important;
            text-decoration: none !important;
          }

          .registration-assignments__rows {
            gap: 0.018in !important;
          }

          .registration-assignments__row {
            display: block !important;
            min-height: 0.155in !important;
          }

          .registration-assignments__slot-label {
            display: inline !important;
            font-size: 0.123in !important;
            letter-spacing: 0 !important;
          }

          .registration-assignments__print-name {
            border: 0 !important;
            border-bottom: 0 !important;
            box-shadow: none !important;
            display: inline !important;
            font-size: 0.12in !important;
            min-height: 0 !important;
            min-width: 0 !important;
            padding: 0 !important;
            text-decoration: none !important;
          }

          .registration-assignments__print-name:empty {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
