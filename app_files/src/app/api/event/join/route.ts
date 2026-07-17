import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGuestSession, normalizeJoinCode } from "@/lib/event-auth";
import { clientIp, consume } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

/**
 * Public (unauthenticated) join for a Registration Day event: code + typed
 * name → guest session cookie. Rate-limited by IP since this is the only
 * unauthenticated mutation surface besides login. 20/min is generous enough
 * for a whole cabin table sharing one camp-wifi NAT'd IP while still
 * shutting down code-guessing.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rate = consume(`event-join:${ip}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: `Too many attempts — try again in ${rate.retryAfterSeconds}s.` }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = normalizeJoinCode(String(body.code ?? ""));
  const name = String(body.name ?? "").trim().slice(0, 60);

  if (!code) return NextResponse.json({ error: "Enter the join code." }, { status: 422 });
  if (name.length < 2) return NextResponse.json({ error: "Enter your name so registrations can be attributed to you." }, { status: 422 });

  const event = await prisma.registrationEvent.findFirst({ where: { code, active: true } });
  if (!event) {
    logAudit({
      action: "event.join.fail",
      actorId: null,
      targetType: "eventCode",
      targetId: code,
      ip,
      userAgent: request.headers.get("user-agent"),
      metadata: { name }
    });
    return NextResponse.json({ error: "That code doesn't match an open Registration Day. Check the screen and try again." }, { status: 404 });
  }

  const guest = await prisma.registrationEventGuest.create({
    data: {
      eventId: event.id,
      name,
      userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null
    }
  });

  await createGuestSession(guest.id, event.id);

  logAudit({
    action: "event.join.success",
    actorId: null,
    targetType: "registrationEventGuest",
    targetId: guest.id,
    ip,
    userAgent: request.headers.get("user-agent"),
    metadata: { eventId: event.id, eventName: event.name, guestName: name }
  });

  return NextResponse.json({ ok: true, eventName: event.name, guestName: name });
}
