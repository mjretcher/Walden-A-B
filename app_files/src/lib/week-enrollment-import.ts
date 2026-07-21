import { Prisma, PrismaClient, WeekBlock } from "@prisma/client";
import * as XLSX from "xlsx";

/**
 * Imports camper week enrollments from the CampMinder "Enrolled Child
 * Sessions" report (xlsx). The main camper import derives week blocks from
 * per-week bunk columns (wk12BBunk etc.); this report doesn't have those —
 * it encodes the stay as a session-name string. The operational point is
 * departure: who leaves after Weeks 5-6 vs. stays through Wk 7, which
 * drives the leave labels on rosters and the week lines on registration
 * cards.
 *
 * Session-string -> week-block mapping (confirmed by Mike, Jul 2026):
 *   Second Session                          -> Wk5-6 + Wk7
 *   Two weeks Second Session                -> Wk5-6 only (leaves after wk6)
 *   Two weeks Second Session and Weeks 3-4  -> Wk3-4 + Wk5-6
 *   Full Season                             -> Wk1-2 + Wk3-4 + Wk5-6 + Wk7
 *   Five Weeks, 3-7                         -> Wk3-4 + Wk5-6 + Wk7
 *   Six Weeks, 1-6                          -> Wk1-2 + Wk3-4 + Wk5-6
 *   25CA_* variants (CAs)                   -> same as the non-CA equivalent
 */

const ALL_BLOCKS: WeekBlock[] = [WeekBlock.WK1_2, WeekBlock.WK3_4, WeekBlock.WK5_6, WeekBlock.WK7];

export function weekBlocksForSessionLabel(raw: string): WeekBlock[] | null {
  // CA enrollments come prefixed like "25CA_FIVE WEEKS" — same stay shape.
  const value = raw.trim().toLowerCase().replace(/^\d{2}ca_/, "").replace(/\s+/g, " ");
  if (!value) return null;
  if (value.includes("full season")) return ALL_BLOCKS;
  if (value.includes("six weeks")) return [WeekBlock.WK1_2, WeekBlock.WK3_4, WeekBlock.WK5_6];
  if (value.includes("five weeks")) return [WeekBlock.WK3_4, WeekBlock.WK5_6, WeekBlock.WK7];
  // Check the longer "two weeks ... and weeks 3-4" variant before the
  // plain two-week and plain second-session strings it contains.
  if (value.includes("two weeks second session") && value.includes("3-4")) return [WeekBlock.WK3_4, WeekBlock.WK5_6];
  if (value.includes("two weeks second session")) return [WeekBlock.WK5_6];
  if (value.includes("second session")) return [WeekBlock.WK5_6, WeekBlock.WK7];
  return null;
}

type ParsedRow = {
  firstName: string;
  lastName: string;
  sessionLabel: string;
  blocks: WeekBlock[] | null;
  bunkName: string | null;
};

function headerIndex(header: string[], predicate: (h: string) => boolean): number {
  return header.findIndex((h) => predicate(h.trim().toLowerCase()));
}

export function parseWeekEnrollmentWorkbook(buffer: Buffer): { rows: ParsedRow[]; error?: string } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], error: "No sheets found in the file." };
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!raw.length) return { rows: [], error: "The sheet is empty." };

  const header = (raw[0] as unknown[]).map((cell) => String(cell ?? ""));
  const firstIdx = headerIndex(header, (h) => h === "first name");
  const lastIdx = headerIndex(header, (h) => h === "last name");
  const sessionIdx = headerIndex(header, (h) => h.includes("enrolled") && h.includes("session"));
  // Any "Wk...Bunk" column supplies the bunk name (this report carries the
  // Wk5-6 bunk; a fuller export may carry more — first non-empty wins).
  const bunkIdxs = header
    .map((h, i) => (/^wk.*bunk$/i.test(h.trim()) ? i : -1))
    .filter((i) => i >= 0);

  if (firstIdx < 0 || lastIdx < 0) return { rows: [], error: "Missing 'First Name' / 'Last Name' columns." };
  if (sessionIdx < 0) return { rows: [], error: "Missing 'Enrolled Child Sessions' column." };

  const rows: ParsedRow[] = [];
  for (const cells of raw.slice(1)) {
    const firstName = String(cells[firstIdx] ?? "").trim();
    const lastName = String(cells[lastIdx] ?? "").trim();
    if (!firstName && !lastName) continue;
    const sessionLabel = String(cells[sessionIdx] ?? "").trim();
    const bunkName = bunkIdxs.map((i) => String(cells[i] ?? "").trim()).find(Boolean) ?? null;
    rows.push({ firstName, lastName, sessionLabel, blocks: weekBlocksForSessionLabel(sessionLabel), bunkName });
  }
  return { rows };
}

export type WeekEnrollmentImportResult = {
  sessionName: string | null;
  totalRows: number;
  matched: number;
  applied: number;
  weeksCreated: number;
  unmatched: string[];
  ambiguous: string[];
  unknownSessionLabels: string[];
  committed: boolean;
};

export async function runWeekEnrollmentImport(
  prisma: PrismaClient,
  buffer: Buffer,
  commit: boolean
): Promise<WeekEnrollmentImportResult | { error: string }> {
  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) return { error: "No active session." };

  const { rows, error } = parseWeekEnrollmentWorkbook(buffer);
  if (error) return { error };

  const campers = await prisma.camper.findMany({
    where: { sessionId: session.id, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true, cabin: { select: { id: true, name: true } } }
  });
  const cabins = await prisma.cabin.findMany({ select: { id: true, name: true } });
  const cabinByName = new Map(cabins.map((cabin) => [cabin.name.trim().toLowerCase(), cabin]));

  const key = (first: string, last: string) => `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
  const byName = new Map<string, string[]>();
  for (const camper of campers) {
    for (const first of new Set([camper.firstName, camper.nickname ?? ""].filter(Boolean))) {
      const k = key(first, camper.lastName);
      byName.set(k, [...(byName.get(k) ?? []), camper.id]);
    }
  }
  const camperById = new Map(campers.map((camper) => [camper.id, camper]));

  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const unknownSessionLabels = new Set<string>();
  const plans: { camperId: string; blocks: WeekBlock[]; bunkName: string | null }[] = [];

  for (const row of rows) {
    if (!row.blocks) {
      if (row.sessionLabel) unknownSessionLabels.add(row.sessionLabel);
      continue;
    }
    const ids = [...new Set(byName.get(key(row.firstName, row.lastName)) ?? [])];
    if (ids.length === 0) {
      unmatched.push(`${row.firstName} ${row.lastName}`);
      continue;
    }
    if (ids.length > 1) {
      ambiguous.push(`${row.firstName} ${row.lastName}`);
      continue;
    }
    plans.push({ camperId: ids[0], blocks: row.blocks, bunkName: row.bunkName });
  }

  let weeksCreated = 0;
  if (commit && plans.length) {
    // Replace-then-create per camper, chunked into transactions so a
    // mid-run failure can't leave one camper half-written.
    const chunkSize = 25;
    for (let i = 0; i < plans.length; i += chunkSize) {
      const chunk = plans.slice(i, i + chunkSize);
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      for (const plan of chunk) {
        const camper = camperById.get(plan.camperId)!;
        const bunkName = plan.bunkName || camper.cabin?.name || null;
        const cabin = bunkName ? cabinByName.get(bunkName.trim().toLowerCase()) ?? null : null;
        ops.push(prisma.camperWeekEnrollment.deleteMany({ where: { camperId: plan.camperId, sessionId: session.id } }));
        ops.push(
          prisma.camperWeekEnrollment.createMany({
            data: plan.blocks.map((weekBlock) => ({
              camperId: plan.camperId,
              sessionId: session.id,
              weekBlock,
              cabinId: cabin?.id ?? null,
              cabinName: bunkName
            }))
          })
        );
        weeksCreated += plan.blocks.length;
      }
      await prisma.$transaction(ops);
    }
  } else {
    weeksCreated = plans.reduce((sum, plan) => sum + plan.blocks.length, 0);
  }

  return {
    sessionName: session.name,
    totalRows: rows.length,
    matched: plans.length + ambiguous.length,
    applied: plans.length,
    weeksCreated,
    unmatched,
    ambiguous,
    unknownSessionLabels: [...unknownSessionLabels],
    committed: commit
  };
}
