import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BuddyNumbersClient } from "./buddy-numbers-client";

type BuddyNumbersSearchParams = { sessionId?: string };

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
        <BuddyNumbersClient
          campers={campers.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            nickname: c.nickname,
            buddyNumber: c.buddyNumber,
            cabinName: c.cabin?.name ?? null
          }))}
          sessionName={session.name}
          sessionYear={session.year}
        />
      )}
    </AppShell>
  );
}
