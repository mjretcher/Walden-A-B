import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";
import { clientIp, consume } from "@/lib/rate-limit";

/**
 * POST /api/auth/login
 *
 * Rate limited to 5 attempts per 15 minutes per source IP. After the
 * limit is reached, returns redirect to /login?error=ratelimit with a
 * Retry-After hint header. This is the only security control on this
 * endpoint besides the bcrypt-style password verification — without it,
 * a script can try thousands of passwords per second against admin
 * accounts.
 *
 * The rate limiter is in-memory (lib/rate-limit.ts) so counters reset
 * on serverless cold starts. For a low-traffic admin app this is an
 * acceptable trade-off; if needed we can swap in Upstash later without
 * touching this file.
 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const gate = consume(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!gate.allowed) {
    const response = NextResponse.redirect(new URL("/login?error=ratelimit", request.url));
    response.headers.set("Retry-After", String(gate.retryAfterSeconds));
    return response;
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = await loginWithPassword(email, password, {
    ip,
    userAgent: request.headers.get("user-agent")
  });

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
