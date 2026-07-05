import { Period, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { A_DAY_PERIODS, AthleticsGrid, ATHLETICS_STATIONS, B_DAY_PERIODS, buildAthleticsAssignmentsData } from "@/lib/athletics-assignments";

function renderSheet(day: "A" | "B", periods: Period[], grid: AthleticsGrid) {
  return (
    <section className="athletics-sheet">
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
          {ATHLETICS_STATIONS.map((station, stationIndex) => (
            <tr key={station.key}>
              <td className="athletics-row-label">{station.label}</td>
              {periods.map((period) => {
                const entries = grid.get(period)?.get(station.key) ?? [];
                return (
                  <td key={period}>
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
                  </td>
                );
              })}
              {stationIndex === 0 ? (
                <td className="athletics-banner" rowSpan={ATHLETICS_STATIONS.length}>
                  <span>ATHLETIC ASSIGNMENTS &middot; QTR &middot; DAY</span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
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
        <PageHeader title="Athletics Assignments" eyebrow="Duty sheet for A-day and B-day" />
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Athletics Assignments" eyebrow="Duty sheet for A-day and B-day">
          <PrintButton label="Print A & B sheets" />
        </PageHeader>
        <p className="mb-5 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-900">
          Two pages print: A-day and B-day. Each box shows the activity running at that station that period (bold) with assigned staff listed below it, both pulled live from Menu Builder and Scream Session — empty boxes stay blank where nothing's scheduled or staffed yet. Station rows and activity matching are a best-effort reconstruction from a photo of the paper form; if something lands in the wrong row, let me know which activity and which row it belongs in instead.
        </p>
      </div>

      <div className="athletics-print-stack">
        {renderSheet("A", A_DAY_PERIODS, data.grid)}
        {renderSheet("B", B_DAY_PERIODS, data.grid)}
      </div>
    </AppShell>
  );
}
