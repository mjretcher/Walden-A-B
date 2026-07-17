import { NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentEventGuest } from "@/lib/event-auth";
import { prisma } from "@/lib/prisma";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

/**
 * Lightweight seat-count refresh for the event registration screen. With
 * 25-30 people registering at once, counts a guest loaded 30 seconds ago
 * are already stale — the client calls this after every save and on an
 * interval so "12/16" pills stay honest. Guests get counts for their
 * event's locked window; logged-in users can pass ?window=.
 */
export async function GET(request: Request) {
  const guestCtx = await getCurrentEventGuest();
  const user = guestCtx ? null : await getCurrentUser();
  if (!guestCtx && !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return NextResponse.json({ counts: [] });

  let registrationWindow = guestCtx?.event.registrationWindow;
  if (!registrationWindow) {
    const { parseRegistrationWindow, inferCurrentRegistrationWindow } = await import("@/lib/registration-windows");
    const { searchParams } = new URL(request.url);
    registrationWindow = parseRegistrationWindow(searchParams.get("window"), inferCurrentRegistrationWindow(session));
  }

  const grouped = await prisma.registration.groupBy({
    by: ["offeringId"],
    where: {
      sessionId: session.id,
      registrationWindow,
      registrationRole: RegistrationRole.CAMPER,
      status: { in: activeRegistration }
    },
    _count: { _all: true }
  });

  return NextResponse.json({
    counts: grouped.map((row) => ({ offeringId: row.offeringId, count: row._count._all }))
  });
}
