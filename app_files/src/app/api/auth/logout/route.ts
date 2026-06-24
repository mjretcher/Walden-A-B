import { NextRequest, NextResponse } from "next/server";
import { clearUserSession, getCurrentUser } from "@/lib/auth";
import { logAudit, requestContext } from "@/lib/audit";

export async function POST(request: NextRequest) {
  // Capture who's logging out before we clear the cookie. If the cookie
  // is already gone, the audit row will record action='logout' with a
  // null actor — still useful for spotting weird logout patterns.
  const user = await getCurrentUser();
  const { ip, userAgent } = requestContext(request);

  await clearUserSession();

  logAudit({
    action: "logout",
    actorId: user?.id ?? null,
    ip,
    userAgent
  });

  return NextResponse.redirect(new URL("/login", request.url));
}
