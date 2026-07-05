import { AutoSubmitForm } from "@/components/auto-submit-form";
import { RegistrationStatus, UserRole } from "@prisma/client";
import { CalendarDays, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { camperPrintName } from "@/lib/camper-name";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { sessionColorClasses } from "@/lib/session-colors";

/**
 * Waitlists are intentionally kept even after a session ends (nothing here
 * ever deletes them) specifically so this page can answer "who did we turn
 * away from X last time?" when planning capacity for a future session — pick
 * any past session below to see its waitlist history, independent of
 * whichever session is currently active/being built.
 */
export default async function WaitlistsReportPage({ searchParams }: { searchParams?: Promise<{ sessionId?: string }> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const allSessions = await prisma.session.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, year: true, color: true, active: true }
  });

  const requestedSession = params.sessionId ? allSessions.find((s) => s.id === params.sessionId) : null;
  const session = requestedSession ?? allSessions.find((s) => s.active) ?? allSessions[0] ?? null;

  const waitlisted = session
    ? await prisma.registration.findMany({
        where: { status: RegistrationStatus.WAITLISTED, sessionId: session.id, ...(user.role === UserRole.AREA_HEAD ? { offering: { areaId: user.areaId ?? undefined } } : {}) },
        include: {
          camper: { include: { cabin: true } },
          offering: { include: { activity: true, area: true } }
        },
        orderBy: [{ offering: { area: { name: "asc" } } }, { offeringId: "asc" }, { waitlistPosition: "asc" }]
      })
    : [];

  const groups = new Map<string, { activity: string; area: string; period: string; window: string; entries: typeof waitlisted }>();
  for (const entry of waitlisted) {
    const key = `${entry.offeringId}:${entry.registrationWindow}`;
    if (!groups.has(key)) {
      groups.set(key, {
        activity: entry.offering.activity.name,
        area: entry.offering.area.name,
        period: PERIOD_LABEL[entry.offering.period],
        window: REGISTRATION_WINDOW_LABEL[entry.registrationWindow],
        entries: []
      });
    }
    groups.get(key)!.entries.push(entry);
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Waitlists"
        eyebrow="Registration"
        description="Everyone currently waitlisted for a full class, plus history for past sessions — useful when deciding whether to add capacity next time."
      />

      {allSessions.length > 1 && (
        <AutoSubmitForm className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <span className="text-sm font-black text-forest-900">Session</span>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="sessionId" defaultValue={session?.id}>
            {allSessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — Summer {s.year}{s.active ? " (active)" : ""}</option>
            ))}
          </select>
        </AutoSubmitForm>
      )}

      {session && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-black ${sessionColorClasses(session.color).chip} ${sessionColorClasses(session.color).chipText}`}>
            <CalendarDays className="h-4 w-4" />
            {session.name} — Summer {session.year}
          </span>
          <Badge>{waitlisted.length} camper{waitlisted.length === 1 ? "" : "s"} waitlisted</Badge>
        </div>
      )}

      {!session ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">No sessions exist yet.</div>
      ) : groups.size === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
          Nobody is waitlisted for {session.name}. Waitlists only fill up when a class with waitlisting turned on (set in Menu Builder) is full.
        </div>
      ) : (
        <div className="grid gap-4">
          {Array.from(groups.values()).map((group) => (
            <div key={`${group.activity}-${group.period}-${group.window}`} className="rounded-xl border border-white bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-lake-700">{group.area} • {group.period} • {group.window}</p>
                  <h2 className="text-lg font-black text-forest-900">{group.activity}</h2>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-black text-amber-800">
                  <ClipboardList className="h-4 w-4" />
                  {group.entries.length} waiting
                </span>
              </div>
              <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {group.entries.map((entry, index) => (
                  <li key={entry.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    <span>{entry.waitlistPosition ?? index + 1}. {camperPrintName(entry.camper)}</span>
                    <span className="text-xs font-medium text-slate-400">{entry.camper.cabin?.name ?? "No cabin"}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
