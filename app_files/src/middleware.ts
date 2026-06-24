import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin enforcement for state-changing requests (CSRF defense).
 *
 * Browsers send the Origin header on every cross-origin request (and on
 * same-origin POSTs as well). If the Origin doesn't match this site's
 * own origin, the request was almost certainly initiated by a malicious
 * page in someone's other tab — reject it.
 *
 * Why this is needed even though session cookies are sameSite=lax:
 *   sameSite=lax already blocks classic CSRF over XHR/fetch, but it
 *   does NOT block top-level form POSTs from third-party sites — the
 *   browser still attaches the session cookie in that case. An
 *   attacker's hosted form can submit to our /api/* mutation routes
 *   with the victim's session attached, and the role check will pass.
 *   The Origin header is the canonical fix.
 *
 * What this checks:
 *   - Method is POST / PUT / PATCH / DELETE (state-changing)
 *   - AND the request is to /api/* (server route)
 *   - AND Origin (or Referer) is NOT this site's own origin
 *   → reject with 403
 *
 * What this deliberately does NOT block:
 *   - Server Actions, which Next.js already CSRF-protects internally.
 *   - GET requests of any kind (idempotent by HTTP semantics).
 *   - Same-origin requests (the normal case for every legitimate
 *     interaction from the app's own UI).
 *   - The login endpoint, which has its own rate limiter as the
 *     dominant control and which can legitimately be hit from
 *     password managers and similar tools that may strip headers.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Routes that need to remain accessible from non-browser tooling
// (or where origin checks would create more problems than they solve).
const ORIGIN_CHECK_EXEMPT = [
  "/api/auth/login",
  "/api/auth/logout"
];

function isExempt(pathname: string): boolean {
  return ORIGIN_CHECK_EXEMPT.some((exempt) => pathname === exempt);
}

function extractRequestOrigin(request: NextRequest): string | null {
  // Origin is the canonical signal; it's sent by browsers on every
  // cross-origin request and on same-origin POSTs. Referer is a fallback
  // for environments that strip Origin (older clients, some proxies).
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Malformed Referer — treat as no origin info available.
      return null;
    }
  }
  return null;
}

function selfOrigin(request: NextRequest): string {
  // Build the origin the server expects, from the URL the request hit.
  return new URL(request.url).origin;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only screen API mutations. Server Actions, pages, static assets,
  // and GET requests bypass this entirely.
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (!MUTATING_METHODS.has(request.method)) return NextResponse.next();
  if (isExempt(pathname)) return NextResponse.next();

  const requestOrigin = extractRequestOrigin(request);
  const expectedOrigin = selfOrigin(request);

  if (!requestOrigin) {
    // No Origin AND no Referer on a mutation is unusual for a real
    // browser. Block it — a legitimate same-origin form post from this
    // app's UI will always carry one of the two.
    return NextResponse.json(
      { error: "Missing Origin / Referer header on mutation request." },
      { status: 403 }
    );
  }

  if (requestOrigin !== expectedOrigin) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

// Apply the middleware only to /api/* paths so static assets and pages
// aren't slowed by an unnecessary function invocation.
export const config = {
  matcher: ["/api/:path*"]
};
