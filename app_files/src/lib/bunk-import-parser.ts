import * as XLSX from "xlsx";

/**
 * Parses the hand-typed "[Boys/Girls] Cabins" workbook format (the exact
 * layout Mike uploads today: a bold+underlined unit title, a thick-bordered
 * box per cabin holding the headcount header + staff/CA names in two
 * columns, then a plain camper grid below it). Validated cell-by-cell
 * against a real production file (openpyxl border/font inspection) before
 * any of this was written -- see BUNK_MANAGEMENT_SPEC.md Section 10 for
 * the exact measurements this is built on.
 *
 * Deliberately camper-only. Staff and CA names in the top block are
 * detected (so they aren't mis-parsed as campers) but never imported --
 * CAs already come from the existing camper-profile pipeline
 * (Camper.counselorAssistant), and real staff cabin assignment is the
 * Assignment Board's job now, not this import's.
 *
 * This is a heuristic parser reading real, hand-formatted spreadsheets --
 * it will not be perfect on every possible variation. It's built to fail
 * SAFE: anything it can't confidently classify is left out of results
 * rather than guessed at, and the diff/preview screen is where a human
 * confirms everything before it's written to the database.
 */

const CABIN_HEADER_RE = /^([A-Za-z0-9-]+)\s*\(([\d+]+)=(\d+)\)$/;
const GRADE_RE = /^\d+(st|nd|rd|th)$/i;
const TAG_RE = /\((CA|UP|UH)\)\s*$/i;
const UNIT_NUMBER_RE = /unit\s*(\d)/i;

export type ParsedCamper = {
  firstName: string;
  lastName: string;
  lateArrival: boolean;
  grade: string | null;
  session: string | null;
  cabinName: string;
  unitNumber: number | null;
};

export type ParsedSkippedEntry = {
  firstName: string;
  lastName: string;
  tag: string; // CA | UP | UH
  cabinName: string;
};

export type ParseResult = {
  campers: ParsedCamper[];
  skipped: ParsedSkippedEntry[]; // staff/CA names found in the top block -- not imported, shown for transparency
  cabinNames: string[]; // every cabin name found, whether or not any campers matched to it
  sheetsParsed: string[];
};

function cellText(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell || cell.v == null) return "";
  return String(cell.v).trim();
}

function classifyTopEntry(raw: string): { firstName: string; lastName: string; tag: string | null; lateArrival: boolean } {
  const tagMatch = raw.match(TAG_RE);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : null;
  const withoutTag = raw.replace(TAG_RE, "").trim();
  const lateArrival = /\*$/.test(withoutTag);
  const cleanName = withoutTag.replace(/\*$/, "").trim();
  const parts = cleanName.split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), tag, lateArrival };
}

/** Parses a single worksheet, tracking the most recent "Unit N" header text seen above each cabin box. */
function parseSheet(ws: XLSX.WorkSheet): { campers: ParsedCamper[]; skipped: ParsedSkippedEntry[]; cabinNames: string[] } {
  const ref = ws["!ref"];
  if (!ref) return { campers: [], skipped: [], cabinNames: [] };
  const range = XLSX.utils.decode_range(ref);

  const campers: ParsedCamper[] = [];
  const skipped: ParsedSkippedEntry[] = [];
  const cabinNames: string[] = [];

  const headers: { row: number; col: number; name: string }[] = [];
  const unitByRow = new Map<number, number | null>();
  let runningUnit: number | null = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellText(ws, r, c);
      if (!v) continue;
      const unitMatch = v.match(UNIT_NUMBER_RE);
      if (unitMatch && /q\d/i.test(v)) runningUnit = Number(unitMatch[1]);
      const headerMatch = v.match(CABIN_HEADER_RE);
      if (headerMatch) headers.push({ row: r, col: c, name: headerMatch[1] });
    }
    unitByRow.set(r, runningUnit);
  }

  // Distinct header rows, ascending -- used to bound how far down each
  // cabin's box+list extends. Cabins sharing a row (side by side, the
  // common case) share the same boundary: the next DISTINCT row a header
  // appears on, not simply "the next header in list order" (which would
  // wrongly cut a cabin off at its own starting row when a neighboring
  // cabin's header sits on that same row).
  const distinctHeaderRows = Array.from(new Set(headers.map((h) => h.row))).sort((a, b) => a - b);

  // Real hand-typed sheets pad shorter cabin boxes with blank rows so
  // side-by-side boxes match height (see BUNK_MANAGEMENT_SPEC.md Section 10
  // -- verified directly against a real file where this caused an early
  // cutoff bug). So a blank row inside a cabin's range must NOT stop
  // parsing -- only reaching the next cabin's header row, or the end of
  // the sheet, should.
  const FOOTNOTE_RE = /^\*|^updated:/i;

  for (const h of headers) {
    cabinNames.push(h.name);
    const unitNumber = unitByRow.get(h.row) ?? null;
    const nextDistinctRow = distinctHeaderRows.find((r) => r > h.row);
    const endRow = nextDistinctRow !== undefined ? nextDistinctRow - 1 : range.e.r;

    for (let row = h.row + 1; row <= endRow; row++) {
      const left = cellText(ws, row, h.col);
      const lastCandidate = cellText(ws, row, h.col + 1);
      const gradeCandidate = cellText(ws, row, h.col + 2);
      const caCol = cellText(ws, row, h.col + 2);

      // Bulk camper-list row: First | Last | Grade | Session
      if (left && lastCandidate && GRADE_RE.test(gradeCandidate)) {
        campers.push({
          firstName: left.replace(/\*$/, ""),
          lastName: lastCandidate,
          lateArrival: /\*$/.test(left),
          grade: gradeCandidate,
          session: cellText(ws, row, h.col + 3) || null,
          cabinName: h.name,
          unitNumber
        });
        continue;
      }

      // Top-block row: name in col (camper or tagged staff/CA), name in col+2 (usually a tagged CA)
      for (const raw of [left, caCol]) {
        if (!raw || FOOTNOTE_RE.test(raw)) continue; // skip blanks and footer notes like "*late arrival" / "Updated: ..."
        if (UNIT_NUMBER_RE.test(raw) && /q\d/i.test(raw)) continue; // skip a neighboring unit's title bleeding into this cabin's (generous) row range
        if (CABIN_HEADER_RE.test(raw)) continue; // safety net: never treat another cabin's header as a camper name
        const parsed = classifyTopEntry(raw);
        if (parsed.tag) {
          skipped.push({ firstName: parsed.firstName, lastName: parsed.lastName, tag: parsed.tag, cabinName: h.name });
        } else if (parsed.firstName) {
          campers.push({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            lateArrival: parsed.lateArrival,
            grade: null,
            session: null,
            cabinName: h.name,
            unitNumber
          });
        }
      }
    }
  }

  return { campers, skipped, cabinNames };
}

export function parseCabinWorkbook(buffer: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Prefer a sheet literally called "Master List" (case-insensitive) since
  // it already contains every unit in one place -- falls back to scanning
  // every sheet and de-duplicating by cabin name otherwise (first
  // occurrence wins), so a workbook of only per-unit tabs still works.
  const masterSheetName = wb.SheetNames.find((name) => name.trim().toLowerCase() === "master list");
  const sheetsToParse = masterSheetName ? [masterSheetName] : wb.SheetNames;

  const campers: ParsedCamper[] = [];
  const skipped: ParsedSkippedEntry[] = [];
  const seenCabinNames = new Set<string>();
  const seenCamperKeys = new Set<string>();

  for (const sheetName of sheetsToParse) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const result = parseSheet(ws);
    for (const name of result.cabinNames) seenCabinNames.add(name);
    for (const camper of result.campers) {
      const key = `${camper.cabinName}|${camper.firstName.toLowerCase()}|${camper.lastName.toLowerCase()}`;
      if (seenCamperKeys.has(key)) continue; // de-dupe in case a camper legitimately appears on both Master List and a Unit tab
      seenCamperKeys.add(key);
      campers.push(camper);
    }
    skipped.push(...result.skipped);
  }

  return {
    campers,
    skipped,
    cabinNames: Array.from(seenCabinNames).sort(),
    sheetsParsed: sheetsToParse
  };
}
