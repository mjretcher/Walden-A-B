import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { buildStaffScheduleRows, staffScheduleColumns } from "@/lib/staff-schedule-report";

// Per-user export rate limit. Defensive against scripted bulk-export
// exfiltration: a malicious authenticated user can't repeatedly hit
// this endpoint to scrape the camper roster. 30/min is generous — real
// human use is typically a handful per day.
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
  const { rows } = await buildStaffScheduleRows();

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...staffScheduleColumns] });
    worksheet["!cols"] = staffScheduleColumns.map((column) => ({ wch: column.includes("Period") ? 18 : 22 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Staff AB Schedule");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=staff-ab-schedule.xlsx"
      }
    });
  }

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: [...staffScheduleColumns] }));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=staff-ab-schedule.csv"
    }
  });
}
