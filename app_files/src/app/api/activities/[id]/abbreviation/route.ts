import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Caps the abbreviation length; 8 covers everything the live schedule needs
// (SUP, GAGA, GROUP, etc.) and prevents accidental novel-length entries.
const MAX_LEN = 8;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const raw = typeof body.abbreviation === "string" ? body.abbreviation.trim() : "";
  if (raw.length > MAX_LEN) {
    return NextResponse.json({ error: `Abbreviation must be ${MAX_LEN} characters or fewer.` }, { status: 422 });
  }

  const activity = await prisma.activity.findUnique({ where: { id }, select: { id: true } });
  if (!activity) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  await prisma.activity.update({
    where: { id },
    data: { abbreviation: raw || null }
  });

  // Invalidate the surfaces that read the abbreviation so the next visit
  // shows the new value. /reports/staff-schedule is the big one.
  for (const path of ["/admin/structure", "/reports/staff-schedule", "/scream-session", "/dashboard"]) {
    revalidatePath(path);
  }

  return NextResponse.json({ ok: true, abbreviation: raw || null });
}
