import { Download } from "lucide-react";
import { Period, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PERIOD_LABEL } from "@/lib/periods";
import { buildStaffScheduleRows, staffScheduleColumns } from "@/lib/staff-schedule-report";
import { StaffScheduleAutoRefresh } from "./auto-refresh";

// Period columns for each printed page. STAFF_PERIODS includes twilight (5A/5B)
// so staff see their full day on the schedule they hang up.
const A_DAY_LABELS = [Period.P1A, Period.P2A, Period.P3A, Period.P4A, Period.P5A].map((period) => PERIOD_LABEL[period]);
const B_DAY_LABELS = [Period.P1B, Period.P2B, Period.P3B, Period.P4B, Period.P5B].map((period) => PERIOD_LABEL[period]);

export default async function StaffScheduleReport() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const { session, rows } = await buildStaffScheduleRows();

  function renderPrintTable(periodLabels: string[], pageLabel: "A Day" | "B Day") {
    return (
      <table className="staff-schedule-print-table">
        <thead>
          <tr>
            <th colSpan={2 + periodLabels.length} className="staff-schedule-print-title">
              {session?.name ?? "Active Session"} — Staff Schedule — {pageLabel}
            </th>
          </tr>
          <tr>
            <th className="staff-schedule-print-name">Name</th>
            <th className="staff-schedule-print-cert">Status / Cert.</th>
            {periodLabels.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.Staff}-${pageLabel}-${rowIndex}`}>
              <td className="staff-schedule-print-name">{row.Staff}</td>
              <td className="staff-schedule-print-cert">{row["Status/certification"]}</td>
              {periodLabels.map((label) => (
                <td key={label}>{row[label as (typeof staffScheduleColumns)[number]] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <AppShell user={user}>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Staff A/B Schedule View</h1>
          <p className="mt-1 text-slate-600">Alphabetical live staff assignment grid for {session?.name ?? "the active session"}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StaffScheduleAutoRefresh />
          <PrintButton label="Print schedule" orientationToggle defaultOrientation="portrait" />
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=csv"><Download className="h-4 w-4" />CSV</a>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=xlsx"><Download className="h-4 w-4" />XLSX</a>
        </div>
      </div>

      {/* Live on-screen view — hidden when printing. No min-width so the
        * full 12-column grid fits the viewport (including projector use
        * where horizontal scrolling on a projected display is impractical). */}
      <section className="no-print rounded-xl border border-slate-200 bg-white shadow-soft">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-16 z-20 md:top-0">
            <tr className="bg-forest-900 text-left text-white shadow-[0_2px_0_rgba(0,0,0,0.08)]">
              {staffScheduleColumns.map((column, index) => {
                // Proportional widths so the table flexes with screen size.
                // Name and Status get larger shares; period columns share the rest evenly.
                const widthStyle =
                  index === 0
                    ? { width: "12%" }
                    : index === 1
                      ? { width: "7%" }
                      : { width: "8.1%" };
                return (
                  <th key={column} style={widthStyle} className="border-l border-forest-800 bg-forest-900 px-2 py-2 text-left align-middle text-[11px] font-black uppercase tracking-wide first:border-l-0">
                    {column}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
                <tr key={`${row.Staff}-${rowIndex}`} className="border-b border-slate-200 odd:bg-white even:bg-slate-50/70">
                  {staffScheduleColumns.map((column, columnIndex) => {
                    const widthStyle =
                      columnIndex === 0
                        ? { width: "12%" }
                        : columnIndex === 1
                          ? { width: "7%" }
                          : { width: "8.1%" };
                    const fontClass =
                      columnIndex === 0
                        ? "font-black text-slate-950"
                        : "text-slate-800";
                    return (
                      <td key={column} style={widthStyle} className={`${fontClass} break-words border-l border-slate-200 px-2 py-1.5 align-top leading-tight first:border-l-0`}>
                        {row[column]}
                      </td>
                    );
                  })}
                </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm font-bold text-slate-500">No active staff found.</p> : null}
      </section>

      {/* Print-only layout — A-day page, then B-day page. Hidden on screen. */}
      <section className="staff-schedule-print">
        <div className="staff-schedule-print-page">{renderPrintTable(A_DAY_LABELS, "A Day")}</div>
        <div className="staff-schedule-print-page">{renderPrintTable(B_DAY_LABELS, "B Day")}</div>
      </section>

      <p className="no-print mt-4 text-sm font-medium text-slate-500">
        <Badge tone="blue">Live view</Badge> Updates automatically every few seconds — no refresh needed.
      </p>
    </AppShell>
  );
}
