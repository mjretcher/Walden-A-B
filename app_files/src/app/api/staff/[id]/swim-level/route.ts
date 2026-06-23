import { NextRequest, NextResponse } from "next/server";
import { SwimLevel, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_LEVELS = new Set<string>(Object.values(SwimLevel));

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  // Accept either a SwimLevel string or null/empty to clear.
  const raw = typeof body.swimLevel === "string" ? body.swimLevel.trim().toUpperCase() : "";
  const swimLevel = raw && VALID_LEVELS.has(raw) ? (raw as SwimLevel) : null;
  if (raw && !swimLevel) {
    return NextResponse.json({ error: `Invalid swim level "${raw}".` }, { status: 422 });
  }

  const staff = await prisma.staff.findUnique({ where: { id } });
  if (!staff) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  await prisma.staff.update({
    where: { id },
    data: { swimLevel }
  });

  return NextResponse.json({ ok: true, swimLevel });
}
