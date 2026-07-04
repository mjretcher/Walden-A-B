import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Cheap polling endpoint for the Scream Session board. Returns the most
 * recent of: latest staff-assignment/off-period updatedAt, and the
 * session's lastStaffingChangeAt (bumped explicitly whenever assignments
 * are deleted — deleting rows doesn't touch any remaining row's updatedAt,
 * so without this a pure removal would be invisible here). Deliberately not
 * driving the board itself — see ScreamSessionFreshnessBanner, which shows a
 * "refresh to see the latest" prompt instead of forcing a refresh, so it
 * never yanks the board out from under someone mid-edit.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = String(searchParams.get("sessionId") ?? "");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });

  const [session, latestAssignment, latestOffPeriod] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId }, select: { lastStaffingChangeAt: true } }),
    prisma.staffAssignment.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.staffOffPeriod.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
  ]);

  const timestamps = [session?.lastStaffingChangeAt, latestAssignment?.updatedAt, latestOffPeriod?.updatedAt].filter(Boolean) as Date[];
  const latest = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString() : null;

  return NextResponse.json({ latest });
}
