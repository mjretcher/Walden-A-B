import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Single row per camper here (no DAILY/TOTAL pair like MAC Swim), so a lot
// more fit on one portrait page. Same lesson learned on MAC Swim applies
// though: don't rely on a repeating <thead> to carry the header onto every
// printed page -- support for that is inconsistent across browsers/PDF
// renderers. Every page here is its own self-contained table instead.
const DEFAULT_ROWS_PER_PAGE = 45;
const MIN_ROWS_PER_PAGE = 10;
const MAX_ROWS_PER_PAGE = 80;

type BuddyNumbersSearchParams = { sessionId?: string; rowsPerPage?: string };

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

  const requestedRowsPerPage = params.rowsPerPage ? parseInt(params.rowsPerPage, 10) : NaN;
  const rowsPerPage = Number.isFinite(requestedRowsPerPage)
    ? Math.min(MAX_ROWS_PER_PAGE, Math.max(MIN_ROWS_PER_PAGE, requestedRowsPerPage))
    : DEFAULT_ROWS_PER_PAGE;

  const pages: (typeof campers)[] = [];
  for (let i = 0; i < campers.length; i += rowsPerPage) {
    pages.push(campers.slice(i, i + rowsPerPage));
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
            Rows per page
            <input type="number" name="rowsPerPage" defaultValue={rowsPerPage} min={MIN_ROWS_PER_PAGE} max={MAX_ROWS_PER_PAGE} className={`${inputClass} w-24`} />
          </label>
          <button type="submit" className={secondaryButtonClass}>Update</button>
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
        <div className="buddy-list-print-stack">
          {pages.map((pageCampers, pageIndex) => (
            <div key={pageIndex} className="buddy-list-page">
              <table className="buddy-list-table">
                <thead>
                  <tr>
                    <th className="buddy-list-title-row" colSpan={3}>
                      <div className="buddy-list-title-flex">
                        <span className="buddy-list-title-main">Buddy Numbers</span>
                        <span className="buddy-list-title-session">{session.name} · {session.year}</span>
                        <span className="buddy-list-title-page">Page {pageIndex + 1} of {pages.length}</span>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th className="buddy-list-col-num">BUDDY #</th>
                    <th className="buddy-list-col-name">NAME</th>
                    <th className="buddy-list-col-cabin">CABIN</th>
                  </tr>
                </thead>
                <tbody>
                  {pageCampers.map((camper) => {
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
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
