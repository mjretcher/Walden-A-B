import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { computeLiveFingerprint, LIVE_SCOPES, type LiveScope } from "@/lib/live-fingerprint";

/**
 * Cheap polling endpoint behind the shared StaleDataBanner. Returns an
 * opaque fingerprint string for a scope + session — the client only ever
 * compares it for equality against the one baked into the page at render
 * time, so the shape can evolve freely (see lib/live-fingerprint.ts).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get("scope") ?? "");
  const sessionId = String(searchParams.get("sessionId") ?? "");
  if (!sessionId || !LIVE_SCOPES.includes(scope as LiveScope)) {
    return NextResponse.json({ error: "Missing or invalid scope/sessionId." }, { status: 400 });
  }

  const fingerprint = await computeLiveFingerprint(scope as LiveScope, sessionId);
  return NextResponse.json({ fingerprint });
}
