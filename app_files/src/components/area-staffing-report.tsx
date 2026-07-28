import { Period, UserRole } from "@prisma/client";
import type { CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  A_DAY_PERIODS,
  AreaCaGrid,
  AreaFinalWeekGrid,
  AreaRosterGrid,
  AreaStaffingColumn,
  AreaStaffingGrid,
  B_DAY_PERIODS,
  buildAreaStaffingData,
  groupColumns,
  rowHeightIn,
  sheetSizeClass
} from "@/lib/area-staffing";

function renderSheet({
  areaName,
  sessionName,
  day,
  periods,
  columns,
  grid,
  caGrid,
  rosterGrid,
  finalWeekGrid,
  rowHeight,
  groupLabel
}: {
  areaName: string;
  sessionName: string;
  day: "A" | "B";
  periods: Period[];
  columns: AreaStaffingColumn[];
  grid: AreaStaffingGrid;
  caGrid: AreaCaGrid;
  rosterGrid: AreaRosterGrid;
  finalWeekGrid: AreaFinalWeekGrid;
  rowHeight: number;
  groupLabel: string | null;
}) {
  const sizeClass = sheetSizeClass(columns.length);
  return (
    <section className={`area-sheet ${sizeClass}`} style={{ "--area-row-height": `${rowHeight}in` } as CSSProperties}>
      <div className="area-sheet-header">
        <div className="area-sheet-header-left">
          <span className="area-sheet-label">AREA HEAD:</span>
          <span className="area-sheet-blank-line">&nbsp;</span>
        </div>
        <div className="area-sheet-header-center">
          {areaName.toUpperCase()} - DAY:&nbsp;
          <span className={day === "A" ? "area-sheet-day-on" : "area-sheet-day-off"}>A</span>
          &nbsp;&nbsp;
          <span className={day === "B" ? "area-sheet-day-on" : "area-sheet-day-off"}>B</span>
          {groupLabel ? <span className="area-sheet-group-label"> &middot; {groupLabel}</span> : null}
        </div>
        <div className="area-sheet-header-right">{sessionName}</div>
      </div>

      <table className="area-sheet-table">
        <thead>
          <tr>
            <th className="area-sheet-row-num">&nbsp;</th>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period, periodIdx) => (
            <tr key={period}>
              <td className="area-sheet-row-num">{periodIdx + 1}</td>
              {columns.map((column) => {
                const entries = grid.get(period)?.get(column.key) ?? [];
                const caNames = caGrid.get(period)?.get(column.key) ?? [];
                const rosterCount = rosterGrid.get(period)?.get(column.key) ?? 0;
                // Second bubble only when the class actually loses someone —
                // equal numbers would just be noise on a dense duty sheet.
                const finalWeekCount = finalWeekGrid.get(period)?.get(column.key) ?? 0;
                const showFinalWeek = rosterCount > 0 && finalWeekCount !== rosterCount;
                return (
                  <td key={column.key} className="area-sheet-cell">
                    {rosterCount > 0 ? <span className="sheet-count-bubble" title={`${rosterCount} rostered`}>{rosterCount}</span> : null}
                    {showFinalWeek ? (
                      <span className="sheet-final-week-bubble" title={`${finalWeekCount} still here the final week`}>
                        &rarr;{finalWeekCount}
                      </span>
                    ) : null}
                    {entries.length === 0 ? null : (
                      <ul className="area-sheet-staff-list">
                        {entries.map((entry) => (
                          <li key={`${entry.lastName}-${entry.firstName}`}>{entry.displayName}</li>
                        ))}
                      </ul>
                    )}
                    {caNames.length ? (
                      <div className="area-sheet-ca-box">
                        {caNames.map((name) => <div key={name}>{name}</div>)}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export async function AreaStaffingReport({ areaName, title }: { areaName: string; title: string }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const data = await buildAreaStaffingData(areaName);

  if (!data.sessionName) {
    return (
      <AppShell user={user}>
        <PageHeader title={title} eyebrow="Duty sheet for A-day and B-day" />
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">No active session found.</p>
      </AppShell>
    );
  }

  if (!data.columns.length) {
    return (
      <AppShell user={user}>
        <PageHeader title={title} eyebrow="Duty sheet for A-day and B-day" />
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
          No active activities found for {areaName} this session — build some in Menu Builder first.
        </p>
      </AppShell>
    );
  }

  const groups = groupColumns(data.columns);
  const rowHeight = rowHeightIn(data.maxCellEntries, data.maxCaEntries);
  const multiGroup = groups.length > 1;

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title={title} eyebrow="Duty sheet for A-day and B-day">
          <PrintButton label={`Print A & B sheet${multiGroup ? "s" : ""}`} />
        </PageHeader>
        <p className="mb-5 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-900">
          {multiGroup
            ? `${data.columns.length} activities is more than fits legibly on one sheet, so this prints ${groups.length} column-groups per day (${groups.length * 2} pages total).`
            : "Two pages print: A-day and B-day."}{" "}
          Staff are listed alphabetically by last name inside each box. The number in the top-right corner of a box is how many campers are rostered in that class that period (CAMPER registrations only — the CA box below is separate and not counted). Counselor Assistants on a Teaching Assistant registration for that period show separately in a small dotted box in the bottom-right corner — visible, but kept apart from the real staff. Empty boxes stay blank where no assignment exists yet — pen them in.
        </p>
      </div>

      <div className="area-sheet-print-stack">
        {groups.map((columns, groupIndex) => {
          const groupLabel = multiGroup ? `${groupIndex + 1} of ${groups.length}` : null;
          return (
            <div key={groupIndex}>
              {renderSheet({ areaName, sessionName: data.sessionName!, day: "A", periods: A_DAY_PERIODS, columns, grid: data.grid, caGrid: data.caGrid, rosterGrid: data.rosterGrid, finalWeekGrid: data.finalWeekGrid, rowHeight, groupLabel })}
              {renderSheet({ areaName, sessionName: data.sessionName!, day: "B", periods: B_DAY_PERIODS, columns, grid: data.grid, caGrid: data.caGrid, rosterGrid: data.rosterGrid, finalWeekGrid: data.finalWeekGrid, rowHeight, groupLabel })}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
