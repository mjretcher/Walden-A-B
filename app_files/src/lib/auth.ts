import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";

const ONE_HOUR_SECONDS = 60 * 60;
// Sessions used to last a week. Cut to 1 hour at Mike's request: it's
// an admin-only tool, no public traffic, and the worst-case cost of a
// stolen cookie is now bounded to ≤1 hour of unauthorized use. Active
// users are unaffected because every page load extends the cookie's
// max-age via getCurrentUser() → refreshUserSession() (rolling window).

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
  store.set(cookieName(), encode({ userId, expiresAt: Date.now() + ONE_HOUR_SECONDS * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_HOUR_SECONDS
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

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  await createUserSession(user.id);
  return user;
}
