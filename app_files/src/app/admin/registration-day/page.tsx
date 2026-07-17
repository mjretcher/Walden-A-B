import QRCode from "qrcode";
import { headers } from "next/headers";
import { RegistrationWindow, UserRole } from "@prisma/client";
import { QrCode, Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { closeRegistrationEvent, createRegistrationEvent } from "./actions";
import { LiveDashboard } from "./live-dashboard";

/**
 * Exec control panel for Registration Day: open an event (one active at a
 * time), put the QR + code on the mess-hall screen, watch the live
 * dashboard, close it when the room is done. Closing instantly invalidates
 * every guest session.
 */
export default async function RegistrationDayPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });

  const [activeEvent, pastEvents] = await Promise.all([
    prisma.registrationEvent.findFirst({
      where: { active: true },
      include: { _count: { select: { guests: true } } }
    }),
    prisma.registrationEvent.findMany({
      where: { active: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { guests: true } } }
    })
  ]);

  // Build the join URL from the request host (works for prod and previews),
  // preferring APP_BASE_URL when set — same precedence the camper QR route
  // uses.
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "walden-a-b.vercel.app";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const baseUrl = process.env.APP_BASE_URL ?? `${proto}://${host}`;
  const joinUrl = activeEvent ? `${baseUrl}/join?code=${activeEvent.code}` : null;
  const qrSvg = joinUrl
    ? await QRCode.toString(joinUrl, { type: "svg", margin: 1, width: 240, color: { dark: "#1f5336", light: "#ffffff" } })
    : null;

  // Hard default: Registration Day is the Session 2 (Q3) mess-hall event,
  // full stop — always pre-select Q3 rather than inferring from the active
  // session's name (per Mike). The picker stays so a different window can
  // still be chosen deliberately, but nothing is inferred.
  const defaultWindow = RegistrationWindow.Q3;

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-forest-900">Registration Day</h1>
          <p className="mt-1 text-base text-slate-600">Open a join code, put the QR on the screen, and watch registrations roll in live.</p>
        </div>
        <Badge tone="green">{session ? `${session.name} • ${session.year}` : "No active session"}</Badge>
      </div>

      {!activeEvent ? (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
          <div className="mb-3 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-lake-700" />
            <h2 className="text-sm font-black uppercase tracking-wide text-forest-900">Open a Registration Day</h2>
          </div>
          <form action={createRegistrationEvent} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-700" htmlFor="event-name">Event name</label>
              <input className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-lake-500" defaultValue={session ? `${session.name} Registration` : "Registration Day"} id="event-name" maxLength={80} name="name" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-black text-slate-700">Registration window (locked for every guest)</span>
              <div className="space-y-2">
                {Object.values(RegistrationWindow).map((window) => (
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3" key={window}>
                    <input className="h-4 w-4" defaultChecked={window === defaultWindow} name="window" type="radio" value={window} />
                    <span>
                      <span className="block text-sm font-black text-forest-900">{REGISTRATION_WINDOW_LABEL[window]}</span>
                      <span className="block text-xs font-semibold text-slate-600">{REGISTRATION_WINDOW_DESCRIPTION[window]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-lake-600 text-base font-black text-white" disabled={!session} type="submit">Open Registration Day</button>
          </form>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-forest-200 bg-white p-5 text-center shadow-panel">
              <div className="mb-1 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-forest-700"><Radio className="h-4 w-4" />Live now</div>
              <h2 className="text-xl font-black text-forest-900">{activeEvent.name}</h2>
              <p className="mt-0.5 text-sm font-semibold text-slate-600">{REGISTRATION_WINDOW_LABEL[activeEvent.registrationWindow]} • {activeEvent._count.guests} joined</p>
              <div className="mt-4 text-5xl font-black tracking-[0.2em] text-forest-900">{activeEvent.code}</div>
              {qrSvg ? <div className="mx-auto mt-4 w-60 rounded-xl border border-slate-200 p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
              {joinUrl ? <p className="mt-3 break-all text-xs font-semibold text-slate-500">{joinUrl}</p> : null}
              <form action={closeRegistrationEvent} className="mt-5">
                <input name="eventId" type="hidden" value={activeEvent.id} />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-red-600 text-sm font-black text-red-700" type="submit">Close event (ends every guest session)</button>
              </form>
            </div>
          </div>
          <LiveDashboard />
        </div>
      )}

      {pastEvents.length ? (
        <div className="mt-8 max-w-xl">
          <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-700">Past events</h2>
          <div className="space-y-2">
            {pastEvents.map((event) => (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm" key={event.id}>
                <div>
                  <span className="font-black text-forest-900">{event.name}</span>
                  <span className="ml-2 font-semibold text-slate-500">{REGISTRATION_WINDOW_LABEL[event.registrationWindow]} • code {event.code}</span>
                </div>
                <span className="font-semibold text-slate-600">{event._count.guests} guests</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
