import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { computeLiveFingerprint } from "@/lib/live-fingerprint";
import { prisma } from "@/lib/prisma";

/**
 * Live-sync state for the bunk assignment board. The board's client polls
 * this and MERGES other admins' moves into the on-screen board without a
 * page reload — Figma-style, not banner-style. Returns the full
 * (staffId → cabinId) assignment set for the session plus the same
 * fingerprint the StaleDataBanner uses, so the client can tell WHICH kind
 * of change happened: assignment changes get merged silently, while
 * camper/cabin-structure changes (parts the client can't merge, since
 * cabins and camper lists are server-rendered) still fall back to the
 * banner.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = String(searchParams.get("sessionId") ?? "");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });

  const [assignments, fingerprint] = await Promise.all([
    prisma.cabinStaffAssignment.findMany({ where: { sessionId }, select: { staffId: true, cabinId: true } }),
    computeLiveFingerprint("bunk-board", sessionId)
  ]);

  return NextResponse.json({ assignments, fingerprint });
}
