import type { ReactNode } from "react";

export default function RegistrationAssignmentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .registration-assignments-paper {
                background: #fffdf8 !important;
                font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
              }

              .registration-assignments__header h2,
              .registration-assignments__section h3,
              .registration-assignments__slot-label {
                font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
                font-weight: 900 !important;
              }

              .registration-assignments__header h2 {
                font-size: 0.44in !important;
                letter-spacing: 0.015em !important;
              }

              .registration-assignments__instructions {
                font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
                font-size: 0.155in !important;
                line-height: 1.23 !important;
              }

              .registration-assignments__section h3::after,
              .registration-assignments__header::before {
                background-image: url("data:image/svg+xml,%3Csvg width='86' height='8' viewBox='0 0 86 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 4c5-4 10 4 15 0s10-4 15 0 10 4 15 0 10-4 15 0 10 4 24 0' fill='none' stroke='%23111' stroke-width='1.45' stroke-linecap='round'/%3E%3C/svg%3E") !important;
                background-size: 86px 8px !important;
                height: 8px !important;
                opacity: 0.82 !important;
              }

              .registration-assignments__section h3::after {
                bottom: -0.055in !important;
                right: -0.05in !important;
              }

              .registration-assignments__section--additional h3::after {
                display: none !important;
              }

              .registration-assignments__row {
                grid-template-columns: auto minmax(0, 1fr) !important;
                min-height: 0.16in !important;
              }

              .registration-assignments__slot-label {
                font-size: 0.125in !important;
                letter-spacing: 0 !important;
              }

              .registration-assignments__print-name {
                border-bottom: 0 !important;
                box-shadow: none !important;
                font-family: "Comic Sans MS", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif !important;
                font-size: 0.12in !important;
                min-height: 0.12in !important;
                text-decoration: none !important;
              }

              .registration-assignments__section--additional h3 {
                font-size: 0.145in !important;
                letter-spacing: 0.01em !important;
                max-width: none !important;
              }
            }
          `
        }}
      />
    </>
  );
}
