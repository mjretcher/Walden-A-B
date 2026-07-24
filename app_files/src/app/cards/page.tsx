// @ts-nocheck
import { Gender, Period, RegistrationRole, RegistrationStatus, RegistrationWindow, Unit, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, secondaryButtonClass } from "@/components/ui";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { SubmitButton } from "@/components/confirm-submit-button";
import { markCardsReprinted } from "./actions";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { camperPrintName } from "@/lib/camper-name";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, UNIT_LABEL } from "@/lib/periods";
import { inferCurrentRegistrationWindow, parseRegistrationWindow, REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { seedCardReprintResolution } from "@/lib/roster-reprint";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const leftPeriods = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
const rightPeriods = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];

type CardsSearchParams = {
  unit?: string | string[];
  cabin?: string | string[];
  window?: string | string[];
  medical?: string | string[];
  group?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
  cardsPerPage?: string | string[];
  qr?: string | string[];
  // Single-card reprint: `q` is a name search, `camper` pins exact campers.
  q?: string | string[];
  camper?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function isUnit(value?: string): value is Unit {
  return !!value && Object.values(Unit).includes(value as Unit);
}

function genderShort(gender: Gender): string {
  if (gender === Gender.FEMALE) return "Girls";
  if (gender === Gender.MALE) return "Boys";
  return "Other";
}

// Plain-English stay summary for the card: "Wks 5-7" instead of raw
// per-block bunk pairs, plus a departure flag when the camper leaves
// before Wk 7 — the glanceable bit staff need in the final week.
const WEEK_SPAN: Record<string, { start: number; end: number }> = {
  WK1_2: { start: 1, end: 2 },
  WK3_4: { start: 3, end: 4 },
  WK5_6: { start: 5, end: 6 },
  WK7: { start: 7, end: 7 }
};

function staySummary(weekEnrollments: { weekBlock: string }[]): { label: string; leavesAfter: number | null } | null {
  const spans = weekEnrollments.map((week) => WEEK_SPAN[week.weekBlock]).filter(Boolean);
  if (!spans.length) return null;
  const start = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.end));
  return { label: `Wks ${start}-${end}`, leavesAfter: end < 7 ? end : null };
}

export default async function CardsPage({ searchParams }: { searchParams?: Promise<CardsSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const medicalParam = asArray(params.medical);
  const showMedical = medicalParam.length ? medicalParam.includes("show") : true;
  const qrParam = asArray(params.qr);
  const showQr = qrParam.length ? qrParam.includes("show") : true;
  const selectedCardsPerPage = ["4", "6", "9"].includes(firstParam(params.cardsPerPage) ?? "") ? firstParam(params.cardsPerPage)! : "6";
  const session = await prisma.session.findFirst({ where: { active: true } });
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));
  const selectedUnits = asArray(params.unit).filter(isUnit);
  const selectedCabinIds = asArray(params.cabin);
  // Single-card reprint controls. `q` finds a camper by name; `camper` pins an
  // exact set. Either one takes over the print set (see `campers` below), so a
  // reprint doesn't require unpicking whatever cabins were last selected.
  const searchQuery = (firstParam(params.q) ?? "").trim();
  const pinnedCamperIds = asArray(params.camper);

  const [filterGroups, designationRows, allCabins] = session
    ? await Promise.all([
        prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } }),
        prisma.camperSessionDesignation.findMany({
          where: { camper: { sessionId: session.id, active: true } },
          distinct: ["label"],
          orderBy: { label: "asc" }
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { gender: "asc" }, { name: "asc" }] })
      ])
    : [[], [], []];

  const { selectedGroupIds, weekBlocks, designations } = resolveCamperPoolFilters(params, filterGroups);
  const hasAdvancedFilters = selectedGroupIds.length > 0 || weekBlocks.length > 0 || designations.length > 0;

  // Shared so the cabin-pool query, the name search, and the pinned-camper
  // lookup all produce identically-shaped cards.
  const camperCardInclude = {
    cabin: true,
    weekEnrollments: { include: { cabin: true }, orderBy: { weekBlock: "asc" as const } },
    allergies: { include: { allergyLabel: true }, orderBy: { allergyLabel: { name: "asc" as const } } },
    registrations: {
      where: { registrationWindow, status: { in: activeRegistration } },
      include: { offering: { include: { activity: true } } }
    }
  };

  const allCampers = session
    ? await prisma.camper.findMany({
        where: { sessionId: session.id, active: true, ...camperPoolWhere({ weekBlocks, designations }) },
        include: camperCardInclude,
        orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }]
      })
    : [];

  // Name search. Multi-word queries ("kylie martin") must match ALL parts
  // across first/last/nickname rather than OR-ing them, or every Martin and
  // every Kylie comes back. Same approach as the quick-search endpoint.
  const queryParts = searchQuery.split(/\s+/).filter(Boolean);
  const nameWhere = queryParts.length
    ? queryParts.length >= 2
      ? {
          AND: queryParts.map((part) => ({
            OR: [
              { firstName: { contains: part, mode: "insensitive" as const } },
              { lastName: { contains: part, mode: "insensitive" as const } },
              { nickname: { contains: part, mode: "insensitive" as const } }
            ]
          }))
        }
      : {
          OR: [
            { firstName: { contains: searchQuery, mode: "insensitive" as const } },
            { lastName: { contains: searchQuery, mode: "insensitive" as const } },
            { nickname: { contains: searchQuery, mode: "insensitive" as const } }
          ]
        }
    : null;

  // Search and pin deliberately ignore the cabin/unit/advanced filters: the
  // whole point of a reprint is to grab one camper without first clearing
  // whatever selection the last print job left behind.
  const searchResults =
    session && nameWhere
      ? await prisma.camper.findMany({
          where: { sessionId: session.id, active: true, ...nameWhere },
          include: camperCardInclude,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 60
        })
      : [];

  const pinnedCampers =
    session && pinnedCamperIds.length
      ? await prisma.camper.findMany({
          where: { sessionId: session.id, active: true, id: { in: pinnedCamperIds } },
          include: camperCardInclude,
          orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }]
        })
      : [];

  // Print-set precedence, most specific first:
  //   1. pinned campers  2. name search  3. the usual cabin/unit/advanced pool
  const reprintMode = pinnedCamperIds.length > 0 || queryParts.length > 0;
  const campers = pinnedCamperIds.length
    ? pinnedCampers
    : queryParts.length
      ? searchResults
      : allCampers.filter((camper) => {
          if (selectedUnits.length && !selectedUnits.includes(camper.unit)) return false;
          if (selectedCabinIds.length && !selectedCabinIds.includes(camper.cabinId ?? "")) return false;
          return true;
        });

  // Quick-pick: campers whose schedule changed since the last card print.
  // These are exactly the cards that are now stale in someone's hand, so
  // they're the most likely reprint targets. Sourced from RosterReprintFlag
  // rows, but tracked on the card axis (`cardResolvedAt`) rather than the
  // roster one — clearing the Rosters banner shouldn't quietly declare
  // everyone's registration card reprinted too.
  if (session) await seedCardReprintResolution(session.id);
  const changedFlags = session
    ? await prisma.rosterReprintFlag.findMany({
        where: { sessionId: session.id, cardResolvedAt: null, camperId: { not: null } },
        select: { camperId: true, camperName: true },
        orderBy: { id: "desc" },
        take: 200
      })
    : [];
  const changedCampers: { id: string; name: string }[] = [];
  const seenChanged = new Set<string>();
  for (const flag of changedFlags) {
    if (!flag.camperId || seenChanged.has(flag.camperId)) continue;
    seenChanged.add(flag.camperId);
    changedCampers.push({ id: flag.camperId, name: flag.camperName ?? "Camper" });
  }

  // Chips shown in the reprint panel: search hits, plus anything already
  // pinned (so a pin stays visible/removable after the search text changes).
  const chipCampers = [
    ...searchResults.map((camper) => ({ id: camper.id, name: camperPrintName(camper), cabin: camper.cabin?.name ?? null })),
    ...pinnedCampers
      .filter((camper) => !searchResults.some((match) => match.id === camper.id))
      .map((camper) => ({ id: camper.id, name: camperPrintName(camper), cabin: camper.cabin?.name ?? null }))
  ];
  // Don't render a second checkbox for someone already shown above — two
  // inputs sharing a name/value would post the id twice.
  const chipIds = new Set(chipCampers.map((camper) => camper.id));
  const changedChips = changedCampers.filter((camper) => !chipIds.has(camper.id));

  // "Print all changed" pins the whole changed set and carries the current
  // print options along, so one click goes straight to a print-ready batch
  // without disturbing the window / per-page / medical / QR choices.
  const changedCamperIds = changedCampers.map((camper) => camper.id);
  const printChangedHref = `/cards?${[
    `window=${registrationWindow}`,
    `cardsPerPage=${selectedCardsPerPage}`,
    `medical=${showMedical ? "show" : "hide"}`,
    `qr=${showQr ? "show" : "hide"}`,
    ...changedCamperIds.map((id) => `camper=${id}`)
  ].join("&")}`;
  // After printing a batch the URL pins exactly what was printed, so the
  // clear button narrows to that subset — print a few, clear those few,
  // leave the rest still flagged. With nothing pinned it clears them all.
  const pinnedChangedIds = changedCamperIds.filter((id) => pinnedCamperIds.includes(id));
  const markTargetIds = pinnedChangedIds.length ? pinnedChangedIds : changedCamperIds;
  const cabinsByUnitGender = allCabins.reduce<Record<string, Record<string, typeof allCabins>>>((acc, cabin) => {
    if (!acc[cabin.unit]) acc[cabin.unit] = {};
    if (!acc[cabin.unit][cabin.gender]) acc[cabin.unit][cabin.gender] = [];
    acc[cabin.unit][cabin.gender].push(cabin);
    return acc;
  }, {});

  const activeCabinFilters = selectedUnits.length + selectedCabinIds.length;
  const activeAdvancedFilters = selectedGroupIds.length + weekBlocks.length + designations.length;

  // Chunk cards into explicit page-sized groups. Each group is its own
  // block with a page break after it, so WebKit (Safari) can't slice a
  // card across a page boundary — it ignores break-inside:avoid on grid
  // items, but honors page-break-after on block elements.
  const cardsPerPageNum = Number(selectedCardsPerPage);
  const cardPages: any[][] = [];
  for (let i = 0; i < campers.length; i += cardsPerPageNum) cardPages.push(campers.slice(i, i + cardsPerPageNum));

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Registration Cards" eyebrow={session?.name ?? "No active session"}>
          <PrintButton label="Print cards" />
        </PageHeader>
      </div>

      {/* ── Cards needing reprint ──────────────────────────────────────────
          Mirrors the Rosters banner: print the whole stale batch in one
          job, then deliberately clear the flags (no way to detect a real
          browser print). Its own <form> outside the AutoSubmitForm below —
          forms can't nest. */}
      {changedCamperIds.length > 0 && (
        <div className="no-print mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-amber-900">
              {changedCamperIds.length} card{changedCamperIds.length === 1 ? "" : "s"} need reprinting — these campers&rsquo; schedules changed since their card was last printed.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-black text-amber-900 hover:bg-amber-100"
                href={printChangedHref}
              >
                Print all {changedCamperIds.length}
              </a>
              <form action={markCardsReprinted}>
                {markTargetIds.map((id) => (
                  <input key={id} name="camperId" type="hidden" value={id} />
                ))}
                <SubmitButton
                  className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-black text-amber-900 hover:bg-amber-100"
                  pendingLabel="Clearing…"
                >
                  {pinnedChangedIds.length && pinnedChangedIds.length < changedCamperIds.length
                    ? `Mark these ${pinnedChangedIds.length} reprinted`
                    : "Mark all reprinted"}
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Reprint a single card ──────────────────────────────────────────
          Its own plain GET form, NOT nested in the AutoSubmitForm below:
          forms can't nest, and auto-submitting on every keystroke would fire
          a server round-trip per character. Enter (or the button) searches.
          Hidden fields carry the print options through so searching doesn't
          reset the window / per-page / medical / QR choices. */}
      <form action="/cards" className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft" method="get">
        <input type="hidden" name="window" value={registrationWindow} />
        <input type="hidden" name="cardsPerPage" value={selectedCardsPerPage} />
        <input type="hidden" name="medical" value={showMedical ? "show" : "hide"} />
        <input type="hidden" name="qr" value={showQr ? "show" : "hide"} />
        {pinnedCamperIds.map((id) => <input key={id} type="hidden" name="camper" value={id} />)}

        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div>
            <p className="text-sm font-black text-forest-900">Reprint a single card</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Search a camper by name to print just their card — already filled in with their current schedule.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              autoComplete="off"
              className="w-56 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
              defaultValue={searchQuery}
              name="q"
              placeholder="Camper name..."
              type="search"
            />
            <button className="rounded-lg bg-forest-700 px-3 py-2 text-sm font-black text-white transition hover:bg-forest-800" type="submit">
              Search
            </button>
            {reprintMode ? <a className={secondaryButtonClass} href="/cards">Clear</a> : null}
          </div>
        </div>

        {searchQuery && !chipCampers.length ? (
          <p className="border-t border-slate-100 px-5 py-3 text-sm font-semibold text-slate-500">
            No camper matches &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : null}
      </form>

      <AutoSubmitForm className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft">
        {/* Keep the search text alive when a chip/cabin toggle re-submits. */}
        {searchQuery ? <input type="hidden" name="q" value={searchQuery} /> : null}

        {chipCampers.length || changedChips.length ? (
          <div className="border-b border-slate-100 px-5 py-3">
            {chipCampers.length ? (
              <>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  {searchQuery ? "Matches" : "Selected"} — tick to print only these
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {chipCampers.map((camper) => (
                    <label className="cursor-pointer" key={camper.id}>
                      <input className="peer sr-only" defaultChecked={pinnedCamperIds.includes(camper.id)} name="camper" type="checkbox" value={camper.id} />
                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-slate-300">
                        {camper.name}
                        {camper.cabin ? <span className="ml-1.5 text-xs font-semibold opacity-70">{camper.cabin}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}

            {changedChips.length ? (
              <>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Schedule changed since last reprint
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {changedChips.map((camper) => (
                    <label className="cursor-pointer" key={camper.id}>
                      <input className="peer sr-only" defaultChecked={pinnedCamperIds.includes(camper.id)} name="camper" type="checkbox" value={camper.id} />
                      <span className="inline-flex rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-black text-amber-900 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">
                        {camper.name}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* ── Top bar: window + print options + actions ── */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="window" defaultValue={registrationWindow}>
            {(Object.values(RegistrationWindow) as string[]).map((w) => (
              <option key={w} value={w}>{REGISTRATION_WINDOW_LABEL[w as RegistrationWindow]} — {REGISTRATION_WINDOW_DESCRIPTION[w as RegistrationWindow]}</option>
            ))}
          </select>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" name="cardsPerPage" defaultValue={selectedCardsPerPage}>
            <option value="4">4 per page</option>
            <option value="6">6 per page</option>
            <option value="9">9 per page</option>
          </select>
          <label className="cursor-pointer">
            <input name="medical" type="hidden" value="hide" />
            <input className="peer sr-only" defaultChecked={showMedical} name="medical" type="checkbox" value="show" />
            <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Medical notes</span>
          </label>
          <label className="cursor-pointer">
            <input name="qr" type="hidden" value="hide" />
            <input className="peer sr-only" defaultChecked={showQr} name="qr" type="checkbox" value="show" />
            <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">QR codes</span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-black text-forest-900">{campers.length} card{campers.length !== 1 ? "s" : ""}</span>
            {reprintMode ? (
              <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">
                {pinnedCamperIds.length ? "selected campers only" : "search results only"}
              </span>
            ) : null}
            <a className={secondaryButtonClass} href="/cards">Reset</a>
          </div>
        </div>

        {/* ── Cabin picker — the main event ── */}
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-forest-900">Select cabins to print</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {reprintMode
                  ? "Ignored right now — a camper search/selection is active above. Clear it to print by cabin again."
                  : `No selection prints all ${allCampers.length} campers. Click individual cabins or use unit buttons to select a whole unit.`}
              </p>
            </div>
            {activeCabinFilters > 0 && (
              <span className="rounded-full bg-lake-600 px-2.5 py-0.5 text-xs font-black text-white">{campers.length} selected</span>
            )}
          </div>

          <div className="space-y-3">
            {(Object.values(Unit) as Unit[]).map((unit) => {
              const genderGroups = cabinsByUnitGender[unit];
              if (!genderGroups) return null;
              const allUnitCabinIds = Object.values(genderGroups).flat().map((c) => c.id);
              const unitFullySelected = selectedUnits.includes(unit);

              return (
                <div key={unit} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-600">{UNIT_LABEL[unit]}</span>
                    <label className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={unitFullySelected} name="unit" type="checkbox" value={unit} />
                      <span className="inline-flex rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-400">
                        All {UNIT_LABEL[unit]}
                      </span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(genderGroups)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([gender, cabins]) => (
                        <div key={gender} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-9 shrink-0 text-xs font-semibold text-slate-400">{genderShort(gender as Gender)}</span>
                          {cabins.map((cabin) => (
                            <label key={cabin.id} className="cursor-pointer">
                              <input className="peer sr-only" defaultChecked={selectedCabinIds.includes(cabin.id)} name="cabin" type="checkbox" value={cabin.id} />
                              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white hover:border-slate-300">
                                {cabin.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Advanced filters — collapsed by default, open if anything is active */}
          <details className="mt-4" open={hasAdvancedFilters}>
            <summary className="cursor-pointer text-sm font-black text-slate-500 hover:text-slate-700">
              Advanced filters
              {activeAdvancedFilters > 0 && (
                <span className="ml-2 rounded-full bg-forest-700 px-2 py-0.5 text-xs font-black text-white">{activeAdvancedFilters} active</span>
              )}
            </summary>
            <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Use these to narrow cards to a specific sub-group — e.g. first-session only, 11th grade program, or a saved registration group. These stack on top of cabin selection above.</p>

              {filterGroups.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Saved registration groups</p>
                  <div className="flex flex-wrap gap-2">
                    {filterGroups.map((group) => (
                      <label key={group.id} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={selectedGroupIds.includes(group.id)} name="group" type="checkbox" value={group.id} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{group.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Week blocks</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.values(WeekBlock) as WeekBlock[]).map((wb) => (
                    <label key={wb} className="cursor-pointer">
                      <input className="peer sr-only" defaultChecked={weekBlocks.includes(wb)} name="weekBlock" type="checkbox" value={wb} />
                      <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{WEEK_BLOCK_LABEL[wb]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {designationRows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Session designations</p>
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {designationRows.map((row) => (
                      <label key={row.label} className="cursor-pointer">
                        <input className="peer sr-only" defaultChecked={designations.includes(row.label)} name="designation" type="checkbox" value={row.label} />
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{row.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </AutoSubmitForm>

      {cardPages.map((pageCards: any[], pageIndex: number) => (
        <div key={pageIndex} className={`cards-page cards-per-page-${selectedCardsPerPage}`}>
          <div className={`registration-cards-grid cards-per-page-${selectedCardsPerPage} grid gap-5 lg:grid-cols-2 print:grid`}>
            {pageCards.map((camper: any) => {
          const byPeriod = new Map(camper.registrations.map((registration: any) => [registration.period, registration]));
          // Bluegill swimmers get bold + underline on the printed card so
          // they're easy to find and highlight by hand after printing.
          const isBluegill = camper.swimLevel === "BLUEGILL";
          return (
            <article key={camper.id} className="print-card rounded-lg border-2 border-forest-900 bg-white p-5 shadow-soft print:mb-5">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-700">Camp Walden Registration Card - {REGISTRATION_WINDOW_LABEL[registrationWindow]}</p>
                  <h2 className={`mt-1 text-2xl text-forest-900 ${isBluegill ? "font-extrabold underline decoration-2 underline-offset-2" : "font-bold"}`}>{camperPrintName(camper)}</h2>
                  <p className="text-sm text-slate-600">Cabin {camper.cabin?.name ?? "-"} - {UNIT_LABEL[camper.unit as keyof typeof UNIT_LABEL]} - {isBluegill ? <span className="font-black text-forest-900 underline decoration-2 underline-offset-2">Swim B</span> : <>Swim {SWIM_CODE[camper.swimLevel as keyof typeof SWIM_CODE]}</>}</p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {camper.campGrade ? `${camper.campGrade} • ` : ""}
                    {(() => {
                      const stay = staySummary(camper.weekEnrollments);
                      if (!stay) return "No weeks loaded";
                      return (
                        <>
                          {stay.label}
                          {stay.leavesAfter ? <span className="ml-1.5 font-black text-forest-900 underline decoration-2 underline-offset-2">Leaves after Wk {stay.leavesAfter}</span> : null}
                        </>
                      );
                    })()}
                  </p>
                  {showMedical ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {camper.allergies.map((allergy) => <Badge key={allergy.id} tone="amber">{allergy.allergyLabel.name}</Badge>)}
                      {camper.medicalFlags ? <Badge tone="amber">{camper.medicalFlags}</Badge> : null}
                    </div>
                  ) : null}
                </div>
                {showQr ? <img alt={`QR for ${camper.firstName} ${camper.lastName}`} className="h-24 w-24" src={`/api/campers/${camper.id}/qr`} /> : null}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2">
                {[leftPeriods, rightPeriods].map((periods, index) => (
                  <table key={index} className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-200 text-slate-900">
                        <th className="w-9 border border-forest-900 p-2 text-left font-black">Pd</th>
                        <th className="border border-forest-900 p-2 text-left font-black">Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => {
                        const registration = byPeriod.get(period);
                        const activity = (registration as any)?.offering?.activity;
                        const activityLabel = activity
                          ? `${activity.abbreviation || activity.name}${(registration as any).registrationRole === RegistrationRole.TEACHING_ASSISTANT ? " (TA)" : ""}`
                          : "";
                        return (
                          <tr key={period}>
                            <td className="border border-slate-300 p-2 text-base font-extrabold text-forest-900">{PERIOD_LABEL[period]}</td>
                            <td className="border border-slate-300 p-2 align-top text-sm font-semibold leading-snug text-slate-900">
                              {activityLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            </article>
          );
            })}
          </div>
        </div>
      ))}
    </AppShell>
  );
}
