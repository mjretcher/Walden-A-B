import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Gender, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";

// Sessions expire once a day, at a fixed 11:55 PM America/New_York cutoff,
// rather than on any rolling/idle timer. There is deliberately no "extend
// on activity" logic: a session that used to be described as a 1-hour
// rolling window (renewed on every request via a getCurrentUser() ->
// refreshUserSession() call) never actually had that refresh function
// implemented anywhere in this file — it only existed in a comment — so in
// practice every session hard-expired exactly 1 hour after login
// regardless of activity, logging people out mid-task. A fixed daily
// cutoff is simpler and does what was actually wanted: everyone is signed
// out once a day at a predictable time, and otherwise a login just lasts
// until then.
const SESSION_TIME_ZONE = "America/New_York";
const DAILY_CUTOFF_HOUR = 23;
const DAILY_CUTOFF_MINUTE = 55;

// Converts a wall-clock date/time as read in `SESSION_TIME_ZONE` into the
// actual UTC instant it represents. Handles DST correctly (EST vs EDT)
// without pulling in a timezone library: format an initial guess back
// through the same timezone, measure how far off it landed, and correct by
// that difference. New York's offset doesn't change over the few hours
// this could be off by, so one correction pass is exact.
function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(guess);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  // Midnight can format as hour "24" in this API; normalize to 0.
  const readAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"));
  return new Date(guess.getTime() + (guess.getTime() - readAsUtc));
}

function nyDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function nextDailySessionCutoff(from: Date = new Date()): Date {
  const today = nyDateParts(from);
  const todayCutoff = zonedWallTimeToUtc(today.year, today.month, today.day, DAILY_CUTOFF_HOUR, DAILY_CUTOFF_MINUTE);
  if (todayCutoff.getTime() > from.getTime()) return todayCutoff;
  // Already past today's cutoff (or logging in in the last few minutes
  // before it) — the next one is tomorrow. Step forward a day in NY wall
  // time, not by adding 24h of UTC, so this is correct across DST changes.
  const tomorrow = nyDateParts(new Date(todayCutoff.getTime() + 20 * 60 * 60 * 1000));
  return zonedWallTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, DAILY_CUTOFF_HOUR, DAILY_CUTOFF_MINUTE);
}

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function cookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "walden_session";
}

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "dev-only-walden-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createUserSession(userId: string) {
  const store = await cookies();
  const expiresAt = nextDailySessionCutoff();
  const maxAgeSeconds = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 1000));
  store.set(cookieName(), encode({ userId, expiresAt: expiresAt.getTime() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  });
}

export async function clearUserSession() {
  const store = await cookies();
  store.delete(cookieName());
}

export async function getCurrentUser() {
  const store = await cookies();
  const payload = decode(store.get(cookieName())?.value);
  if (!payload) return null;

  return prisma.user.findFirst({
    where: { id: payload.userId, active: true },
    include: { area: true }
  });
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles?.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

/**
 * Bunk Management access is a different shape than every other section:
 * EXECUTIVE_ADMIN gets full read/write everywhere, and the Girls Side Head
 * / Boys Side Head accounts get read-only access scoped to their gender via
 * `bunkManagementView` -- a permission axis independent of role/areaId (see
 * schema comment on User.bunkManagementView). Everyone else, including
 * ordinary AREA_HEAD accounts, gets no access at all.
 *
 * `mode: "write"` (the default) requires EXECUTIVE_ADMIN. `mode: "read"`
 * additionally allows a Side Head whose `bunkManagementView` is set --
 * callers doing gender-scoped reads should check `user.role ===
 * UserRole.EXECUTIVE_ADMIN ? requestedGender : user.bunkManagementView`
 * themselves, since only the caller knows which gender was requested.
 */
export async function requireBunkManagementAccess(mode: "read" | "write" = "write") {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === UserRole.EXECUTIVE_ADMIN) return user;
  if (mode === "read" && user.bunkManagementView) return user;
  redirect("/dashboard");
}

export function bunkManagementReadableGenders(user: { role: UserRole; bunkManagementView: Gender | null }): Gender[] | "all" {
  if (user.role === UserRole.EXECUTIVE_ADMIN) return "all";
  return user.bunkManagementView ? [user.bunkManagementView] : [];
}

export async function loginWithPassword(
  email: string,
  password: string,
  // Optional request context for audit logging. Callers from API routes
  // pass IP + user-agent so the audit row is informative; callers from
  // tests can omit it.
  ctx?: { ip?: string | null; userAgent?: string | null }
) {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    // Failed login is one of the highest-value security signals — log
    // every miss with the attempted email so brute-force / credential-
    // stuffing attempts show up in the audit trail.
    logAudit({
      action: "login.fail",
      actorId: null,
      targetType: "email",
      targetId: normalizedEmail,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: { reason: !user ? "no_user" : !user.active ? "inactive" : "bad_password" }
    });
    return null;
  }

  await createUserSession(user.id);
  logAudit({
    action: "login.success",
    actorId: user.id,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null
  });
  return user;
}
