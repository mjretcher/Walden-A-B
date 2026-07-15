import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Period, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { STAFF_PERIODS, TWILIGHT_PERIODS } from "@/lib/periods";
import { buildStaffPeriodCabinRows, staffPeriodCabinColumns } from "@/lib/staff-period-cabin-export";

// Same per-user rate limit as the Staff A/B Schedule export.
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

  const requested = request.nextUrl.searchParams.getAll("period").filter((value): value is Period => (STAFF_PERIODS as string[]).includes(value));
  const periods: Period[] = requested.length ? requested : TWILIGHT_PERIODS;
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  const filenameBase = `staff-${periods.join("-").toLowerCase()}`;

  const rows = await buildStaffPeriodCabinRows(periods);

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: [...staffPeriodCabinColumns] }));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filenameBase}.csv`
      }
    });
  }

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...staffPeriodCabinColumns] });
  worksheet["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 22 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Staff & Cabins");
  const data = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filenameBase}.xlsx`
    }
  });
}
