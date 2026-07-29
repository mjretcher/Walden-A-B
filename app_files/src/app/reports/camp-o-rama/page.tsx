// @ts-nocheck
import { Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPrintName } from "@/lib/camper-name";
import { formatGeneratedAt } from "@/lib/camp-time";
import { UNIT_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { departureNote } from "@/lib/week-enrollment";

/**
 * CAMP-O-RAMA CARDS.
 *
 * A one-night program for the campers who are still here in Week 7. Each
 * camper gets a card with their name and cabin already printed; they hand-
 * write their own Shift 1 and Shift 2 activity picks. Nothing on this page
 * writes anything -- there is no Camp-O-Rama model, no registrations, no
 * roster. It is a print surface over the existing camper table, so it
 * cannot affect class registration or bunk data in any way.
 *
 * WHO PRINTS: same "stays through Week 7" rule as the bunk print's Week 7
 * mode, the area sheets and the roster footers -- departureNote() === null,
 * with week rows scoped to the active session. A camper carrying NO
 * current-session week rows counts as STAYING, which is the safe direction
 * (an unclassified camper gets a card rather than being left out and having
 * nothing to hand in). That count is surfaced on screen rather than hidden.
 */
type SearchParams = {
  unit?: string | string[];
  perPage?: string | string[];
  cas?: string | string[];
  blanks?: string | string[];
};

const PER_PAGE_OPTIONS = [4, 6, 8] as const;
const BLANK_OPTIONS = [0, 5, 10, 20] as const;

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CampORamaPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const unitParam = firstParam(params.unit) ?? "all";
  const selectedUnit = Object.values(Unit).includes(unitParam as Unit) ? (unitParam as Unit) : null;
  const perPageRaw = Number(firstParam(params.perPage) ?? 6);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw) ? perPageRaw : 6;
  // CAs are Camper records who help run programs rather than sign up for
  // them, so they're off by default -- but this is a judgement call about
  // how the program director wants to run the night, so it's a toggle and
  // not a hard rule.
  const includeCas = firstParam(params.cas) === "1";
  const blanksRaw = Number(firstParam(params.blanks) ?? 0);
  const blankCount = (BLANK_OPTIONS as readonly number[]).includes(blanksRaw) ? blanksRaw : 0;

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true }
  });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader
          title="Camp-O-Rama Cards"
          eyebrow="Reports"
          description="No active session."
          backHref="/reports"
          backLabel="Back to Reports"
        />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  const campers = await prisma.camper.findMany({
    where: {
      sessionId: session.id,
      active: true,
      ...(includeCas ? {} : { counselorAssistant: false }),
      ...(selectedUnit ? { unit: selectedUnit } : {})
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      unit: true,
      counselorAssistant: true,
      cabin: { select: { name: true } },
      // sessionId scope matches rosters/page.tsx and the bunk print: a
      // returning camper's prior-session week rows must not decide whether
      // they're here for Week 7.
      weekEnrollments: { where: { sessionId: session.id }, select: { weekBlock: true }, orderBy: { weekBlock: "asc" as const } }
    },
    orderBy: [{ unit: "asc" }, { lastName: "asc" }, { firstName: "asc" }]
  });

  const staying = campers.filter((camper) => departureNote(camper.weekEnrollments) === null);
  const departingCount = campers.length - staying.length;
  const noWeekDataCount = staying.filter((camper) => camper.weekEnrollments.length === 0).length;

  // Cabin order first so a stack of printed cards can be split by cabin
  // without re-sorting by hand; blank-cabin campers fall to the end.
  const cards = [...staying].sort((a, b) => {
    const cabinA = a.cabin?.name ?? "\uffff";
    const cabinB = b.cabin?.name ?? "\uffff";
    if (cabinA !== cabinB) return cabinA.localeCompare(cabinB, undefined, { numeric: true, sensitivity: "base" });
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  });

  type CardItem = { key: string; name: string | null; cabin: string | null; isCa: boolean };
  const items: CardItem[] = cards.map((camper) => ({
    key: camper.id,
    name: camperPrintName(camper),
    cabin: camper.cabin?.name ?? null,
    isCa: camper.counselorAssistant
  }));
  // Spare cards with the name/cabin lines left blank, for late adds and
  // anyone whose card goes missing between dinner and the program.
  for (let i = 0; i < blankCount; i += 1) {
    items.push({ key: `blank-${i}`, name: null, cabin: null, isCa: false });
  }

  const pages: CardItem[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));

  const generatedAt = formatGeneratedAt();
  const unitLabel = selectedUnit ? UNIT_LABEL[selectedUnit] ?? selectedUnit : "All units";

  const renderCard = (item: CardItem) => (
    <div key={item.key} className="corama-card">
      <div className="corama-card__head">
        <p className="corama-card__title">CAMP-O-RAMA</p>
        <p className="corama-card__sub">{session.cycle} {session.year} &middot; One Night Only</p>
      </div>

      <div className="corama-card__field">
        <span className="corama-card__label">NAME</span>
        <span className="corama-card__value">{item.name ?? ""}</span>
      </div>
      <div className="corama-card__field">
        <span className="corama-card__label">CABIN</span>
        <span className="corama-card__value">{item.cabin ?? ""}</span>
      </div>

      <div className="corama-card__picks">
        <div className="corama-card__field corama-card__field--pick">
          <span className="corama-card__label">SHIFT 1</span>
          <span className="corama-card__value" />
        </div>
        <div className="corama-card__field corama-card__field--pick">
          <span className="corama-card__label">SHIFT 2</span>
          <span className="corama-card__value" />
        </div>
      </div>
    </div>
  );

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Camp-O-Rama Cards"
          eyebrow={`Reports · ${session.cycle} ${session.year}`}
          description="Pre-filled name and cabin for every camper here in Week 7. Shift 1 and Shift 2 are left blank for campers to fill in by hand."
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <PrintButton label="Print / Save PDF" pageOrientation="portrait" />
        </PageHeader>

        <AutoSubmitForm action="/reports/camp-o-rama" className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Unit</span>
              <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="unit" defaultValue={selectedUnit ?? "all"}>
                <option value="all">All units</option>
                {Object.values(Unit).map((unit) => (
                  <option key={unit} value={unit}>{UNIT_LABEL[unit] ?? unit}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Cards per page</span>
              <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="perPage" defaultValue={String(perPage)}>
                {PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} per page</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">Spare blank cards</span>
              <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="blanks" defaultValue={String(blankCount)}>
                {BLANK_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option === 0 ? "None" : `${option} blanks`}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name="cas" value="1" defaultChecked={includeCas} className="h-4 w-4" />
              <span className="text-sm font-semibold text-slate-700">Include CAs</span>
            </label>

            <div className="flex items-center gap-3 pb-1">
              <span className="text-sm font-black text-forest-900">{items.length} card{items.length !== 1 ? "s" : ""}</span>
              <a className={secondaryButtonClass} href="/reports/camp-o-rama">Reset</a>
            </div>
          </div>
        </AutoSubmitForm>

        <div className="mb-5 rounded-lg border border-lake-300 bg-lake-50 p-4 text-sm text-slate-800">
          <p className="font-black">
            {cards.length} Week 7 camper{cards.length !== 1 ? "s" : ""} ({unitLabel}
            {includeCas ? ", CAs included" : ", CAs excluded"})
            {blankCount > 0 ? ` + ${blankCount} spare blank card${blankCount !== 1 ? "s" : ""}` : ""}.
          </p>
          <p className="mt-1">
            {departingCount} camper{departingCount !== 1 ? "s" : ""} going home before Week 7 {departingCount === 1 ? "was" : "were"} left out.
            {noWeekDataCount > 0 ? (
              <> {noWeekDataCount} camper{noWeekDataCount !== 1 ? "s have" : " has"} no week enrollment on record and {noWeekDataCount !== 1 ? "were" : "was"} included &mdash; missing data counts as staying, so nobody is dropped by accident.</>
            ) : null}
          </p>
          <p className="mt-1 text-slate-600">Printing changes nothing &mdash; this page only reads camper names and cabins.</p>
        </div>
      </div>

      <div className={`corama-sheet corama-per-${perPage}`}>
        {pages.map((page, pageIndex) => (
          // Block-level page wrapper: WebKit ignores break-after on flex and
          // grid CHILDREN, so the page container must be a plain block and
          // the cards inside it inline-blocks (which no engine will slice).
          <div key={pageIndex} className="corama-page">
            {page.map(renderCard)}
            <p className="corama-page__footer">
              Camp-O-Rama &middot; {session.cycle} {session.year} &middot; page {pageIndex + 1} of {pages.length} &middot; Generated {generatedAt}
            </p>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No Week 7 campers match these filters.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
