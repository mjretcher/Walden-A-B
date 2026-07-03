import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Cheap polling endpoint for the Scream Session board. Returns the most
 * recent updatedAt across staff assignments and off-periods for a session,
 * so the client can detect "someone else changed this board" without
 * re-fetching (or re-rendering) the whole board on a timer. Deliberately not
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

  const [latestAssignment, latestOffPeriod] = await Promise.all([
    prisma.staffAssignment.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.staffOffPeriod.findFirst({ where: { sessionId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
  ]);

  const timestamps = [latestAssignment?.updatedAt, latestOffPeriod?.updatedAt].filter(Boolean) as Date[];
  const latest = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString() : null;

  return NextResponse.json({ latest });
}
