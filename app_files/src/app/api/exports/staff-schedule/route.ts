import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { buildStaffScheduleRows, staffScheduleColumns } from "@/lib/staff-schedule-report";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.EXECUTIVE_ADMIN && user.role !== UserRole.AREA_HEAD)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
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
