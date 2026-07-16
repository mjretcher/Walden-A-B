import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Single row per camper here (no DAILY/TOTAL pair like MAC Swim), so a lot
// fit on one portrait page. rowsPerColumn is independent of how many
// side-by-side columns are on the page -- every column has the same
// vertical space to work with, so more columns just means more campers
// per physical page, not fewer rows per column.
const DEFAULT_ROWS_PER_COLUMN = 40;
const MIN_ROWS_PER_COLUMN = 10;
const MAX_ROWS_PER_COLUMN = 70;
const DEFAULT_COLUMNS = 2;
const VALID_COLUMN_COUNTS = [1, 2, 3];

// Column widths are now literal inches, not percentages -- each column
// table is sized to exactly num + name + cabin (no stretch-to-fit), so
// what's typed in is what prints. Name's default scales down as more
// columns are added so 3-per-page still fits a portrait page without
// anyone having to think about it, but any of the three can be
// overridden directly regardless of column count.
const NUM_WIDTH_BOUNDS = { default: 0.4, min: 0.25, max: 1 };
const CABIN_WIDTH_BOUNDS = { default: 0.65, min: 0.4, max: 1.2 };
const NAME_WIDTH_BOUNDS = { min: 0.8, max: 4.5 };
const DEFAULT_NAME_WIDTH_BY_COLUMNS: Record<number, number> = { 1: 3.6, 2: 2.2, 3: 1.35 };
const COLUMN_GAP_IN = 0.18;
const PAGE_USABLE_WIDTH_IN = 7.7; // letter portrait, 0.4in margins each side

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type BuddyNumbersSearchParams = {
  sessionId?: string;
  rowsPerColumn?: string;
  columns?: string;
  numWidth?: string;
  nameWidth?: string;
  cabinWidth?: string;
};

export default async function BuddyNumbersReport({
  searchParams
}: {
  searchParams?: Promise<BuddyNumbersSearchParams>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const [allSessions, requestedSession] = await Promise.all([
    prisma.session.findMany({ select: { id: true, name: true, cycle: true, year: true, active: true }, orderBy: { createdAt: "desc" } }),
    params.sessionId
      ? prisma.session.findUnique({ where: { id: params.sessionId }, select: { id: true, name: true, cycle: true, year: true, active: true } })
      : prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true, active: true } })
  ]);
  const session = requestedSession ?? allSessions[0] ?? null;

  const [campers, unassignedCount] = session
    ? await Promise.all([
        prisma.camper.findMany({
          where: { sessionId: session.id, active: true, buddyNumber: { not: null } },
          select: { id: true, firstName: true, lastName: true, nickname: true, buddyNumber: true, cabin: { select: { name: true } } },
          orderBy: { buddyNumber: "asc" }
        }),
        prisma.camper.count({ where: { sessionId: session.id, active: true, buddyNumber: null } })
      ])
    : [[], 0];

  const requestedRowsPerColumn = params.rowsPerColumn ? parseInt(params.rowsPerColumn, 10) : NaN;
  const rowsPerColumn = Number.isFinite(requestedRowsPerColumn)
    ? Math.min(MAX_ROWS_PER_COLUMN, Math.max(MIN_ROWS_PER_COLUMN, requestedRowsPerColumn))
    : DEFAULT_ROWS_PER_COLUMN;

  const requestedColumns = params.columns ? parseInt(params.columns, 10) : NaN;
  const columns = VALID_COLUMN_COUNTS.includes(requestedColumns) ? requestedColumns : DEFAULT_COLUMNS;

  const requestedNumWidth = params.numWidth ? parseFloat(params.numWidth) : NaN;
  const numWidth = Number.isFinite(requestedNumWidth) ? clamp(requestedNumWidth, NUM_WIDTH_BOUNDS.min, NUM_WIDTH_BOUNDS.max) : NUM_WIDTH_BOUNDS.default;

  const requestedCabinWidth = params.cabinWidth ? parseFloat(params.cabinWidth) : NaN;
  const cabinWidth = Number.isFinite(requestedCabinWidth) ? clamp(requestedCabinWidth, CABIN_WIDTH_BOUNDS.min, CABIN_WIDTH_BOUNDS.max) : CABIN_WIDTH_BOUNDS.default;

  const requestedNameWidth = params.nameWidth ? parseFloat(params.nameWidth) : NaN;
  const nameWidth = Number.isFinite(requestedNameWidth)
    ? clamp(requestedNameWidth, NAME_WIDTH_BOUNDS.min, NAME_WIDTH_BOUNDS.max)
    : DEFAULT_NAME_WIDTH_BY_COLUMNS[columns];

  const columnTableWidth = numWidth + nameWidth + cabinWidth;
  const totalRowWidth = columns * columnTableWidth + (columns - 1) * COLUMN_GAP_IN;
  const overflowsPage = totalRowWidth > PAGE_USABLE_WIDTH_IN;

  // Two-level chunking: first into physical pages (rowsPerColumn * columns
  // campers each), then each page's slice into `columns` even column-sized
  // groups -- column 1 gets the first rowsPerColumn campers, column 2 the
  // next rowsPerColumn, etc., so reading down column 1 then down column 2
  // still lands in buddy-number order, just like reading a printed
  // newspaper column.
  const perPage = rowsPerColumn * columns;
  const pages: (typeof campers)[] = [];
  for (let i = 0; i < campers.length; i += perPage) {
    pages.push(campers.slice(i, i + perPage));
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Buddy Numbers"
          eyebrow="Waterfront"
          description="Plain reference list — Buddy #, Name, and Cabin, sorted by buddy number. Same list the MAC Swim chart pulls from."
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <Link className={secondaryButtonClass} href={`/admin/buddy-numbers${session ? `?sessionId=${session.id}` : ""}`}>Manage buddy numbers</Link>
          <Link className={secondaryButtonClass} href={`/reports/mac-swim${session ? `?sessionId=${session.id}` : ""}`}>MAC Swim chart</Link>
          <PrintButton label="Print Buddy List" />
        </PageHeader>
      </div>

      {allSessions.length > 1 ? (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-black text-slate-600">Session:</span>
          {allSessions.map((s) => (
            <Link
              key={s.id}
              href={`/reports/buddy-numbers?sessionId=${s.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-black ${session?.id === s.id ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {s.name} — {s.cycle} {s.year}{s.active ? " (active)" : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {session ? (
        <form method="get" className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <input type="hidden" name="sessionId" value={session.id} />
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Columns per page
            <select name="columns" defaultValue={String(columns)} className={`${inputClass} w-24`}>
              {VALID_COLUMN_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Rows per column
            <input type="number" name="rowsPerColumn" defaultValue={rowsPerColumn} min={MIN_ROWS_PER_COLUMN} max={MAX_ROWS_PER_COLUMN} className={`${inputClass} w-24`} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            # width (in)
            <input type="number" name="numWidth" defaultValue={numWidth} min={NUM_WIDTH_BOUNDS.min} max={NUM_WIDTH_BOUNDS.max} step={0.05} className={`${inputClass} w-24`} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Name width (in)
            <input type="number" name="nameWidth" defaultValue={nameWidth} min={NAME_WIDTH_BOUNDS.min} max={NAME_WIDTH_BOUNDS.max} step={0.1} className={`${inputClass} w-24`} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Cabin width (in)
            <input type="number" name="cabinWidth" defaultValue={cabinWidth} min={CABIN_WIDTH_BOUNDS.min} max={CABIN_WIDTH_BOUNDS.max} step={0.05} className={`${inputClass} w-24`} />
          </label>
          <button type="submit" className={secondaryButtonClass}>Update</button>
        </form>
      ) : null}

      {overflowsPage ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {columns} columns at these widths add up to {totalRowWidth.toFixed(2)}in, wider than the {PAGE_USABLE_WIDTH_IN}in a portrait page has to work with — the extra will get cut off at the page edge when printed. Narrow a column or drop to fewer columns.
        </div>
      ) : null}

      {unassignedCount > 0 ? (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {unassignedCount} camper{unassignedCount === 1 ? "" : "s"} in this session {unassignedCount === 1 ? "doesn't" : "don't"} have a buddy number yet and won&apos;t appear below.{" "}
          <Link href={`/admin/buddy-numbers${session ? `?sessionId=${session.id}` : ""}`} className="underline">Generate buddy numbers</Link>
        </div>
      ) : null}

      {!session ? (
        <p className="text-sm text-slate-500">No session available.</p>
      ) : campers.length === 0 ? (
        <p className="text-sm text-slate-500">No campers with buddy numbers yet in {session.name}. Generate buddy numbers first.</p>
      ) : (
        <div className="buddy-list-print-stack">
          {pages.map((pageCampers, pageIndex) => {
            const columnChunks: (typeof campers)[] = [];
            for (let i = 0; i < pageCampers.length; i += rowsPerColumn) {
              columnChunks.push(pageCampers.slice(i, i + rowsPerColumn));
            }
            return (
              <div key={pageIndex} className="buddy-list-page">
                <div className="buddy-list-page-header">
                  <span className="buddy-list-title-main">Buddy Numbers</span>
                  <span className="buddy-list-title-session">{session.name} · {session.year}</span>
                  <span className="buddy-list-title-page">Page {pageIndex + 1} of {pages.length}</span>
                </div>
                <div className="buddy-list-columns" style={{ gridTemplateColumns: `repeat(${columns}, ${columnTableWidth}in)` }}>
                  {columnChunks.map((colCampers, colIndex) => (
                    <table key={colIndex} className="buddy-list-table" style={{ width: `${columnTableWidth}in` }}>
                      <colgroup>
                        <col style={{ width: `${numWidth}in` }} />
                        <col style={{ width: `${nameWidth}in` }} />
                        <col style={{ width: `${cabinWidth}in` }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="buddy-list-col-num">#</th>
                          <th>NAME</th>
                          <th className="buddy-list-col-cabin">CABIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {colCampers.map((camper) => {
                          const displayFirst = camper.nickname?.trim() || camper.firstName;
                          return (
                            <tr key={camper.id}>
                              <td className="buddy-list-col-num">{camper.buddyNumber}</td>
                              <td className="buddy-list-col-name">{displayFirst} {camper.lastName}</td>
                              <td className="buddy-list-col-cabin">{camper.cabin?.name ?? ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
