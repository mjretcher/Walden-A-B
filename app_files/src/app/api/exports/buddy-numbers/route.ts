import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * Buddy Numbers list as a formatted .xlsx: title bar, styled header,
 * bordered rows sorted by buddy number — one flat table (not the print
 * view's multi-column page packing) precisely because the point of the
 * export is further manipulation: a flat Buddy # / Name / Cabin table
 * sorts, filters, and mail-merges; a 3-column page layout doesn't.
 * exceljs, not SheetJS, for the same reason as the MAC Swim export —
 * SheetJS CE drops all styling.
 */

const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60 * 1000;

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const ALL_THIN = { top: THIN, left: THIN, bottom: THIN, right: THIN };

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

  const requestedSessionId = request.nextUrl.searchParams.get("sessionId");
  const session = requestedSessionId
    ? await prisma.session.findUnique({ where: { id: requestedSessionId } })
    : await prisma.session.findFirst({ where: { active: true } });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const campers = await prisma.camper.findMany({
    where: { sessionId: session.id, active: true, buddyNumber: { not: null } },
    select: { firstName: true, lastName: true, nickname: true, buddyNumber: true, cabin: { select: { name: true } } },
    orderBy: { buddyNumber: "asc" }
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Walden A/B";
  const sheet = workbook.addWorksheet("Buddy Numbers", {
    pageSetup: {
      orientation: "portrait",
      paperSize: 1, // US Letter
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    },
    views: [{ state: "frozen", ySplit: 2 }]
  });

  const baseFont = { name: "Arial", size: 10 };
  sheet.getColumn(1).width = 10; // Buddy #
  sheet.getColumn(2).width = 30; // Name
  sheet.getColumn(3).width = 14; // Cabin

  sheet.mergeCells(1, 1, 1, 3);
  const title = sheet.getCell(1, 1);
  title.value = `Buddy Numbers — ${session.name} · ${session.year}`;
  title.font = { ...baseFont, size: 14, bold: true };
  title.alignment = { horizontal: "left", vertical: "middle" };
  title.border = ALL_THIN;
  sheet.getRow(1).height = 22;

  const headerRow = sheet.getRow(2);
  headerRow.height = 18;
  ["Buddy #", "Name", "Cabin"].forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { ...baseFont, size: 10, bold: true };
    cell.alignment = { horizontal: index === 0 ? "center" : "left", vertical: "middle" };
    cell.border = ALL_THIN;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  campers.forEach((camper, index) => {
    const row = sheet.getRow(3 + index);
    row.height = 15;
    const displayFirst = camper.nickname?.trim() || camper.firstName;

    const buddyCell = row.getCell(1);
    buddyCell.value = camper.buddyNumber;
    buddyCell.font = { ...baseFont, bold: true };
    buddyCell.alignment = { horizontal: "center", vertical: "middle" };
    buddyCell.border = ALL_THIN;

    const nameCell = row.getCell(2);
    nameCell.value = `${displayFirst} ${camper.lastName}`;
    nameCell.font = baseFont;
    nameCell.alignment = { horizontal: "left", vertical: "middle" };
    nameCell.border = ALL_THIN;

    const cabinCell = row.getCell(3);
    cabinCell.value = camper.cabin?.name ?? "";
    cabinCell.font = baseFont;
    cabinCell.alignment = { horizontal: "left", vertical: "middle" };
    cabinCell.border = ALL_THIN;
  });

  // Filter arrows on the header make the "manipulate it further" case
  // one click away; repeating rows keep printed pages headed.
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + campers.length, column: 3 } };
  sheet.pageSetup.printTitlesRow = "1:2";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `buddy-numbers-${session.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${session.year}.xlsx`;
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}
