import QRCode from "qrcode";
import { headers } from "next/headers";
import { RegistrationWindow, UserRole } from "@prisma/client";
import { Printer, QrCode, Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { closeRegistrationEvent, createRegistrationEvent } from "./actions";
import { LiveDashboard } from "./live-dashboard";
import { PrintSigninButton } from "./print-signin-button";

/**
 * Registration Day panel. Exec opens an event (one active at a time), puts
 * the QR + code on the mess-hall screen, and closes it when the room is
 * done. Area Heads get the full live view — QR/code, dashboard, past
 * events — with only the open/close controls held back (event lifecycle
 * writes stay Exec-only per the role hierarchy).
 */
export default async function RegistrationDayPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const isExec = user.role === UserRole.EXECUTIVE_ADMIN;
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
        isExec ? (
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
                      {/* This screen shows the raw Q1/Q2/Q3 tag alongside the
                          label (unlike the shared picker labels, which
                          deliberately dropped the Q vocabulary) because Mike
                          calls this event "Q3 registration" — the tag is how
                          he confirms he's on the right window at a glance. */}
                      <span className="block text-sm font-black text-forest-900">{REGISTRATION_WINDOW_LABEL[window]} <span className="text-slate-500">({window})</span></span>
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
          <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-2 flex items-center gap-2">
              <Radio className="h-5 w-5 text-slate-400" />
              <h2 className="text-sm font-black uppercase tracking-wide text-forest-900">No event live yet</h2>
            </div>
            <p className="text-sm font-semibold text-slate-600">The live dashboard appears here the moment an Exec Admin opens a Registration Day. Keep this page open — it takes over automatically.</p>
          </div>
        )
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-forest-200 bg-white p-5 text-center shadow-panel">
              <div className="mb-1 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-forest-700"><Radio className="h-4 w-4" />Live now</div>
              <h2 className="text-xl font-black text-forest-900">{activeEvent.name}</h2>
              <p className="mt-0.5 text-sm font-semibold text-slate-600">{REGISTRATION_WINDOW_LABEL[activeEvent.registrationWindow]} ({activeEvent.registrationWindow}) • {activeEvent._count.guests} joined</p>
              <div className="mt-4 text-5xl font-black tracking-[0.2em] text-forest-900">{activeEvent.code}</div>
              {qrSvg ? <div className="mx-auto mt-4 w-60 rounded-xl border border-slate-200 p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
              {joinUrl ? <p className="mt-3 break-all text-xs font-semibold text-slate-500">{joinUrl}</p> : null}
              <button
                className="no-print mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-black text-forest-900 hover:bg-slate-50"
                type="button"
                data-print-signin
              >
                <Printer className="h-4 w-4" /> Print sign-in card for the table
              </button>
              {isExec ? (
                <form action={closeRegistrationEvent} className="mt-5">
                  <input name="eventId" type="hidden" value={activeEvent.id} />
                  <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border-2 border-red-600 text-sm font-black text-red-700" type="submit">Close event (ends every guest session)</button>
                </form>
              ) : null}
            </div>
          </div>
          <LiveDashboard />
        </div>
      )}

      {activeEvent ? (
        <>
          <PrintSigninButton />
          <div className="signin-print-card">
            <p className="signin-print-kicker">Camp Walden • {REGISTRATION_WINDOW_LABEL[activeEvent.registrationWindow]}</p>
            <h2 className="signin-print-title">Activity Registration — Sign In</h2>
            <p className="signin-print-instructions">Scan the code below, or go to the address and enter the join code to start registering.</p>
            {qrSvg ? <div className="signin-print-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
            <p className="signin-print-code">{activeEvent.code}</p>
            {joinUrl ? <p className="signin-print-url">{joinUrl}</p> : null}
          </div>
        </>
      ) : null}

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
