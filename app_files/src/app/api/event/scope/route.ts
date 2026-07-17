import { NextResponse } from "next/server";
import { getCurrentEventGuest } from "@/lib/event-auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * Lets an event guest change their own view scope mid-event: area plus,
 * optionally, specific activities within it (e.g. Waterfront → only SUP +
 * Ski/Tube). Pure view preference — the shared /api/registration endpoint
 * never restricts by it — so guests editing their own scope needs no
 * approval. Activity ids are validated against the chosen area's active
 * activities; anything else is dropped rather than erroring, and an empty
 * result means "all activities in the area".
 */
export async function POST(request: Request) {
  const guestCtx = await getCurrentEventGuest();
  if (!guestCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const requestedAreaId = String(body.areaId ?? "").trim();
  const requestedActivityIds = Array.isArray(body.activityIds) ? body.activityIds.map(String) : [];

  let areaId: string | null = null;
  let areaName: string | null = null;
  let activityIds: string[] = [];

  if (requestedAreaId) {
    const area = await prisma.area.findFirst({
      where: { id: requestedAreaId, active: true },
      select: { id: true, name: true, activities: { where: { active: true }, select: { id: true } } }
    });
    if (!area) return NextResponse.json({ error: "That area no longer exists." }, { status: 404 });
    areaId = area.id;
    areaName = area.name;
    const validIds = new Set(area.activities.map((activity) => activity.id));
    activityIds = Array.from(new Set(requestedActivityIds.filter((id) => validIds.has(id))));
    // Selecting every activity is the same as selecting none — store the
    // simpler form so "scoped" always means "narrower than the area".
    if (activityIds.length === validIds.size) activityIds = [];
  }

  await prisma.registrationEventGuest.update({
    where: { id: guestCtx.guest.id },
    data: { areaId, activityIds: activityIds.length ? JSON.stringify(activityIds) : null }
  });

  logAudit({
    action: "event.guest.scope_set",
    actorId: null,
    targetType: "registrationEventGuest",
    targetId: guestCtx.guest.id,
    metadata: { guestName: guestCtx.guest.name, areaName, activityCount: activityIds.length || null }
  });

  return NextResponse.json({ ok: true, areaId, areaName, activityIds });
}
