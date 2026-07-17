import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { nextDailySessionCutoff } from "@/lib/auth";

/**
 * Registration Day guest sessions.
 *
 * A guest is NOT a User: joining an active RegistrationEvent with the join
 * code + a typed name creates a RegistrationEventGuest row and sets a signed
 * cookie referencing it. The cookie grants access to exactly the
 * event-registration surface (join/leave, the guest registration page, the
 * shared /api/registration mutations, schedule + offering-count reads) and
 * nothing else — requireUser()/getCurrentUser() never see it.
 *
 * Two independent kill switches on every authenticated request:
 *   1. the cookie's expiresAt (same daily 11:55 PM ET cutoff as user
 *      sessions, via nextDailySessionCutoff), and
 *   2. event.active — closing the event on the admin panel instantly
 *      invalidates every outstanding guest cookie, which is the whole point:
 *      nothing to clean up after the mess hall empties out.
 */

const GUEST_COOKIE = "walden_event_guest";

// Deliberately reuses SESSION_SECRET (same trust domain, one secret to
// manage) but with a distinct signing prefix so a guest token can never be
// replayed as a user session token or vice versa even though the HMAC key
// is shared.
const SIGNING_PREFIX = "event-guest:";

type GuestPayload = {
  guestId: string;
  eventId: string;
  expiresAt: number;
};

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "dev-only-walden-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(SIGNING_PREFIX + value).digest("base64url");
}

function encode(payload: GuestPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token?: string): GuestPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GuestPayload;
    if (!payload.guestId || !payload.eventId || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createGuestSession(guestId: string, eventId: string) {
  const store = await cookies();
  const expiresAt = nextDailySessionCutoff();
  const maxAgeSeconds = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 1000));
  store.set(GUEST_COOKIE, encode({ guestId, eventId, expiresAt: expiresAt.getTime() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  });
}

export async function clearGuestSession() {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}

export type EventGuestContext = {
  guest: { id: string; name: string; eventId: string };
  event: {
    id: string;
    name: string;
    code: string;
    sessionId: string;
    registrationWindow: import("@prisma/client").RegistrationWindow;
  };
};

// How stale lastSeenAt may get before we bother writing a bump. Keeps the
// live "who's on" dashboard fresh without a DB write on every request.
const LAST_SEEN_BUMP_MS = 30_000;

export async function getCurrentEventGuest(): Promise<EventGuestContext | null> {
  const store = await cookies();
  const payload = decode(store.get(GUEST_COOKIE)?.value);
  if (!payload) return null;

  const guest = await prisma.registrationEventGuest.findFirst({
    where: { id: payload.guestId, eventId: payload.eventId, event: { active: true } },
    include: { event: true }
  });
  if (!guest) return null;

  if (Date.now() - guest.lastSeenAt.getTime() > LAST_SEEN_BUMP_MS) {
    // Fire-and-forget freshness bump; never let a failed write break the
    // actual request. (No await on purpose would risk the serverless
    // runtime freezing before it lands, so await but swallow errors.)
    try {
      await prisma.registrationEventGuest.update({ where: { id: guest.id }, data: { lastSeenAt: new Date() } });
    } catch {
      // non-fatal
    }
  }

  return {
    guest: { id: guest.id, name: guest.name, eventId: guest.eventId },
    event: {
      id: guest.event.id,
      name: guest.event.name,
      code: guest.event.code,
      sessionId: guest.event.sessionId,
      registrationWindow: guest.event.registrationWindow
    }
  };
}

// No 0/O/1/I/L — codes get read off a screen across a noisy mess hall.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(length = 6) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeJoinCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
