import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

// Per-user export rate limit. Same policy as the staff-schedule export
// route (30/min). Defensive against bulk-scrape exfiltration; legitimate
// human use never approaches this.
const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.EXECUTIVE_ADMIN && user.role !== UserRole.AREA_HEAD)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const gate = consume(`export:${user.id}`, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many exports. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  const areaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : request.nextUrl.searchParams.get("areaId") ?? undefined;
  const session = await prisma.session.findFirst({ where: { active: true } });
  const assignments = session
    ? await prisma.staffAssignment.findMany({
        where: { sessionId: session.id, staff: { active: true }, offering: { ...(areaId ? { areaId } : {}), visibleOnMenu: true } },
        include: { staff: true, offering: { include: { area: true, activity: true } } },
        orderBy: [{ period: "asc" }, { offering: { activity: { name: "asc" } } }]
      })
    : [];

  const rows = assignments
    .sort((left, right) => {
      const periodSort = STAFF_PERIODS.indexOf(left.period) - STAFF_PERIODS.indexOf(right.period);
      if (periodSort !== 0) return periodSort;
      return left.offering.activity.name.localeCompare(right.offering.activity.name);
    })
    .map((assignment) => ({
      Area: assignment.offering.area.name,
      Period: PERIOD_LABEL[assignment.period],
      Activity: assignment.offering.activity.name,
      Assignment: assignment.role ?? "",
      Staff: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
      Notes: assignment.notes ?? ""
    }));

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Area Block Plan");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=area-block-plan.xlsx"
      }
    });
  }

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=area-block-plan.csv"
    }
  });
}
