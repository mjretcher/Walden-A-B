import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import * as XLSX from "xlsx";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import {
  buildCabinRoster,
  buildCabinRosterFlatRows,
  cabinRosterFlatColumns
} from "@/lib/cabin-roster-export";

// Cabin-centric roster feed for the Kitchen mess-hall seating tool (and any
// other second consumer). Two ways in:
//   1. Machine key  — header `x-api-key: <key>` or `?key=<key>`, compared to
//      the CABIN_ROSTER_EXPORT_KEY env var. This is the cross-app pipe.
//   2. Logged-in Exec Admin / Area Head — same gate as the other exports, so
//      it also works straight from the browser while signed in.
// Fail closed: if CABIN_ROSTER_EXPORT_KEY is unset, key auth is simply
// disabled (no key ever matches) — the endpoint never serves camper data
// unauthenticated.

export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60 * 1000;

function keyMatches(provided: string | null): boolean {
  const expected = process.env.CABIN_ROSTER_EXPORT_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// sessionId= (exact) wins; else session= matches name (contains) or cycle
// (equals), preferring the active/most-recent match; else the active session.
async function resolveSessionId(request: NextRequest): Promise<string | null> {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    const found = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } });
    return found?.id ?? null;
  }

  const text = request.nextUrl.searchParams.get("session");
  if (text) {
    const found = await prisma.session.findFirst({
      where: {
        OR: [
          { name: { contains: text, mode: "insensitive" } },
          { cycle: { equals: text, mode: "insensitive" } }
        ]
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: { id: true }
    });
    return found?.id ?? null;
  }

  const active = await prisma.session.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  return active?.id ?? null;
}

export async function GET(request: NextRequest) {
  const keyOk = keyMatches(request.headers.get("x-api-key") ?? request.nextUrl.searchParams.get("key"));

  let rateKey: string;
  if (keyOk) {
    rateKey = "cabin-roster:key";
  } else {
    const user = await getCurrentUser();
    if (!user || (user.role !== UserRole.EXECUTIVE_ADMIN && user.role !== UserRole.AREA_HEAD)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    rateKey = `cabin-roster:${user.id}`;
  }

  const gate = consume(rateKey, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
    );
  }

  const sessionId = await resolveSessionId(request);
  if (!sessionId) {
    return NextResponse.json({ error: "No matching session (and no active session set)." }, { status: 404 });
  }

  const roster = await buildCabinRoster(sessionId);
  const format = request.nextUrl.searchParams.get("format") ?? "json";

  if (format === "csv" || format === "xlsx") {
    const rows = buildCabinRosterFlatRows(roster);
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...cabinRosterFlatColumns] });
    worksheet["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 12 }];
    const label = (roster.session?.name || roster.session?.cycle || "session").replace(/\s+/g, "-").toLowerCase();

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=cabin-roster-${label}.csv`
        }
      });
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cabin Roster");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=cabin-roster-${label}.xlsx`
      }
    });
  }

  return NextResponse.json(roster, { headers: { "Cache-Control": "no-store" } });
}
