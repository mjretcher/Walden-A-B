import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";
import {
  buildStaffOffPeriodsData,
  parsePeriodsParam,
  type StaffOffPeriodMeta,
  type StaffOffPeriodsPerson
} from "@/lib/staff-off-periods-report";

// Same defensive per-user export throttle as the other export routes —
// keeps a scripted client from bulk-scraping staff data via this endpoint.
const EXPORT_LIMIT = 30;
const EXPORT_WINDOW_MS = 60 * 1000;

const A_DAY = new Set(["P1A", "P2A", "P3A", "P4A", "P5A"]);

function periodTitle(meta: StaffOffPeriodMeta): string {
  return `Period ${meta.label}${meta.isTwilight ? " · Twilight" : ""}`;
}

function offPeopleFor(period: string, people: StaffOffPeriodsPerson[]): StaffOffPeriodsPerson[] {
  return people.filter((person) => person.periods.find((entry) => entry.period === period)?.isOff);
}

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

  const data = await buildStaffOffPeriodsData();
  if (!data) {
    return NextResponse.json({ error: "No active session." }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  const selectedPeriods = parsePeriodsParam(request.nextUrl.searchParams.get("periods"));
  const includeGrid = request.nextUrl.searchParams.get("grid") !== "0";
  const selectedMeta = data.periodMeta.filter((meta) => selectedPeriods.includes(meta.period));

  if (format === "docx") {
    const buffer = await buildWordDoc(data.sessionName, selectedMeta, data.people, includeGrid);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=staff-off-periods.docx"
      }
    });
  }

  const workbook = buildWorkbook(data.sessionName, selectedMeta, data.people, includeGrid);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=staff-off-periods.xlsx"
    }
  });
}

function buildWorkbook(
  sessionName: string,
  selectedMeta: StaffOffPeriodMeta[],
  people: StaffOffPeriodsPerson[],
  includeGrid: boolean
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  // Sheet 1 — By Period: one row per off staff member per period, so the
  // sheet is filterable/sortable in Excel (filter Day=A, Period=1A, etc).
  const byPeriodRows: Record<string, string>[] = [];
  for (const meta of selectedMeta) {
    const offPeople = offPeopleFor(meta.period, people);
    if (offPeople.length === 0) {
      byPeriodRows.push({ Day: A_DAY.has(meta.period) ? "A" : "B", Period: meta.label, Time: meta.timeLabel, Staff: "(nobody off)", Area: "" });
      continue;
    }
    for (const person of offPeople) {
      byPeriodRows.push({
        Day: A_DAY.has(meta.period) ? "A" : "B",
        Period: meta.label,
        Time: meta.timeLabel,
        Staff: person.name,
        Area: person.areaName ?? ""
      });
    }
  }
  const byPeriodSheet = XLSX.utils.json_to_sheet(byPeriodRows, { header: ["Day", "Period", "Time", "Staff", "Area"] });
  byPeriodSheet["!cols"] = [{ wch: 6 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, byPeriodSheet, "By Period");

  // Sheet 2 — By Staff grid, columns limited to the selected periods.
  if (includeGrid) {
    const header = ["Staff", "Area", ...selectedMeta.map((meta) => meta.label)];
    const gridRows = people.map((person) => {
      const row: Record<string, string> = { Staff: person.name, Area: person.areaName ?? "" };
      for (const meta of selectedMeta) {
        const entry = person.periods.find((p) => p.period === meta.period);
        row[meta.label] = entry?.isOff ? "OFF" : entry?.assignedActivity ?? "";
      }
      return row;
    });
    const gridSheet = XLSX.utils.json_to_sheet(gridRows, { header });
    gridSheet["!cols"] = header.map((column) => ({ wch: column === "Staff" ? 26 : column === "Area" ? 18 : 14 }));
    XLSX.utils.book_append_sheet(workbook, gridSheet, "By Staff");
  }

  // Excel sheet names cap at 31 chars, so the session name lives in cell
  // metadata territory we don't need — the filename + sheets are enough.
  void sessionName;
  return workbook;
}

async function buildWordDoc(
  sessionName: string,
  selectedMeta: StaffOffPeriodMeta[],
  people: StaffOffPeriodsPerson[],
  includeGrid: boolean
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: `${sessionName} — Staff Off Periods`, bold: true, size: 36 })],
      spacing: { after: 240 }
    })
  ];

  for (const meta of selectedMeta) {
    const offPeople = offPeopleFor(meta.period, people);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `${periodTitle(meta)}${meta.timeLabel ? ` (${meta.timeLabel})` : ""} — ${offPeople.length} off`,
            bold: true,
            size: 26
          })
        ]
      })
    );
    if (offPeople.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Nobody off this period.", italics: true, size: 22 })] }));
    } else {
      for (const person of offPeople) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: `${person.name}${person.areaName ? ` (${person.areaName})` : ""}`, size: 22 })]
          })
        );
      }
    }
  }

  if (includeGrid) {
    const headerRow = new TableRow({
      tableHeader: true,
      children: ["Staff", ...selectedMeta.map((meta) => meta.label)].map(
        (label) =>
          new TableCell({
            shading: { fill: "1B3A2B" },
            children: [
              new Paragraph({
                alignment: label === "Staff" ? AlignmentType.LEFT : AlignmentType.CENTER,
                children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 18 })]
              })
            ]
          })
      )
    });

    const bodyRows = people.map(
      (person) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: person.name, bold: true, size: 16 })] })]
            }),
            ...selectedMeta.map((meta) => {
              const entry = person.periods.find((p) => p.period === meta.period);
              const text = entry?.isOff ? "OFF" : entry?.assignedActivity ?? "";
              return new TableCell({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text, bold: entry?.isOff ?? false, size: 16 })]
                  })
                ]
              });
            })
          ]
        })
    );

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: true,
        spacing: { after: 120 },
        children: [new TextRun({ text: "By Staff", bold: true, size: 26 })]
      }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children
      }
    ]
  });

  return Packer.toBuffer(doc);
}
