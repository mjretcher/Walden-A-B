import { Period, UserRole } from "@prisma/client";
import type { CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { AthleticsAutoFit } from "@/components/athletics-auto-fit";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { A_DAY_PERIODS, AthleticsCaGrid, AthleticsGrid, ATHLETICS_STATIONS, B_DAY_PERIODS, buildAthleticsAssignmentsData, rowLinesNeeded } from "@/lib/athletics-assignments";

// Row height in inches for a station whose busiest cell needs `lines` lines
// of text (activity + staff, see rowLinesNeeded). Calibrated so a normal
// single-activity-with-staff row (2 lines) lands close to a comfortable
// letter-page-filling size, and only genuinely busy rows (multiple
// activities sharing a station+period) grow taller — verified by
// rendering sample data rather than guessed blind. AthleticsAutoFit (see
// that file) is the guarantee on top of this guess: it measures the real
// rendered height in the browser and shrinks everything further if this
// estimate wasn't tight enough for a particular day's actual data.
function rowHeightIn(lines: number): number {
  const needed = 0.6 + Math.max(lines, 1) * 0.12;
  return Math.max(0.65, Math.min(1.3, needed));
}

function renderSheet(day: "A" | "B", periods: Period[], grid: AthleticsGrid, caGrid: AthleticsCaGrid, sessionName: string) {
  const table = (
    <table className="athletics-sheet-table">
      <thead>
        <tr>
          <th className="athletics-corner">ATH</th>
          {periods.map((period, index) => (
            <th key={period}>{`${index + 1}${day}`}</th>
          ))}
          <th className="athletics-banner-header">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {ATHLETICS_STATIONS.map((station, stationIndex) => {
          const rowHeight = rowHeightIn(rowLinesNeeded(grid, caGrid, station.key, periods));
          return (
            <tr key={station.key} style={{ "--athletics-row-height": `${rowHeight}in` } as CSSProperties}>
              <td className="athletics-row-label">{station.label}</td>
              {periods.map((period) => {
                const entries = grid.get(period)?.get(station.key) ?? [];
                const caNames = caGrid.get(period)?.get(station.key) ?? [];
                return (
                  <td key={period} className="athletics-cell">
                    {entries.length ? (
                      <ul className="athletics-cell-list">
                        {entries.map((entry, index) => (
                          <li key={index}>
                            <span className="athletics-cell-activity">{entry.activityLabel}</span>
                            {entry.staffNames.length ? <span className="athletics-cell-staff">{entry.staffNames.join(", ")}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {caNames.length ? (
                      <div className="athletics-ca-box">
                        {caNames.map((name) => <div key={name}>{name}</div>)}
                      </div>
                    ) : null}
                  </td>
                );
              })}
              {stationIndex === 0 ? (
                <td className="athletics-banner" rowSpan={ATHLETICS_STATIONS.length}>
                  <span>ATHLETIC ASSIGNMENTS &middot; {sessionName.toUpperCase()} &middot; DAY {day}</span>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className="athletics-sheet">
      <AthleticsAutoFit table={table} />
      <p className="athletics-sheet-footer no-print"><span className="font-black">Day {day}</span> &middot; Periods {day === "A" ? "1A\u20135A" : "1B\u20135B"}</p>
    </section>
  );
}

export default async function AthleticsStaffingPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const data = await buildAthleticsAssignmentsData();

  if (!data.sessionName) {
    return (
      <AppShell user={user}>
        <PageHeader title="Athletics Assignments" eyebrow="Duty sheet for A-day and B-day" backHref="/reports" backLabel="Back to Reports" />
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Athletics Assignments" eyebrow="Duty sheet for A-day and B-day" backHref="/reports" backLabel="Back to Reports">
          <PrintButton label="Print A & B sheets" />
        </PageHeader>
        <p className="mb-5 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-900">
          Two pages print: A-day and B-day. Each box shows the activity running at that station that period (bold) with assigned staff listed below it, both pulled live from Menu Builder and Scream Session — empty boxes stay blank where nothing's scheduled or staffed yet. Counselor Assistants on a Teaching Assistant registration for that period show separately in a small dotted box in the bottom-right corner — visible, but kept apart from the real staff. Station rows and activity matching are a best-effort reconstruction from a photo of the paper form; if something lands in the wrong row, let me know which activity and which row it belongs in instead.
        </p>
      </div>

      <div className="athletics-print-stack">
        {renderSheet("A", A_DAY_PERIODS, data.grid, data.caGrid, data.sessionName!)}
        {renderSheet("B", B_DAY_PERIODS, data.grid, data.caGrid, data.sessionName!)}
      </div>
    </AppShell>
  );
}
