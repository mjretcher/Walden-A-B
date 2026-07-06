import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Persists which staff member is currently pulled up on the live Scream
 * Session board, so the Staff Schedule live view (typically a second,
 * projected screen the room is watching) can highlight the matching row —
 * "bring attention to the person I'm on" without anyone needing to hunt
 * for them in an alphabetical list. Called from ScreamSessionBoard
 * whenever the active staff selection changes (Previous/Next, search, or
 * clicking someone in the Staff Queue).
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const body = await request.json();
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });

  // staffId is nullable — clearing it (e.g. leaving the board) means no
  // row should be highlighted anywhere.
  const staffId = typeof body.staffId === "string" && body.staffId.trim() ? body.staffId.trim() : null;

  await prisma.session.updateMany({
    where: { id: sessionId },
    data: { currentScreamStaffId: staffId }
  });

  return NextResponse.json({ ok: true });
}
