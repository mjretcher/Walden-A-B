import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { staffingActivityLabel } from "@/lib/staffing-groups";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.EXECUTIVE_ADMIN && user.role !== UserRole.AREA_HEAD)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  const session = await prisma.session.findFirst({ where: { active: true } });
  const staff = session
    ? await prisma.staff.findMany({
        where: { active: true },
        include: {
          assignments: { where: { sessionId: session.id }, include: { offering: { include: { activity: true } } } },
          offPeriods: { where: { sessionId: session.id } }
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    : [];

  const rows = staff.map((person) => {
    const assignments = new Map(person.assignments.map((assignment) => [assignment.period, staffingActivityLabel(assignment.offering.activity.name)]));
    const offPeriods = new Set(person.offPeriods.map((offPeriod) => offPeriod.period));
    return {
      "First name": person.firstName,
      "Last name": person.lastName,
      "Status/certification": person.statusCertification ?? "",
      ...Object.fromEntries(STAFF_PERIODS.map((period) => [PERIOD_LABEL[period], assignments.get(period) ?? (offPeriods.has(period) ? "OFF" : "")]))
    };
  });

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
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

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=staff-ab-schedule.csv"
    }
  });
}
