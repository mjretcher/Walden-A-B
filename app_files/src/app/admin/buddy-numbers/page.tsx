import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Panel, SectionHeader, StatCard, buttonClass, secondaryButtonClass, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPrintName } from "@/lib/camper-name";
import { listBuddyNumberSessions, getBuddyNumberOverview, generateBuddyNumbers } from "./actions";

export default async function BuddyNumbersPage({
  searchParams
}: {
  searchParams?: Promise<{ sessionId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};

  const allSessions = await listBuddyNumberSessions();
  const targetSessionId = params.sessionId ?? allSessions.find((s) => s.active)?.id ?? allSessions[0]?.id;

  const overview = targetSessionId
    ? await getBuddyNumberOverview(targetSessionId)
    : { session: null, assigned: [], unassigned: [], nextNumber: 1 };

  return (
    <AppShell user={user}>
      <PageHeader
        title="Buddy Numbers"
        eyebrow="Waterfront"
        description="Alphabetical, permanent buddy numbers for the MAC Swim lap chart. Once a camper has a number it never changes — new arrivals just get the next number appended to the end."
        backHref="/reports/mac-swim"
        backLabel="Back to MAC Swim report"
      >
        <Link className={secondaryButtonClass} href="/reports/mac-swim">Open MAC Swim report</Link>
        <Link className={secondaryButtonClass} href={`/reports/buddy-numbers${targetSessionId ? `?sessionId=${targetSessionId}` : ""}`}>Print buddy list</Link>
      </PageHeader>

      {allSessions.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-black text-slate-600">Session:</span>
          {allSessions.map((s) => (
            <Link
              key={s.id}
              href={`/admin/buddy-numbers?sessionId=${s.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-black ${targetSessionId === s.id ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {s.name} — {s.cycle} {s.year}{s.active ? " (active)" : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {!overview.session ? (
        <EmptyState title="No session selected" body="Create a session in Camp Structure first." />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total campers" value={overview.assigned.length + overview.unassigned.length} />
            <StatCard label="Already assigned" value={overview.assigned.length} tone="forest" />
            <StatCard label="Awaiting a number" value={overview.unassigned.length} tone={overview.unassigned.length > 0 ? "warning" : "lake"} />
          </div>

          <Panel className="mb-6">
            <SectionHeader
              title={overview.unassigned.length > 0 ? "Ready to generate" : "All caught up"}
              description={
                overview.unassigned.length > 0
                  ? `${overview.unassigned.length} camper${overview.unassigned.length === 1 ? "" : "s"} will be assigned buddy #${overview.nextNumber}${overview.unassigned.length > 1 ? ` through #${overview.nextNumber + overview.unassigned.length - 1}` : ""}, alphabetically by last name. Existing numbers are never touched.`
                  : "Every camper in this session already has a buddy number. Re-run this any time after new campers are added — it only assigns numbers to the new arrivals, appended to the end."
              }
            >
              {overview.unassigned.length > 0 ? (
                <form action={generateBuddyNumbers}>
                  <input type="hidden" name="sessionId" value={overview.session.id} />
                  <button type="submit" className={buttonClass}>Generate buddy numbers</button>
                </form>
              ) : null}
            </SectionHeader>

            {overview.unassigned.length > 0 ? (
              <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Will become #</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Cabin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.unassigned.map((c, i) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono text-slate-500">{overview.nextNumber + i}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{camperPrintName(c)}</td>
                        <td className="px-3 py-1.5 text-slate-600">{c.cabinName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <SectionHeader title="Current buddy list" description={`${overview.assigned.length} camper${overview.assigned.length === 1 ? "" : "s"} with a permanent buddy number, in order.`} />
            {overview.assigned.length === 0 ? (
              <EmptyState title="No buddy numbers yet" body="Generate the first batch above to get started." />
            ) : (
              <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Buddy #</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Cabin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.assigned.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono font-bold text-forest-800">{c.buddyNumber}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{camperPrintName(c)}</td>
                        <td className="px-3 py-1.5 text-slate-600">{c.cabinName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
