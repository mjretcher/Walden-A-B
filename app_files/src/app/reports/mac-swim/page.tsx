import Link from "next/link";
import { SessionDayType, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_DAY_COLUMNS = 21;
const MIN_DAY_COLUMNS = 5;
const MAX_DAY_COLUMNS = 40;

// How many campers (2 print rows each) land on one physical printed page.
// Deliberately conservative -- picked so a page's table finishes well
// inside a landscape-letter page even accounting for real browser print
// rendering coming in taller than the CSS math predicts (same lesson
// learned the hard way on Rosters). Each page is now its own complete,
// self-contained <table> with its own header -- see the big comment
// below on why this replaced relying on a repeating <thead>.
const DEFAULT_CAMPERS_PER_PAGE = 14;
const MIN_CAMPERS_PER_PAGE = 5;
const MAX_CAMPERS_PER_PAGE = 30;

// Bookend logistics days don't get lap entries — everything else (A/B
// program days, Sundays, Special, No Classes) is a real camp day the
// waterfront could be running Mac Swim on.
const NON_CAMP_DAY_TYPES: SessionDayType[] = [SessionDayType.ARRIVAL, SessionDayType.DEPARTURE, SessionDayType.REGISTRATION];

type MacSwimSearchParams = { sessionId?: string; days?: string; perPage?: string };

export default async function MacSwimReport({
  searchParams
}: {
  searchParams?: Promise<MacSwimSearchParams>;
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

  const [campers, unassignedCount, camperDayCount] = session
    ? await Promise.all([
        prisma.camper.findMany({
          where: { sessionId: session.id, active: true, buddyNumber: { not: null } },
          select: { id: true, firstName: true, lastName: true, nickname: true, buddyNumber: true, cabin: { select: { name: true } } },
          orderBy: { buddyNumber: "asc" }
        }),
        prisma.camper.count({ where: { sessionId: session.id, active: true, buddyNumber: null } }),
        prisma.sessionCalendarDay.count({ where: { sessionId: session.id, dayType: { notIn: NON_CAMP_DAY_TYPES } } })
      ])
    : [[], 0, 0];

  const requestedDays = params.days ? parseInt(params.days, 10) : NaN;
  const dayColumns = Number.isFinite(requestedDays)
    ? Math.min(MAX_DAY_COLUMNS, Math.max(MIN_DAY_COLUMNS, requestedDays))
    : camperDayCount > 0
      ? Math.min(MAX_DAY_COLUMNS, camperDayCount)
      : DEFAULT_DAY_COLUMNS;

  const requestedPerPage = params.perPage ? parseInt(params.perPage, 10) : NaN;
  const campersPerPage = Number.isFinite(requestedPerPage)
    ? Math.min(MAX_CAMPERS_PER_PAGE, Math.max(MIN_CAMPERS_PER_PAGE, requestedPerPage))
    : DEFAULT_CAMPERS_PER_PAGE;

  // Column widths as percentages of the sheet's total width, so the layout
  // holds regardless of screen size and lands at the same proportions on
  // the printed landscape-letter page. Fixed columns are sized to
  // comfortably fit their header text at print font size (BUDDY #, CABIN,
  // and the DAILY/TOTAL row label were all clipping before -- widened
  // here); the day columns split whatever's left evenly, however many
  // there are.
  const FIXED_COLUMN_PCT = { buddy: 6.0, name: 10.5, cabin: 5.4, rowlabel: 4.6, total: 6.0 };
  const dayColumnPct = (100 - Object.values(FIXED_COLUMN_PCT).reduce((sum, v) => sum + v, 0)) / dayColumns;
  const totalColumns = 4 + dayColumns + 1;

  // Chunk campers into fixed-size pages server-side, rather than one giant
  // continuous table relying on the browser to repeat a <thead> on every
  // printed page. That reliance was the actual bug behind "pages 2+ have
  // no header" -- `display: table-header-group` repeat-on-print support
  // is inconsistent across browsers/PDF renderers, and evidently didn't
  // hold on whatever rendered the sheet Mike printed. Giving every page
  // its own complete, self-contained <table> (own title bar, own column
  // header row) makes every page's header unconditional -- it doesn't
  // depend on any print engine's pagination behavior at all.
  const pages: (typeof campers)[] = [];
  for (let i = 0; i < campers.length; i += campersPerPage) {
    pages.push(campers.slice(i, i + campersPerPage));
  }

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="MAC Swim Record"
          eyebrow="Waterfront"
          description="Printable lap chart, matching the paper form — Buddy #, Name, and Cabin auto-filled from the roster; day columns left blank for handwritten lap counts."
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <Link className={secondaryButtonClass} href={`/admin/buddy-numbers${session ? `?sessionId=${session.id}` : ""}`}>Manage buddy numbers</Link>
          <PrintButton label="Print MAC Swim Chart" />
        </PageHeader>
      </div>

      {allSessions.length > 1 ? (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-black text-slate-600">Session:</span>
          {allSessions.map((s) => (
            <Link
              key={s.id}
              href={`/reports/mac-swim?sessionId=${s.id}`}
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
            Day columns
            <input type="number" name="days" defaultValue={dayColumns} min={MIN_DAY_COLUMNS} max={MAX_DAY_COLUMNS} className={`${inputClass} w-24`} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Campers per page
            <input type="number" name="perPage" defaultValue={campersPerPage} min={MIN_CAMPERS_PER_PAGE} max={MAX_CAMPERS_PER_PAGE} className={`${inputClass} w-24`} />
          </label>
          <button type="submit" className={secondaryButtonClass}>Update</button>
          <span className="pb-2.5 text-xs text-slate-500">
            {camperDayCount > 0 ? `${camperDayCount} camp days found on this session's calendar.` : "No calendar days set for this session yet — adjust manually."}
          </span>
        </form>
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
        <div className="mac-swim-print-stack">
          {pages.map((pageCampers, pageIndex) => (
            <div key={pageIndex} className="mac-swim-page">
              <table className="mac-swim-sheet-table">
                <colgroup>
                  <col style={{ width: `${FIXED_COLUMN_PCT.buddy}%` }} />
                  <col style={{ width: `${FIXED_COLUMN_PCT.name}%` }} />
                  <col style={{ width: `${FIXED_COLUMN_PCT.cabin}%` }} />
                  <col style={{ width: `${FIXED_COLUMN_PCT.rowlabel}%` }} />
                  {Array.from({ length: dayColumns }).map((_, i) => (
                    <col key={i} style={{ width: `${dayColumnPct}%` }} />
                  ))}
                  <col style={{ width: `${FIXED_COLUMN_PCT.total}%` }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="mac-swim-title-row" colSpan={totalColumns}>
                      <div className="mac-swim-title-flex">
                        <span className="mac-swim-title-main">MAC Swim Record</span>
                        <span className="mac-swim-title-session">{session.name} · {session.year}</span>
                        <span className="mac-swim-title-page">Page {pageIndex + 1} of {pages.length}</span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th className="mac-swim-col-buddy">BUDDY #</th>
                    <th className="mac-swim-col-name">NAME</th>
                    <th className="mac-swim-col-cabin">CABIN</th>
                    <th className="mac-swim-col-rowlabel" />
                    <th className="mac-swim-col-day" colSpan={dayColumns} />
                    <th className="mac-swim-col-total">TOTAL</th>
                  </tr>
                </thead>
                {pageCampers.map((camper) => {
                  const displayFirst = camper.nickname?.trim() || camper.firstName;
                  return (
                    <tbody key={camper.id} className="mac-swim-camper-group">
                      <tr>
                        <td className="mac-swim-col-buddy" rowSpan={2}>{camper.buddyNumber}</td>
                        <td className="mac-swim-col-name" rowSpan={2}>{displayFirst}<br />{camper.lastName}</td>
                        <td className="mac-swim-col-cabin" rowSpan={2}>{camper.cabin?.name ?? ""}</td>
                        <td className="mac-swim-col-rowlabel">DAILY</td>
                        {Array.from({ length: dayColumns }).map((_, i) => (
                          <td key={i} className="mac-swim-col-day" />
                        ))}
                        <td className="mac-swim-col-total" rowSpan={2} />
                      </tr>
                      <tr>
                        <td className="mac-swim-col-rowlabel">TOTAL</td>
                        {Array.from({ length: dayColumns }).map((_, i) => (
                          <td key={i} className="mac-swim-col-day" />
                        ))}
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
