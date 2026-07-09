import { Period, Prisma, RegistrationRole, RegistrationStatus, UserRole, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { camperPrintName } from "@/lib/camper-name";
import { prisma } from "@/lib/prisma";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { SubmitButton } from "@/components/confirm-submit-button";
import { markRosterReprinted, markRostersReprinted } from "./actions";
import { CAMPER_PERIODS, PERIOD_LABEL, TWILIGHT_PERIODS } from "@/lib/periods";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rosters" };

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

// A blank roster for an UNLIMITED-capacity class has no natural row count
// (no rosterLimit to add a buffer to) - "just a full page" per Mike. 37
// (trimmed down from 40 to make safe room for the repeated footer added
// below) still reliably fits one portrait letter page at the smallest size
// tier (see roster-print-card / roster-card-footer sizing notes in
// globals.css).
const FULL_PAGE_BLANK_ROWS = 37;

// Extra blank rows appended after the actual roster limit/registration
// count, for late add-ons and walk-ins. Was a flat +5 everywhere; trimmed
// to +2 (same "make room for the footer" reason as FULL_PAGE_BLANK_ROWS
// above) so every roster - not just the unlimited-blank case - keeps
// fitting on one printed page with the footer added.
const ROSTER_ROW_BUFFER = 2;

const A_PERIODS = [Period.P1A, Period.P2A, Period.P3A, Period.P4A] as Period[];
const B_PERIODS = [Period.P1B, Period.P2B, Period.P3B, Period.P4B] as Period[];

type RostersSearchParams = {
  area?: string | string[];
  period?: string | string[];
  offering?: string | string[];
  allergies?: string | string[];
  camperLeaveDates?: string | string[];
  staffLeaveDates?: string | string[];
  blank?: string | string[];
  waitlistOnly?: string | string[];
  generic?: string | string[];
  genericCount?: string | string[];
  genericRows?: string | string[];
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function readToggle(value: string | string[] | undefined, defaultValue: boolean) {
  const values = asArray(value);
  return values.length ? values.includes("show") : defaultValue;
}

function readNumber(value: string | string[] | undefined, defaultValue: number, min: number, max: number) {
  const raw = Number(asArray(value)[0]);
  if (!Number.isFinite(raw)) return defaultValue;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function shortDate(date?: Date | null) {
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : "";
}

const weekBlockRank: Record<WeekBlock, number> = {
  [WeekBlock.WK1_2]: 1, [WeekBlock.WK3_4]: 2, [WeekBlock.WK5_6]: 3, [WeekBlock.WK7]: 4
};

function camperLeaveLabel(camper: { weekEnrollments: { weekBlock: WeekBlock }[] }) {
  const lastWeek = camper.weekEnrollments.reduce<WeekBlock | null>((latest, enrollment) => {
    if (!latest) return enrollment.weekBlock;
    return weekBlockRank[enrollment.weekBlock] > weekBlockRank[latest] ? enrollment.weekBlock : latest;
  }, null);
  return lastWeek ? `Through ${WEEK_BLOCK_LABEL[lastWeek]}` : "";
}

function staffLabel(
  assignment: { staff: { firstName: string; lastName: string; employmentEnd: Date | null } },
  showLeaveDate: boolean
) {
  const name = `${assignment.staff.firstName} ${assignment.staff.lastName}`;
  const leaveDate = showLeaveDate ? shortDate(assignment.staff.employmentEnd) : "";
  return leaveDate ? `${name} (leaves ${leaveDate})` : name;
}

function ChipToggle({ name, value, label, checked, color = "lake" }: {
  name: string; value: string; label: string; checked: boolean; color?: "lake" | "forest";
}) {
  const activeClass = color === "forest"
    ? "peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white"
    : "peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white";
  return (
    <label className="cursor-pointer">
      <input className="peer sr-only" defaultChecked={checked} name={name} type="checkbox" value={value} />
      <span className={`inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black transition ${activeClass}`}>{label}</span>
    </label>
  );
}

export default async function RostersPage({ searchParams }: { searchParams?: Promise<RostersSearchParams> }) {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};

  const selectedAreaIds = asArray(params.area);
  const selectedPeriods = asArray(params.period).filter((v): v is Period => Object.values(Period).includes(v as Period));
  const selectedOfferingIds = asArray(params.offering);
  const showAllergies = readToggle(params.allergies, true);
  const showCamperLeaveDates = readToggle(params.camperLeaveDates, false);
  const showStaffLeaveDates = readToggle(params.staffLeaveDates, false);
  const blankRosters = readToggle(params.blank, false);
  const waitlistOnly = readToggle(params.waitlistOnly, false);
  // Generic blank rosters are a separate, standalone print mode: not tied
  // to any real offering, session, or menu data at all — just a stack of
  // blank sheets for whatever comes up (a pop-up activity, a substitute
  // sheet, spares to keep on hand). Independent of every other filter on
  // this page, and works even with no active session.
  const genericMode = readToggle(params.generic, false);
  const genericCount = readNumber(params.genericCount, 5, 1, 50);
  const genericRows = readNumber(params.genericRows, 25, 5, 60);

  // Rosters needing reprint (flagged by an approved camper switch) — scoped
  // to the viewer's own area for Area Heads, all areas for Exec Admin, and
  // hidden entirely for anyone else (e.g. counselors).
  const canSeeReprintFlags = user.role === UserRole.EXECUTIVE_ADMIN || user.role === UserRole.AREA_HEAD;
  const reprintFlags = session && canSeeReprintFlags
    ? await prisma.rosterReprintFlag.findMany({
        where: {
          sessionId: session.id,
          resolvedAt: null,
          ...(user.role === UserRole.AREA_HEAD ? { offering: { areaId: user.areaId ?? undefined } } : {})
        },
        include: { offering: { select: { id: true, period: true, activity: { select: { name: true } }, area: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const reprintByOffering = new Map<string, { activity: string; area: string; period: Period; reasons: string[] }>();
  for (const flag of reprintFlags) {
    const existing = reprintByOffering.get(flag.offeringId);
    if (existing) {
      existing.reasons.push(flag.reason);
    } else {
      reprintByOffering.set(flag.offeringId, {
        activity: flag.offering.activity.name,
        area: flag.offering.area.name,
        period: flag.offering.period,
        reasons: [flag.reason]
      });
    }
  }
  const reprintOfferingIds = Array.from(reprintByOffering.keys());

  // Shared shape for both branches below (blank vs. normal roster mode) so
  // Prisma/TypeScript infer one consistent type regardless of which branch
  // actually runs, rather than two structurally-different payloads.
  const registrationSelect = {
    id: true,
    registrationRole: true,
    camper: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        cabin: { select: { name: true } },
        allergies: showAllergies ? { select: { allergyLabel: { select: { name: true } } } } : false,
        weekEnrollments: showCamperLeaveDates ? { select: { weekBlock: true }, orderBy: { weekBlock: "asc" as const } } : false
      }
    }
  } as const;

  const [areas, offeringOptions, offerings, waitlistedRegistrations] = session
    ? await Promise.all([
        prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        // Picker only needs area+activity names — no camper data needed
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } },
          select: { id: true, period: true, area: { select: { id: true, name: true } }, activity: { select: { id: true, name: true } } },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        }),
        // Main roster query — only load allergy/leave data when the columns
        // are shown, and skip the camper/cabin join entirely in blank mode:
        // blank rosters never render a real name no matter what's actually
        // registered, so fetching and joining that data for every offering
        // in the session (the default view has no area/period filter) was
        // pure wasted DB and serialization work — this was the main cost
        // behind the app-wide slowdown while blank mode is in use. Staff is
        // narrowed to just the fields staffLabel() actually reads instead
        // of pulling the whole Staff row per assignment.
        prisma.activityOffering.findMany({
          where: {
            sessionId: session.id,
            active: true,
            visibleForCamperRegistration: true,
            area: { active: true },
            activity: { active: true },
            ...(selectedAreaIds.length ? { areaId: { in: selectedAreaIds } } : {}),
            ...(selectedPeriods.length ? { period: { in: selectedPeriods } } : {}),
            ...(selectedOfferingIds.length ? { id: { in: selectedOfferingIds } } : {}),
            ...(waitlistOnly ? { allowWaitlist: true } : {})
          },
          include: {
            area: true,
            activity: true,
            staffAssignments: { include: { staff: { select: { id: true, firstName: true, lastName: true, employmentEnd: true } } } },
            registrations: blankRosters
              ? { where: { id: "__blank-roster-skip__" }, select: registrationSelect }
              : {
                  where: { status: { in: activeRegistration } },
                  select: registrationSelect,
                  orderBy: [{ registrationRole: "asc" }, { camper: { cabin: { name: "asc" } } }, { camper: { lastName: "asc" } }]
                }
          },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        }),
        // Waitlisted registrations aren't part of the roster itself, but
        // rosters are exactly where an area head would want to see "who's
        // waiting" — same filters as the main roster query above, just a
        // different status. Blank rosters print a pre-printed blank
        // waitlist section instead of this live data (see the render loop
        // below), so there's no reason to fetch it in that mode.
        blankRosters
          ? Promise.resolve([] as Prisma.RegistrationGetPayload<{ include: { camper: { include: { cabin: true } } } }>[])
          : prisma.registration.findMany({
          where: {
            status: RegistrationStatus.WAITLISTED,
            offering: {
              sessionId: session.id,
              active: true,
              area: { active: true },
              activity: { active: true },
              ...(selectedAreaIds.length ? { areaId: { in: selectedAreaIds } } : {}),
              ...(selectedPeriods.length ? { period: { in: selectedPeriods } } : {}),
              ...(selectedOfferingIds.length ? { id: { in: selectedOfferingIds } } : {})
            }
          },
          include: { camper: { include: { cabin: true } } },
          orderBy: [{ offeringId: "asc" }, { waitlistPosition: "asc" }]
        })
      ])
    : [[], [], [], []];

  const waitlistByOffering = new Map<string, typeof waitlistedRegistrations>();
  for (const entry of waitlistedRegistrations) {
    const list = waitlistByOffering.get(entry.offeringId) ?? [];
    list.push(entry);
    waitlistByOffering.set(entry.offeringId, list);
  }

  // Group offerings by area for the individual classes picker
  const offeringsByArea = offeringOptions.reduce<Record<string, { areaName: string; offerings: typeof offeringOptions }>>((acc, o) => {
    if (!acc[o.area.id]) acc[o.area.id] = { areaName: o.area.name, offerings: [] };
    acc[o.area.id].offerings.push(o);
    return acc;
  }, {});

  const allASelected = A_PERIODS.every((p) => selectedPeriods.includes(p));
  const allBSelected = B_PERIODS.every((p) => selectedPeriods.includes(p));
  const activeFilterCount = selectedAreaIds.length + selectedPeriods.length + selectedOfferingIds.length;
  const visibleOfferings = offerings.filter((o) => {
    if (TWILIGHT_PERIODS.includes(o.period)) return false;
    if (blankRosters) return true;
    const camperRegs = o.registrations.filter((r) => r.registrationRole === RegistrationRole.CAMPER);
    const taRegs = o.registrations.filter((r) => r.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
    return camperRegs.length > 0 || taRegs.length > 0;
  });

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
          <PrintButton label="Print rosters" />
        </PageHeader>
      </div>

      {reprintOfferingIds.length > 0 && (
        <div className="no-print mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-amber-900">
              {reprintOfferingIds.length} roster{reprintOfferingIds.length === 1 ? "" : "s"} need reprinting — recent camper switches changed who&rsquo;s on them.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-black text-amber-900 hover:bg-amber-100"
                href={`/rosters?${reprintOfferingIds.map((id) => `offering=${id}`).join("&")}`}
              >
                Show only these
              </a>
              <form action={markRostersReprinted}>
                {reprintOfferingIds.map((id) => (
                  <input key={id} name="offeringId" type="hidden" value={id} />
                ))}
                <SubmitButton className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-black text-amber-900 hover:bg-amber-100" pendingLabel="Clearing…">
                  Mark all reprinted
                </SubmitButton>
              </form>
            </div>
          </div>
          <ul className="mt-2 grid gap-1 text-xs font-semibold text-amber-800 sm:grid-cols-2">
            {Array.from(reprintByOffering.entries()).map(([id, info]) => (
              <li key={id}>{info.area} &middot; {info.activity} &middot; {PERIOD_LABEL[info.period]}</li>
            ))}
          </ul>
        </div>
      )}

      {session ? (
        <AutoSubmitForm className="no-print mb-5 rounded-xl border border-slate-200 bg-white shadow-soft">

          {/* Top bar: print options + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400 mr-1">On rosters</span>
              <label className="cursor-pointer">
                <input name="allergies" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showAllergies} name="allergies" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Allergies</span>
              </label>
              <label className="cursor-pointer">
                <input name="camperLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showCamperLeaveDates} name="camperLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Camper leave info</span>
              </label>
              <label className="cursor-pointer">
                <input name="staffLeaveDates" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={showStaffLeaveDates} name="staffLeaveDates" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-forest-700 peer-checked:bg-forest-50 peer-checked:text-forest-900">Staff leave dates</span>
              </label>
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              <label className="cursor-pointer">
                <input name="blank" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={blankRosters} name="blank" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-lake-700 peer-checked:bg-lake-50 peer-checked:text-lake-900">Blank rosters (no camper names)</span>
              </label>
              <label className="cursor-pointer">
                <input name="waitlistOnly" type="hidden" value="hide" />
                <input className="peer sr-only" defaultChecked={waitlistOnly} name="waitlistOnly" type="checkbox" value="show" />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-amber-600 peer-checked:bg-amber-50 peer-checked:text-amber-900">Waitlist-enabled classes only</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-xs font-black text-white">{visibleOfferings.length} roster{visibleOfferings.length !== 1 ? "s" : ""}</span>
              )}
              <a className={secondaryButtonClass} href="/rosters">Reset</a>
            </div>
          </div>

          {/* Generic blank rosters: not tied to any real offering, area, or
           * period — a plain fill-in-the-blank sheet for whatever comes up.
           * Independent of every filter above; ignores them entirely when on. */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400 mr-1">Generic</span>
            <label className="cursor-pointer">
              <input name="generic" type="hidden" value="hide" />
              <input className="peer sr-only" defaultChecked={genericMode} name="generic" type="checkbox" value="show" />
              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-lake-700 peer-checked:bg-lake-50 peer-checked:text-lake-900">Blank rosters for any activity</span>
            </label>
            {genericMode ? (
              <>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  Sheets
                  <select className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" name="genericCount" defaultValue={String(genericCount)}>
                    {[1, 2, 3, 5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  Rows each
                  <select className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" name="genericRows" defaultValue={String(genericRows)}>
                    {[10, 15, 20, 25, 30, 35, 40, 50, 60].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <span className="text-xs font-semibold text-slate-400">Ignores every filter above — prints {genericCount} identical blank sheet{genericCount === 1 ? "" : "s"} with a line to write in the activity, area, period, and staff by hand.</span>
              </>
            ) : null}
          </div>

          <div className="p-5 space-y-6">

            {/* Areas */}
            <div>
              <p className="mb-2 text-sm font-black text-slate-700">Areas</p>
              <div className="flex flex-wrap gap-2">
                {areas.map((area) => (
                  <ChipToggle key={area.id} name="area" value={area.id} label={area.name} checked={selectedAreaIds.includes(area.id)} />
                ))}
              </div>
            </div>

            {/* Periods — with day shortcuts */}
            <div>
              <div className="mb-2 flex items-center gap-3">
                <p className="text-sm font-black text-slate-700">Periods</p>
                <span className="text-xs text-slate-400">— or pick a whole day:</span>
                {/* A-day shortcut: submits all 4 A periods */}
                <a
                  href={`/rosters?${new URLSearchParams([
                    ...A_PERIODS.map((p) => ["period", p] as [string, string]),
                    ...(selectedAreaIds.map((id) => ["area", id] as [string, string])),
                    ...(selectedOfferingIds.map((id) => ["offering", id] as [string, string])),
                    ["allergies", showAllergies ? "show" : "hide"],
                    ["camperLeaveDates", showCamperLeaveDates ? "show" : "hide"],
                    ["staffLeaveDates", showStaffLeaveDates ? "show" : "hide"],
                    ["blank", blankRosters ? "show" : "hide"],
                    ["waitlistOnly", waitlistOnly ? "show" : "hide"],
                  ]).toString()}`}
                  className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-black transition ${allASelected ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  All A-day
                </a>
                <a
                  href={`/rosters?${new URLSearchParams([
                    ...B_PERIODS.map((p) => ["period", p] as [string, string]),
                    ...(selectedAreaIds.map((id) => ["area", id] as [string, string])),
                    ...(selectedOfferingIds.map((id) => ["offering", id] as [string, string])),
                    ["allergies", showAllergies ? "show" : "hide"],
                    ["camperLeaveDates", showCamperLeaveDates ? "show" : "hide"],
                    ["staffLeaveDates", showStaffLeaveDates ? "show" : "hide"],
                    ["blank", blankRosters ? "show" : "hide"],
                    ["waitlistOnly", waitlistOnly ? "show" : "hide"],
                  ]).toString()}`}
                  className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-black transition ${allBSelected ? "border-lake-600 bg-lake-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  All B-day
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAMPER_PERIODS.map((period) => (
                  <ChipToggle key={period} name="period" value={period} label={PERIOD_LABEL[period]} checked={selectedPeriods.includes(period)} />
                ))}
              </div>
            </div>

            {/* Individual classes — grouped by area */}
            {Object.keys(offeringsByArea).length > 0 && (
              <div>
                <p className="mb-3 text-sm font-black text-slate-700">Individual classes <span className="text-xs font-normal text-slate-400">— use these to pick specific classes within an area/period</span></p>
                <div className="space-y-3">
                  {Object.entries(offeringsByArea).map(([areaId, { areaName, offerings: areaOfferings }]) => {
                    // Group by period within each area
                    const byPeriod = areaOfferings.reduce<Record<string, typeof areaOfferings>>((acc, o) => {
                      const label = PERIOD_LABEL[o.period];
                      if (!acc[label]) acc[label] = [];
                      acc[label].push(o);
                      return acc;
                    }, {});
                    return (
                      <details key={areaId} className="rounded-lg border border-slate-200">
                        <summary className="cursor-pointer px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                          {areaName}
                          {selectedOfferingIds.some((id) => areaOfferings.some((o) => o.id === id)) && (
                            <span className="ml-2 rounded-full bg-forest-700 px-2 py-0.5 text-xs font-black text-white">
                              {areaOfferings.filter((o) => selectedOfferingIds.includes(o.id)).length} selected
                            </span>
                          )}
                        </summary>
                        <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50">
                          {Object.entries(byPeriod).map(([periodLabel, periodOfferings]) => (
                            <div key={periodLabel} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-6 shrink-0 text-xs font-black text-slate-400">{periodLabel}</span>
                              {periodOfferings.map((o) => (
                                <ChipToggle
                                  key={o.id}
                                  name="offering"
                                  value={o.id}
                                  label={o.activity.name}
                                  checked={selectedOfferingIds.includes(o.id)}
                                  color="forest"
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </AutoSubmitForm>
      ) : null}

      {genericMode ? (
        <div className="grid gap-6">
          {Array.from({ length: genericCount }).map((_, sheetIndex) => {
            const rosterSizeClass = genericRows <= 16 ? "roster-size-lg" : genericRows <= 24 ? "roster-size-md" : "roster-size-sm";
            const blankLine = (minWidth: string, bold = false) => (
              <span className={`inline-block border-b-2 border-slate-400 ${bold ? "font-black" : ""}`} style={{ minWidth }}>&nbsp;</span>
            );
            return (
              <article key={sheetIndex} className={`roster-print-card print-card ${rosterSizeClass} rounded-lg border border-white bg-white p-5 shadow-soft`}>
                <div className="roster-card-header grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="min-w-0">
                    <p className="roster-card-eyebrow text-sm font-semibold uppercase tracking-wide text-lake-700">Blank roster sheet — generic</p>
                    <h2 className="flex flex-wrap items-baseline gap-2 text-2xl font-bold text-forest-900">
                      Activity: {blankLine("3in")}
                    </h2>
                    <p className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
                      <span>Area: {blankLine("1.6in")}</span>
                      <span>Period: {blankLine("0.9in")}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm font-bold text-slate-900">Staff: {blankLine("2.6in", true)}</p>
                  </div>
                  <div className="text-right">
                    <p className="no-print mt-2 text-sm text-slate-500">Sheet {sheetIndex + 1} of {genericCount}</p>
                  </div>
                </div>

                <table className="mt-4 w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-forest-900 text-white">
                      <th className="w-8 border border-forest-900 p-2">#</th>
                      <th className="border border-forest-900 p-2 text-left">Name</th>
                      <th className="w-16 border border-forest-900 p-2 text-left">Cabin</th>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-8 border border-forest-900 p-2">{day}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: genericRows }).map((_, index) => (
                      <tr key={index}>
                        <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="roster-card-footer mt-5 border-t-2 border-slate-400 pt-2">
                  <p className="flex flex-wrap items-baseline gap-2 text-lg font-bold text-forest-900">
                    Activity: {blankLine("3in")}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
                    <span>Area: {blankLine("1.4in")}</span>
                    <span>Period: {blankLine("0.8in")}</span>
                    <span className="font-bold text-slate-900">Staff: {blankLine("2in", true)}</span>
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <>
          {!session && (
            <div className="no-print rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
              No active session selected — roster sheets are not available yet.
            </div>
          )}

          {session && !visibleOfferings.length && (
            <div className="no-print rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
              No rosters match your current filters.{activeFilterCount > 0 ? " Try resetting." : ""}
            </div>
          )}

          <div className="grid gap-6">
            {offerings.map((offering) => {
          const camperRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.CAMPER);
          const assistantRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
          const isTwilight = TWILIGHT_PERIODS.includes(offering.period);
          const hasNoRegistrations = camperRegistrations.length === 0 && assistantRegistrations.length === 0;
          // Blank rosters exist specifically FOR classes with nobody signed
          // up yet (pre-printed before registration day), so the normal
          // "hide if nobody's registered" rule doesn't apply here. Genuine
          // staff-only offerings (visibleForCamperRegistration: false) are
          // excluded up in the query itself, not here — they'd always have
          // zero registrations by definition and have no business getting a
          // camper roster printed, blank or otherwise.
          if (isTwilight || (hasNoRegistrations && !blankRosters)) return null;

          const isUnlimited = offering.limitType === "UNLIMITED";
          const rosterColumnCount = 11 + (showAllergies ? 1 : 0) + (showCamperLeaveDates ? 1 : 0);
          const rosterRowCount = blankRosters
            ? isUnlimited
              ? FULL_PAGE_BLANK_ROWS
              : (offering.rosterLimit ?? 12) + ROSTER_ROW_BUFFER
            : Math.max(camperRegistrations.length, offering.rosterLimit ?? 12) + ROSTER_ROW_BUFFER;
          // Blank rosters print without the Teaching Assistants block or the
          // live digital waitlist — a printed blank waitlist section takes
          // its place below when the class has waitlisting turned on.
          const taOverhead = !blankRosters && assistantRegistrations.length > 0 ? 1 + assistantRegistrations.length : 0;
          const blankWaitlistRows = 5;
          const waitlistOverhead = blankRosters && offering.allowWaitlist ? blankWaitlistRows + 2 : 0;
          const totalBodyRows = rosterRowCount + taOverhead + waitlistOverhead;
          const rosterSizeClass = totalBodyRows <= 16 ? "roster-size-lg" : totalBodyRows <= 24 ? "roster-size-md" : "roster-size-sm";
          const waitlist = waitlistByOffering.get(offering.id) ?? [];

          return (
            <article key={offering.id} className={`roster-print-card print-card ${rosterSizeClass} rounded-lg border border-white bg-white p-5 shadow-soft`}>
              <div className="roster-card-header grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="lg" className="roster-card-icon" />
                  <div className="min-w-0">
                    <p className="roster-card-eyebrow text-sm font-semibold uppercase tracking-wide text-lake-700">
                      {offering.area.name} roster sheet{blankRosters ? " — blank" : ""}
                    </p>
                    <h2 className="text-2xl font-bold text-forest-900">{offering.activity.name}</h2>
                    <p className="text-sm text-slate-500">{session?.name} - Period {PERIOD_LABEL[offering.period]}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">Staff: <span className="font-black">{offering.staffAssignments.map((a) => staffLabel(a, showStaffLeaveDates)).join(", ") || "Unassigned"}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <CapacityPill count={blankRosters ? 0 : camperRegistrations.length} limit={offering.rosterLimit} limitType={offering.limitType} />
                  <p className="no-print mt-2 text-sm text-slate-500">Page 1</p>
                  {!blankRosters && reprintByOffering.has(offering.id) && (
                    <div className="no-print mt-2 flex items-center justify-end gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">Needs reprint</span>
                      <form action={markRosterReprinted}>
                        <input name="offeringId" type="hidden" value={offering.id} />
                        <button className="text-xs font-semibold text-slate-400 underline" type="submit">Mark reprinted</button>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              <table className="mt-4 w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-forest-900 text-white">
                    <th className="w-8 border border-forest-900 p-2">#</th>
                    <th className="border border-forest-900 p-2 text-left">Name</th>
                    <th className="w-16 border border-forest-900 p-2 text-left">Cabin</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-8 border border-forest-900 p-2">{day}</th>)}
                    {showCamperLeaveDates ? <th className="w-20 border border-forest-900 p-2 text-left">Leave</th> : null}
                    {showAllergies ? <th className="w-28 border border-forest-900 p-2 text-left">Allergies / notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rosterRowCount }).map((_, index) => {
                    const registration = blankRosters ? undefined : camperRegistrations[index];
                    return (
                      <tr key={registration?.id ?? `blank-${index}`}>
                        <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                        <td className="border border-slate-300 p-2">{registration ? camperPrintName(registration.camper) : ""}</td>
                        <td className="border border-slate-300 p-2">{registration?.camper.cabin?.name ?? ""}</td>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                        {showCamperLeaveDates ? <td className="border border-slate-300 p-2">{registration ? camperLeaveLabel(registration.camper) : "\u00a0"}</td> : null}
                        {showAllergies ? <td className="border border-slate-300 p-2 align-top text-xs leading-snug">{registration?.camper.allergies?.map((a) => a.allergyLabel.name).join(", ") || "\u00a0"}</td> : null}
                      </tr>
                    );
                  })}
                  {!blankRosters && assistantRegistrations.length ? (
                    <tr><td className="border border-slate-300 bg-lake-50 p-2 text-center font-black" colSpan={rosterColumnCount}>Teaching Assistants</td></tr>
                  ) : null}
                  {!blankRosters && assistantRegistrations.map((registration, index) => (
                    <tr key={registration.id}>
                      <td className="border border-slate-300 p-2 text-center">TA {index + 1}</td>
                      <td className="border border-slate-300 p-2 font-black">{camperPrintName(registration.camper)}</td>
                      <td className="border border-slate-300 p-2">{registration.camper.cabin?.name ?? ""}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      {showCamperLeaveDates ? <td className="border border-slate-300 p-2">{camperLeaveLabel(registration.camper) || "\u00a0"}</td> : null}
                      {showAllergies ? <td className="border border-slate-300 p-2 align-top text-xs leading-snug">Teaching assistant{registration.camper.allergies?.length ? `; ${registration.camper.allergies.map((a) => a.allergyLabel.name).join(", ")}` : ""}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>

              {blankRosters ? (
                offering.allowWaitlist ? (
                  <div className="waitlist-section mt-3 rounded-md border border-amber-300 bg-white p-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Waitlist</p>
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-amber-100 text-amber-900">
                          <th className="w-8 border border-amber-300 p-1.5">#</th>
                          <th className="border border-amber-300 p-1.5 text-left">Name</th>
                          <th className="w-16 border border-amber-300 p-1.5 text-left">Cabin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: blankWaitlistRows }).map((_, index) => (
                          <tr key={`waitlist-blank-${index}`}>
                            <td className="border border-amber-200 p-1.5 text-center">{index + 1}</td>
                            <td className="border border-amber-200 p-1.5">&nbsp;</td>
                            <td className="border border-amber-200 p-1.5">&nbsp;</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null
              ) : waitlist.length ? (
                <div className="waitlist-section no-print mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-900">Waitlist ({waitlist.length})</p>
                  <ol className="mt-1 grid gap-1 text-sm font-semibold text-amber-900 sm:grid-cols-2">
                    {waitlist.map((entry, index) => (
                      <li key={entry.id}>
                        {entry.waitlistPosition ?? index + 1}. {camperPrintName(entry.camper)}
                        {entry.camper.cabin ? <span className="font-normal text-amber-700"> — {entry.camper.cabin.name}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {/* Repeats the header's identity info at the bottom of the sheet.
                  Requested by Mike: clipboard clips and staples often cover the
                  top of the page, so this is the only ID visible once that
                  happens. Kept to 2 compact lines (not 3) and the row buffer
                  was trimmed (ROSTER_ROW_BUFFER, above) specifically to make
                  safe room for this without breaking the one-page print
                  guarantee — see globals.css .roster-card-footer rules. */}
              <div className="roster-card-footer mt-5 border-t-2 border-forest-900 pt-2">
                <p className="text-lg font-black text-forest-900">{offering.activity.name}</p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {offering.area.name} · Period {PERIOD_LABEL[offering.period]} · Staff:{" "}
                  <span className="font-black text-slate-900">{offering.staffAssignments.map((a) => staffLabel(a, showStaffLeaveDates)).join(", ") || "Unassigned"}</span>
                </p>
              </div>
            </article>
          );
        })}
          </div>
        </>
      )}
    </AppShell>
  );
}
