import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { SessionDayType, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * MAC Swim Record as a REAL formatted .xlsx — borders, merges, fonts —
 * mirroring the printable form at /reports/mac-swim exactly: Buddy # /
 * Name / Cabin / DAILY+TOTAL row-label pairs / blank day columns / TOTAL,
 * two rows per camper with the identity cells merged vertically.
 *
 * Built with exceljs, NOT the xlsx (SheetJS) package the other exports
 * use — the SheetJS community build silently drops all cell styling
 * (borders, fills, merges render as plain data), which is precisely the
 * complaint this export exists to fix. Day-column headers are left as
 * individual blank bordered cells (not one merged header like the web
 * <thead>) deliberately: on the paper form dates get handwritten there,
 * and in Excel people will want to type dates into those header cells —
 * a merged cell would block that.
 */

const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60 * 1000;

const DEFAULT_DAY_COLUMNS = 21;
const MIN_DAY_COLUMNS = 5;
const MAX_DAY_COLUMNS = 40;

const NON_CAMP_DAY_TYPES: SessionDayType[] = [SessionDayType.ARRIVAL, SessionDayType.DEPARTURE, SessionDayType.REGISTRATION];

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const MEDIUM = { style: "medium" as const, color: { argb: "FF000000" } };
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

  const [campers, camperDayCount] = await Promise.all([
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true, buddyNumber: { not: null } },
      select: { firstName: true, lastName: true, nickname: true, buddyNumber: true, cabin: { select: { name: true } } },
      orderBy: { buddyNumber: "asc" }
    }),
    prisma.sessionCalendarDay.count({ where: { sessionId: session.id, dayType: { notIn: NON_CAMP_DAY_TYPES } } })
  ]);

  // Same day-column resolution as the report page: explicit ?days= wins,
  // else the session calendar's real camp-day count, else the default.
  const requestedDays = parseInt(request.nextUrl.searchParams.get("days") ?? "", 10);
  const dayColumns = Number.isFinite(requestedDays)
    ? Math.min(MAX_DAY_COLUMNS, Math.max(MIN_DAY_COLUMNS, requestedDays))
    : camperDayCount > 0
      ? Math.min(MAX_DAY_COLUMNS, camperDayCount)
      : DEFAULT_DAY_COLUMNS;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Walden A/B";
  const sheet = workbook.addWorksheet("MAC Swim", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 1, // US Letter
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    },
    views: [{ state: "frozen", ySplit: 2 }]
  });

  // Columns: A buddy, B name, C cabin, D row label, E.. days, last = TOTAL
  const totalColumnCount = 4 + dayColumns + 1;
  const totalColumnIndex = totalColumnCount;
  sheet.getColumn(1).width = 9; // BUDDY #
  sheet.getColumn(2).width = 16; // NAME
  sheet.getColumn(3).width = 9; // CABIN
  sheet.getColumn(4).width = 8; // DAILY/TOTAL label
  for (let index = 0; index < dayColumns; index += 1) sheet.getColumn(5 + index).width = 4.5;
  sheet.getColumn(totalColumnIndex).width = 9;

  const baseFont = { name: "Arial", size: 10 };

  // Row 1: title bar merged across the full width.
  sheet.mergeCells(1, 1, 1, totalColumnCount);
  const title = sheet.getCell(1, 1);
  title.value = `MAC Swim Record — ${session.name} · ${session.year}`;
  title.font = { ...baseFont, size: 14, bold: true };
  title.alignment = { horizontal: "left", vertical: "middle" };
  title.border = ALL_THIN;
  sheet.getRow(1).height = 22;

  // Row 2: column headers. Day cells stay blank (dates get filled in).
  const headerRow = sheet.getRow(2);
  headerRow.height = 18;
  const headerValues: Record<number, string> = { 1: "BUDDY #", 2: "NAME", 3: "CABIN", [totalColumnIndex]: "TOTAL" };
  for (let column = 1; column <= totalColumnCount; column += 1) {
    const cell = headerRow.getCell(column);
    cell.value = headerValues[column] ?? "";
    cell.font = { ...baseFont, size: 9, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = ALL_THIN;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  }

  // Two rows per camper; identity + TOTAL cells merged vertically, exactly
  // like the rowSpan=2 cells on the web/print version.
  let rowIndex = 3;
  for (const camper of campers) {
    const topRow = rowIndex;
    const bottomRow = rowIndex + 1;
    const displayFirst = camper.nickname?.trim() || camper.firstName;

    sheet.mergeCells(topRow, 1, bottomRow, 1);
    sheet.mergeCells(topRow, 2, bottomRow, 2);
    sheet.mergeCells(topRow, 3, bottomRow, 3);
    sheet.mergeCells(topRow, totalColumnIndex, bottomRow, totalColumnIndex);

    const buddyCell = sheet.getCell(topRow, 1);
    buddyCell.value = camper.buddyNumber;
    buddyCell.font = { ...baseFont, bold: true };

    const nameCell = sheet.getCell(topRow, 2);
    nameCell.value = `${displayFirst}\n${camper.lastName}`;
    nameCell.font = baseFont;
    nameCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    const cabinCell = sheet.getCell(topRow, 3);
    cabinCell.value = camper.cabin?.name ?? "";
    cabinCell.font = baseFont;

    const dailyLabel = sheet.getCell(topRow, 4);
    dailyLabel.value = "DAILY";
    const totalLabel = sheet.getCell(bottomRow, 4);
    totalLabel.value = "TOTAL";
    [dailyLabel, totalLabel].forEach((cell) => {
      cell.font = { ...baseFont, size: 8, bold: true };
    });

    // Border + center every cell in the pair of rows (including the blank
    // day cells — the grid IS the form). The camper group's outer edge
    // gets a medium border so each two-row block reads as one unit, same
    // visual weight the printed form carries.
    //
    // Merged columns (buddy/name/cabin/total) are special-cased: exceljs
    // aliases a merged range's slave cells to the master's style object,
    // so writing "row 4's" border on a cell merged across rows 3-4
    // actually OVERWRITES row 3's — verified by generating and reading
    // back a workbook. They get one border spec (medium top AND bottom,
    // the block's outer edges) applied once; the shared style makes the
    // slave cell carry the same spec, which is exactly what draws the
    // merged region's bottom edge.
    const isMergedColumn = (column: number) => column <= 3 || column === totalColumnIndex;
    for (const currentRow of [topRow, bottomRow]) {
      for (let column = 1; column <= totalColumnCount; column += 1) {
        if (isMergedColumn(column)) continue;
        const cell = sheet.getCell(currentRow, column);
        if (!cell.alignment) cell.alignment = { horizontal: "center", vertical: "middle" };
        if (!cell.font) cell.font = baseFont;
        cell.border = {
          top: currentRow === topRow ? MEDIUM : THIN,
          bottom: currentRow === bottomRow ? MEDIUM : THIN,
          left: THIN,
          right: column === totalColumnCount ? MEDIUM : THIN
        };
      }
    }
    for (const column of [1, 2, 3, totalColumnIndex]) {
      const cell = sheet.getCell(topRow, column);
      if (!cell.alignment) cell.alignment = { horizontal: "center", vertical: "middle" };
      if (!cell.font) cell.font = baseFont;
      cell.border = {
        top: MEDIUM,
        bottom: MEDIUM,
        left: column === 1 ? MEDIUM : THIN,
        right: column === totalColumnIndex ? MEDIUM : THIN
      };
    }

    sheet.getRow(topRow).height = 15;
    sheet.getRow(bottomRow).height = 15;
    rowIndex += 2;
  }

  // Repeat the header rows at the top of every printed page.
  sheet.pageSetup.printTitlesRow = "1:2";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `mac-swim-${session.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${session.year}.xlsx`;
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}
