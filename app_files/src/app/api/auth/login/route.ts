import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";
import { clientIp, consume } from "@/lib/rate-limit";

/**
 * POST /api/auth/login
 *
 * Rate limited on two layers:
 *   1. Per-account (email), 5 attempts / 15 minutes — this is the
 *      meaningful limit for normal usage. Camp wifi/networks often put
 *      many staff behind one shared IP (NAT), so limiting by IP alone
 *      meant one person mistyping their password could lock out
 *      everyone else on the same network. Keying by account instead
 *      means a lockout only affects the account that had the failed
 *      attempts.
 *   2. Per-IP, 30 attempts / 15 minutes — a much looser backstop that
 *      only kicks in for real distributed brute-force / credential-
 *      stuffing (many different accounts hammered from one source),
 *      not for ordinary shared-network usage.
 *
 * After a limit is reached, returns redirect to /login?error=ratelimit
 * with a Retry-After hint header.
 *
 * The rate limiter is in-memory (lib/rate-limit.ts) so counters reset
 * on serverless cold starts. For a low-traffic admin app this is an
 * acceptable trade-off; if needed we can swap in Upstash later without
 * touching this file.
 */
const ACCOUNT_LIMIT = 5;
const ACCOUNT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_LIMIT = 30;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  // Loose per-IP backstop against distributed brute force. High enough
  // that normal shared-network usage never trips it.
  const ipGate = consume(`login-ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!ipGate.allowed) {
    const response = NextResponse.redirect(new URL("/login?error=ratelimit", request.url));
    response.headers.set("Retry-After", String(ipGate.retryAfterSeconds));
    return response;
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const normalizedEmail = email.trim().toLowerCase();

  // Per-account limit — this is the one that actually matters for
  // "someone typed their password wrong a bunch of times."
  if (normalizedEmail) {
    const acctGate = consume(`login-acct:${normalizedEmail}`, ACCOUNT_LIMIT, ACCOUNT_WINDOW_MS);
    if (!acctGate.allowed) {
      const response = NextResponse.redirect(new URL("/login?error=ratelimit", request.url));
      response.headers.set("Retry-After", String(acctGate.retryAfterSeconds));
      return response;
    }
  }

  const user = await loginWithPassword(email, password, {
    ip,
    userAgent: request.headers.get("user-agent")
  });

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
