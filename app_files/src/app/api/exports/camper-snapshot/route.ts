import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * TEMPORARY one-off endpoint — read-only snapshot of active-session
 * campers for an offline cross-reference task (S2 bunk list diff).
 * Gated by a single-use random token; this route will be deleted in
 * the immediately following commit once the snapshot has been pulled.
 * Never writes anything.
 */

const ONE_OFF_TOKEN = "563f5b7719ad43596cc1fb4e325c780b00a58257b30be8ea";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token !== ONE_OFF_TOKEN) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) {
    return NextResponse.json({ error: "No active session." }, { status: 404 });
  }

  const campers = await prisma.camper.findMany({
    where: { sessionId: session.id },
    select: {
      firstName: true,
      lastName: true,
      nickname: true,
      gender: true,
      campGrade: true,
      active: true,
      status: true,
      counselorAssistant: true,
      cabin: { select: { name: true } },
      sessionDesignations: { select: { label: true } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  return NextResponse.json({
    session: { id: session.id, name: session.name },
    count: campers.length,
    campers: campers.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      nickname: c.nickname,
      gender: c.gender,
      campGrade: c.campGrade,
      active: c.active,
      status: c.status,
      ca: c.counselorAssistant,
      cabin: c.cabin?.name ?? null,
      designations: c.sessionDesignations.map((d) => d.label)
    }))
  });
}
