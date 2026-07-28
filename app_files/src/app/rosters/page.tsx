import { OutageStatus, Period, Prisma, RegistrationRole, RegistrationStatus, RosterChangeDirection, UserRole, WeekBlock } from "@prisma/client";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { camperPrintName } from "@/lib/camper-name";
import { prisma } from "@/lib/prisma";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { SubmitButton } from "@/components/confirm-submit-button";
import { markRosterReprinted, markRostersReprinted } from "./actions";
import { CAMPER_PERIODS, PERIOD_LABEL, TWILIGHT_PERIODS } from "@/lib/periods";
import { backfillUntrackedReprintFlags } from "@/lib/roster-reprint";
import { detroitNow } from "@/lib/period-times";
import { outageCampersOf, outageCoversPeriod } from "@/lib/outage-coverage";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rosters" };

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

// A blank roster for an UNLIMITED-capacity class has no natural row count
// (no rosterLimit to add a buffer to) - "just a full page" per Mike. Cut
// again (37 -> 34) after confirming rosters were STILL overflowing to a
// 2nd page even with the previous cut and a shrunk font/padding set at
// every tier (see globals.css) — real Chrome print rendering was coming
// in noticeably taller than the font-size × line-height math predicted,
// so this errs well on the safe side rather than a tight calculated fit.
const FULL_PAGE_BLANK_ROWS = 34;

// Extra blank rows appended after the actual roster limit/registration
// count, for late add-ons and walk-ins. Cut again (2 -> 1) for the same
// reason as FULL_PAGE_BLANK_ROWS above.
const ROSTER_ROW_BUFFER = 1;

const A_PERIODS = [Period.P1A, Period.P2A, Period.P3A, Period.P4A] as Period[];
const B_PERIODS = [Period.P1B, Period.P2B, Period.P3B, Period.P4B] as Period[];

// Number of blank attendance boxes printed on each roster. A fixed default
// Mike controls via the "Attendance boxes" selector (?days=), applied to both
// the real rosters and the generic blank sheets. (Was an 8-wide hardcode,
// then briefly a calendar-derived count that landed on 8 whenever the A/B
// calendar wasn't filled in — now just a predictable default.)
const DEFAULT_ATTENDANCE_COLUMNS = 6;
const MIN_ATTENDANCE_COLUMNS = 1;
const MAX_ATTENDANCE_COLUMNS = 12;

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
  tripDate?: string | string[];
  hideOut?: string | string[];
  days?: string | string[];
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

/** "OFF_CAMP" → "Off Camp" — same humanization Right Now uses for an
 * outage's reason when no manual title was set. */
function reasonLabel(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const weekBlockRank: Record<WeekBlock, number> = {
  [WeekBlock.WK1_2]: 1, [WeekBlock.WK3_4]: 2, [WeekBlock.WK5_6]: 3, [WeekBlock.WK7]: 4
};

function camperLeaveLabel(camper: { weekEnrollments?: { weekBlock: WeekBlock }[] | null }) {
  // Defensive ?? []: this runs on every camper on every sheet, so a caller
  // that reaches it without the weekEnrollments select loaded should print a
  // quiet blank, not 500 the whole rosters page.
  const lastWeek = (camper.weekEnrollments ?? []).reduce<WeekBlock | null>((latest, enrollment) => {
    if (!latest) return enrollment.weekBlock;
    return weekBlockRank[enrollment.weekBlock] > weekBlockRank[latest] ? enrollment.weekBlock : latest;
  }, null);
  // Only flag the exception: campers leaving BEFORE Wk 7. Through-Wk-7
  // campers stay quiet so departures pop on the printed sheet (matches
  // the registration cards' bold "Leaves after Wk N" treatment).
  if (!lastWeek || lastWeek === WeekBlock.WK7) return null;
  const lastWeekNumber: Record<WeekBlock, number> = {
    [WeekBlock.WK1_2]: 2, [WeekBlock.WK3_4]: 4, [WeekBlock.WK5_6]: 6, [WeekBlock.WK7]: 7
  };
  return `Leaves after Wk ${lastWeekNumber[lastWeek]}`;
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

  // Attendance-boxes override: an explicit ?days= wins over the calendar-
  // derived count for every roster on the page. Absent/blank ("Auto") leaves
  // it to the per-offering A/B-day derivation below.
  const daysRaw = asArray(params.days)[0];
  const requestedDays = daysRaw ? parseInt(daysRaw, 10) : NaN;
  const attendanceOverride = Number.isFinite(requestedDays)
    ? Math.min(MAX_ATTENDANCE_COLUMNS, Math.max(MIN_ATTENDANCE_COLUMNS, requestedDays))
    : null;
  const daysSelectValue = attendanceOverride != null ? String(attendanceOverride) : "";

  // "Who's left" lens: which day's outages should count against these
  // rosters, and whether to fold that day's out campers out of the
  // printed list entirely (vs. just flagging them in place). Defaults to
  // today (Detroit wall clock) and leaves everyone visible — so a Rosters
  // page nobody has touched yet looks exactly like it always has.
  const todayDateKey = detroitNow().dateKey;
  const tripDateRaw = asArray(params.tripDate)[0];
  const tripDate = tripDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(tripDateRaw) ? tripDateRaw : todayDateKey;
  const hideOutCampers = readToggle(params.hideOut, false);
  const tripDayStart = new Date(`${tripDate}T00:00:00.000Z`);
  const tripDayEnd = new Date(tripDayStart.getTime() + 24 * 60 * 60 * 1000);

  // Rosters needing reprint (flagged by an approved camper switch) — scoped
  // to the viewer's own area for Area Heads, all areas for Exec Admin, and
  // hidden entirely for anyone else (e.g. counselors).
  const canSeeReprintFlags = user.role === UserRole.EXECUTIVE_ADMIN || user.role === UserRole.AREA_HEAD;
  if (session && canSeeReprintFlags) {
    await backfillUntrackedReprintFlags(session.id);
  }
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
  const reprintByOffering = new Map<
    string,
    {
      activity: string;
      area: string;
      period: Period;
      changes: { camperId: string | null; camperName: string | null; direction: RosterChangeDirection | null; reason: string; requestedBy: string | null; decidedByName: string | null }[];
    }
  >();
  for (const flag of reprintFlags) {
    const change = {
      camperId: flag.camperId,
      camperName: flag.camperName,
      direction: flag.direction,
      reason: flag.reason,
      requestedBy: flag.requestedBy,
      decidedByName: flag.decidedByName
    };
    const existing = reprintByOffering.get(flag.offeringId);
    if (existing) {
      existing.changes.push(change);
    } else {
      reprintByOffering.set(flag.offeringId, {
        activity: flag.offering.activity.name,
        area: flag.offering.area.name,
        period: flag.offering.period,
        changes: [change]
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
        // NOT gated on showCamperLeaveDates. The Leave column is optional, but
        // the print footer's "Final wk: N of M" count runs camperLeaveLabel()
        // on every camper on every sheet regardless of that toggle -- gating
        // this select left camper.weekEnrollments undefined and took the whole
        // page down with a .reduce() on undefined. One enum column, at most
        // four rows per camper: cheap enough to always carry.
        // sessionId scope matches area-staffing.ts / athletics-assignments.ts /
        // waterfront: without it a returning camper's prior-session week rows
        // count toward "last week here," so a camper with no current-session
        // enrollment would print a departure here while final-week-sizes counts
        // them as staying.
        weekEnrollments: { where: { sessionId: session?.id }, select: { weekBlock: true }, orderBy: { weekBlock: "asc" as const } }
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
            // Same gate as the duty sheets and the Scream board: only active,
            // scream-eligible staff. Otherwise the copied-from-Q2 assignments
            // for deactivated / removed-from-Scream staff show on the roster's
            // "Staff:" line just like they did on Waterfront.
            staffAssignments: { where: { staff: { active: true, screamEligible: true } }, include: { staff: { select: { id: true, firstName: true, lastName: true, employmentEnd: true } } } },
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

  // Attendance boxes per roster. A fixed default (see DEFAULT_ATTENDANCE_
  // COLUMNS) that Mike controls with the "Attendance boxes" selector, rather
  // than deriving from the calendar — the derive surprised more than it
  // helped (it silently landed on 8 whenever the A/B calendar wasn't filled
  // in). Explicit ?days= override always wins; same value drives both the
  // real rosters and the generic blank sheets.
  const attendanceColumnsFor = (_period: Period): number => attendanceOverride ?? DEFAULT_ATTENDANCE_COLUMNS;
  const genericAttendanceColumns = attendanceOverride ?? DEFAULT_ATTENDANCE_COLUMNS;

  // "Who's left" lens: active outages (trips, infirmary, off-camp, etc.)
  // covering the selected day, so each roster card can show who's
  // actually still around vs. away — real logged outages, not the
  // hypothetical whole-unit subtraction Trip Planner does. Skipped for
  // blank rosters (no camper names print there anyway) and generic mode
  // (not tied to any real offering).
  const outagesForTripDate = session && !blankRosters && !genericMode
    ? await prisma.outage.findMany({
        where: { sessionId: session.id, status: OutageStatus.ACTIVE, startDate: { lt: tripDayEnd }, endDate: { gte: tripDayStart } },
        include: {
          campers: { include: { camper: { select: { id: true, firstName: true, lastName: true } } } },
          camper: { select: { id: true, firstName: true, lastName: true } }
        },
        orderBy: { startDate: "asc" }
      })
    : [];

  // Per-offering set of camper IDs covered by an outage for THIS
  // offering's specific period (an outage limited to certain periods only
  // pulls campers out of those periods' classes, not the whole day).
  const outCamperIdsByOffering = new Map<string, Set<string>>();
  const outageLabelsByOffering = new Map<string, string[]>();
  for (const offering of offerings) {
    const coveringOutages = outagesForTripDate.filter((o) => outageCoversPeriod(o, offering.period));
    if (!coveringOutages.length) continue;
    const ids = new Set(coveringOutages.flatMap((o) => outageCampersOf(o).map((c) => c.id)));
    if (ids.size) {
      outCamperIdsByOffering.set(offering.id, ids);
      outageLabelsByOffering.set(offering.id, coveringOutages.map((o) => o.manualTitle || reasonLabel(o.reason)));
    }
  }
  const outageDayTotalCampers = new Set(outagesForTripDate.flatMap((o) => outageCampersOf(o).map((c) => c.id))).size;

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
      {/* Force portrait for the roster print job in EVERY browser. The
          site-wide default @page is landscape; rosters used a CSS *named*
          page to flip to portrait, but Safari/WebKit ignores named pages
          and printed them landscape (overflowing/clipping the sheet) while
          Chrome was fine. This plain un-named @page overrides the default in
          the cascade, so Safari's direct Print (Cmd+P) now gets portrait
          too; the "Print rosters" button reinforces it via head injection. */}
      <style
        dangerouslySetInnerHTML={{
          __html: "@media print { @page { size: letter portrait; margin: 0.3in; } }"
        }}
      />
      <div className="no-print">
        <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
          <PrintButton label="Print rosters" pageOrientation="portrait" />
        </PageHeader>
      </div>

      {reprintOfferingIds.length > 0 && (
        <div className="no-print mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-amber-900">
              {reprintOfferingIds.length} roster{reprintOfferingIds.length === 1 ? "" : "s"} need reprinting — recent switches or camper info changes affect who&rsquo;s on them.
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

      {outageDayTotalCampers > 0 && (
        <div className="no-print mb-5 rounded-xl border border-lake-200 bg-lake-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-lake-900">
              {outageDayTotalCampers} camper{outageDayTotalCampers === 1 ? "" : "s"} logged out on {tripDate === todayDateKey ? "today's" : "this day's"} outages — rosters below show who&rsquo;s actually left in each class.
            </p>
            <a className="rounded-md border border-lake-400 bg-white px-3 py-1.5 text-sm font-black text-lake-900 hover:bg-lake-100" href="/outages">
              Open Outages
            </a>
          </div>
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
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                Attendance boxes
                <select className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" name="days" defaultValue={daysSelectValue}>
                  <option value="">Default ({DEFAULT_ATTENDANCE_COLUMNS})</option>
                  {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <span className="text-xs font-semibold text-slate-400">
                Blank attendance boxes on each roster. Applies to the generic sheets too.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-forest-700 px-2.5 py-0.5 text-xs font-black text-white">{visibleOfferings.length} roster{visibleOfferings.length !== 1 ? "s" : ""}</span>
              )}
              <a className={secondaryButtonClass} href="/rosters">Reset</a>
            </div>
          </div>

          {/* Who's left lens: which day's outages count against these
           * rosters, and whether to fold out-campers out of the printed
           * list entirely or just flag them in place. Has no effect for
           * blank rosters or generic mode (see the query above). */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400 mr-1">Who&rsquo;s left</span>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              Outage day
              <input className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" name="tripDate" type="date" defaultValue={tripDate} />
            </label>
            <label className="cursor-pointer">
              <input name="hideOut" type="hidden" value="hide" />
              <input className="peer sr-only" defaultChecked={hideOutCampers} name="hideOut" type="checkbox" value="show" />
              <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold transition peer-checked:border-red-600 peer-checked:bg-red-50 peer-checked:text-red-800">Hide campers who are out (print just who&rsquo;s left)</span>
            </label>
            <span className="text-xs font-semibold text-slate-400">Cross-references active Outages for the selected day — trips, infirmary, off-camp, etc.</span>
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
        <div className="grid gap-6 roster-print-list">
          {Array.from({ length: genericCount }).map((_, sheetIndex) => {
            const rosterSizeClass = genericRows <= 16 ? "roster-size-lg" : genericRows <= 24 ? "roster-size-md" : genericRows <= 30 ? "roster-size-sm" : "roster-size-xs";
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
                    <tr className="bg-slate-200 text-slate-900">
                      <th className="roster-col-num w-8 border border-forest-900 p-2 font-black">#</th>
                      <th className="border border-forest-900 p-2 text-left font-black">Name</th>
                      <th className="w-16 border border-forest-900 p-2 text-left font-black">Cabin</th>
                      {Array.from({ length: genericAttendanceColumns }, (_, i) => i + 1).map((day) => <th key={day} className="roster-col-day w-8 border border-forest-900 p-2 font-black">{day}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: genericRows }).map((_, index) => (
                      <tr key={index}>
                        <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                        <td className="border border-slate-300 p-2">&nbsp;</td>
                        {Array.from({ length: genericAttendanceColumns }, (_, i) => i + 1).map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="roster-card-footer mt-5 border-t-2 border-slate-400 pt-2 text-center">
                  <p className="flex flex-wrap items-baseline justify-center gap-2 text-lg font-bold text-forest-900">
                    Activity: {blankLine("3in")}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline justify-center gap-2 text-sm text-slate-500">
                    <span>Area: {blankLine("1.4in")}</span>
                    <span className="font-black text-forest-900">Period: {blankLine("0.8in", true)}</span>
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

          <div className="grid gap-6 roster-print-list">
            {offerings.map((offering) => {
          const camperRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.CAMPER);
          // How many of this class's campers are still here for the final week.
          // Uses camperLeaveLabel() -- this page's own copy of the shared
          // departure rule, and the same one the Leave column prints -- so the
          // footer number and the per-camper labels above it can never contradict
          // each other on the same sheet.
          const finalWeekCamperCount = camperRegistrations.filter((r) => camperLeaveLabel(r.camper) === null).length;
          const assistantRegistrations = offering.registrations.filter((r) => r.registrationRole === RegistrationRole.TEACHING_ASSISTANT);
          const isTwilight = TWILIGHT_PERIODS.includes(offering.period);
          const hasNoRegistrations = camperRegistrations.length === 0 && assistantRegistrations.length === 0;
          const attendanceCols = attendanceColumnsFor(offering.period);
          const attendanceDays = Array.from({ length: attendanceCols }, (_, i) => i + 1);

          // Who's left: cross-reference this offering's own registrations
          // against the outages covering its period on the selected day.
          // The roster itself is never mutated by this — hideOutCampers
          // only changes what gets PRINTED, so the underlying registration
          // list (and every row-count/page-fit calculation below) still
          // starts from the full count and only narrows deliberately.
          const outCamperIds = outCamperIdsByOffering.get(offering.id) ?? null;
          const outageLabels = outageLabelsByOffering.get(offering.id) ?? [];
          const outCamperCount = outCamperIds ? camperRegistrations.filter((r) => outCamperIds.has(r.camper.id)).length : 0;
          const displayedCamperRegistrations = hideOutCampers && outCamperIds
            ? camperRegistrations.filter((r) => !outCamperIds.has(r.camper.id))
            : camperRegistrations;
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
            : Math.max(displayedCamperRegistrations.length, offering.rosterLimit ?? 12) + ROSTER_ROW_BUFFER;
          // Blank rosters print without the Teaching Assistants block or the
          // live digital waitlist — a printed blank waitlist section takes
          // its place below when the class has waitlisting turned on.
          const taOverhead = !blankRosters && assistantRegistrations.length > 0 ? 1 + assistantRegistrations.length : 0;
          const blankWaitlistRows = 5;
          const waitlistOverhead = blankRosters && offering.allowWaitlist ? blankWaitlistRows + 2 : 0;
          // Recent camper adds/removes for this offering (Option B: a small
          // "NEW" marker on the affected row plus one compact footnote line
          // below the table — see roster-reprint.ts). Folded into the row
          // budget below since the footnote costs real vertical space, but
          // only when it's actually present (most rosters have none).
          //
          // Both this and the outage badge below are capped to a single
          // print line via CSS (white-space: nowrap + text-overflow:
          // ellipsis in globals.css) specifically so this "1 row" budget
          // is actually true regardless of how many changes/outages there
          // are — an uncapped multi-line footnote or badge was quietly
          // blowing past its assumed height and was the real cause of
          // rosters spilling onto extra pages that should've been one.
          const offeringChanges = !blankRosters ? (reprintByOffering.get(offering.id)?.changes ?? []) : [];
          const addedCamperIds = new Set(
            offeringChanges.filter((change) => change.direction === RosterChangeDirection.ADDED && change.camperId).map((change) => change.camperId)
          );
          const changeFootnoteOverhead = offeringChanges.length > 0 ? 1 : 0;
          // The "who's left" outage badge in the header (added alongside the
          // outage lens feature) was never folded into this budget at all —
          // same single-line cap and same treatment as the change footnote.
          const outageBadgeOverhead = !blankRosters && outCamperCount > 0 ? 1 : 0;
          const totalBodyRows = rosterRowCount + taOverhead + waitlistOverhead + changeFootnoteOverhead + outageBadgeOverhead;
          const rosterSizeClass = totalBodyRows <= 16 ? "roster-size-lg" : totalBodyRows <= 24 ? "roster-size-md" : totalBodyRows <= 30 ? "roster-size-sm" : "roster-size-xs";
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
                <div className="roster-card-header-right text-right">
                  <CapacityPill count={blankRosters ? 0 : camperRegistrations.length} limit={offering.rosterLimit} limitType={offering.limitType} />
                  {!blankRosters && outCamperCount > 0 ? (
                    <p className="roster-outage-badge mt-1.5">
                      <Badge tone="red">
                        {outCamperCount} out{outageLabels.length ? ` — ${outageLabels.join(", ")}` : ""} → {camperRegistrations.length - outCamperCount} left
                      </Badge>
                    </p>
                  ) : null}
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
                  <tr className="bg-slate-200 text-slate-900">
                    <th className="roster-col-num w-8 border border-forest-900 p-2 font-black">#</th>
                    <th className="border border-forest-900 p-2 text-left font-black">Name</th>
                    <th className="w-16 border border-forest-900 p-2 text-left font-black">Cabin</th>
                    {attendanceDays.map((day) => <th key={day} className="roster-col-day w-8 border border-forest-900 p-2 font-black">{day}</th>)}
                    {showCamperLeaveDates ? <th className="w-20 border border-forest-900 p-2 text-left font-black">Leave</th> : null}
                    {showAllergies ? <th className="w-28 border border-forest-900 p-2 text-left font-black">Allergies / notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rosterRowCount }).map((_, index) => {
                    const registration = blankRosters ? undefined : displayedCamperRegistrations[index];
                    const isRecentlyAdded = Boolean(registration && addedCamperIds.has(registration.camper.id));
                    const isOut = Boolean(registration && outCamperIds?.has(registration.camper.id));
                    return (
                      <tr key={registration?.id ?? `blank-${index}`}>
                        <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                        <td className={`border border-slate-300 p-2 ${isOut ? "text-slate-400 line-through" : ""}`}>
                          {registration ? camperPrintName(registration.camper) : ""}
                          {isRecentlyAdded ? (
                            <span className="roster-new-marker ml-1.5 rounded bg-green-100 px-1 py-0.5 align-middle text-[0.65rem] font-black uppercase tracking-wide text-green-800">
                              New
                            </span>
                          ) : null}
                          {isOut ? (
                            <span className="roster-new-marker ml-1.5 rounded bg-red-100 px-1 py-0.5 align-middle text-[0.65rem] font-black uppercase tracking-wide text-red-700">
                              Out
                            </span>
                          ) : null}
                        </td>
                        <td className="border border-slate-300 p-2">{registration?.camper.cabin?.name ?? ""}</td>
                        {attendanceDays.map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                        {showCamperLeaveDates ? <td className="roster-leave-cell border border-slate-300 p-2 text-xs">{registration && camperLeaveLabel(registration.camper) ? <span className="roster-leave-label font-black text-forest-900 underline decoration-2 underline-offset-2">{camperLeaveLabel(registration.camper)}</span> : "\u00a0"}</td> : null}
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
                      <td className="border border-slate-300 p-2 font-black">
                        {camperPrintName(registration.camper)}
                        {addedCamperIds.has(registration.camper.id) ? (
                          <span className="roster-new-marker ml-1.5 rounded bg-green-100 px-1 py-0.5 align-middle text-[0.65rem] font-black uppercase tracking-wide text-green-800">
                            New
                          </span>
                        ) : null}
                      </td>
                      <td className="border border-slate-300 p-2">{registration.camper.cabin?.name ?? ""}</td>
                      {attendanceDays.map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      {showCamperLeaveDates ? <td className="roster-leave-cell border border-slate-300 p-2 text-xs">{camperLeaveLabel(registration.camper) ? <span className="roster-leave-label font-black text-forest-900 underline decoration-2 underline-offset-2">{camperLeaveLabel(registration.camper)}</span> : "\u00a0"}</td> : null}
                      {showAllergies ? <td className="border border-slate-300 p-2 align-top text-xs leading-snug">Teaching assistant{registration.camper.allergies?.length ? `; ${registration.camper.allergies.map((a) => a.allergyLabel.name).join(", ")}` : ""}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>

              {offeringChanges.length ? (
                <p className="roster-change-footnote mt-1.5 text-xs text-slate-500">
                  <span className="font-black uppercase tracking-wide text-slate-600">Recent changes: </span>
                  {offeringChanges.map((change, index) => (
                    <span key={index}>
                      {index > 0 ? " · " : ""}
                      {change.camperName ? (
                        change.direction === RosterChangeDirection.UPDATED ? (
                          <span className="font-bold text-lake-700">{change.reason || `${change.camperName} info updated`}</span>
                        ) : (
                          <span className={change.direction === RosterChangeDirection.ADDED ? "font-bold text-green-800" : "font-bold text-red-700"}>
                            {change.camperName} {change.direction === RosterChangeDirection.ADDED ? "added" : "removed"}
                          </span>
                        )
                      ) : (
                        <span className="italic text-slate-400">A camper was added or removed before this detail was tracked</span>
                      )}
                      {change.requestedBy || change.decidedByName
                        ? ` (${[change.requestedBy ? `requested by ${change.requestedBy}` : null, change.decidedByName ? `approved by ${change.decidedByName}` : null].filter(Boolean).join(", ")})`
                        : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              {blankRosters ? (
                offering.allowWaitlist ? (
                  <div className="waitlist-section mt-3 rounded-md border border-amber-300 bg-white p-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Waitlist</p>
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-amber-100 text-amber-900">
                          <th className="roster-col-num w-8 border border-amber-300 p-1.5">#</th>
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
              <div className="roster-card-footer mt-5 border-t-2 border-forest-900 pt-2 text-center">
                <p className="text-lg font-black text-forest-900">{offering.activity.name}</p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {offering.area.name} · <span className="font-black text-forest-900">Period {PERIOD_LABEL[offering.period]}</span> · Staff:{" "}
                  <span className="font-black text-slate-900">{offering.staffAssignments.map((a) => staffLabel(a, showStaffLeaveDates)).join(", ") || "Unassigned"}</span>
                  {!blankRosters && camperRegistrations.length > 0 && finalWeekCamperCount !== camperRegistrations.length ? (
                    <>
                      {" · "}
                      <span className="roster-footer-final-week font-black text-forest-900">
                        Final wk: {finalWeekCamperCount} of {camperRegistrations.length}
                      </span>
                    </>
                  ) : null}
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
