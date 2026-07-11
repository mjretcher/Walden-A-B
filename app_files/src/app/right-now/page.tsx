import Link from "next/link";
import { AlertTriangle, Clock, MapPin, Radio, UserRound, Users } from "lucide-react";
import { AttendanceMark, OutageStatus, Period, RegistrationRole, RegistrationStatus, SessionDayType, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { AutoLiveRefresh } from "@/components/live-refresh";
import { Badge, PageHeader, Panel, SectionHeader } from "@/components/ui";
import { UnitGenderTable } from "@/components/unit-gender-table";
import { requireUser } from "@/lib/auth";
import { tallyByUnitAndGender } from "@/lib/camper-breakdown";
import { readStringArray } from "@/lib/local-arrays";
import { PERIOD_LABEL } from "@/lib/periods";
import { DayHalf, detectCurrentSlot, detroitNow, getSlotTimes, periodSlot, slotToPeriod } from "@/lib/period-times";
import { prisma } from "@/lib/prisma";
import { RightNowPersonSearch } from "./person-search";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Right Now" };

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

/**
 * The Right Now command center answers camp's most primal question —
 * "where is this person right now?" — plus the camp-wide version of it:
 * for the current period, where is EVERYONE, and who has no known
 * placement at all. Every ingredient already existed in the app
 * (registrations, outages, staff assignments, off-periods, cabins,
 * attendance, the A/B calendar); this page is the first thing that joins
 * them into one answer.
 *
 * Time handling: the current period is auto-detected from Detroit wall
 * clock (lib/period-times.ts) + today's A/B calendar day. Both are always
 * manually overridable via the pills, so a special-schedule day never
 * makes the page useless. This is also the first consumer of the
 * SessionCalendarDay table the 2026 seed script populated.
 */

function outageCoversPeriod(outage: { fullDay: boolean; periods: string | null }, period: Period): boolean {
  if (outage.fullDay) return true;
  const list = readStringArray(outage.periods);
  return list.length === 0 || list.includes(period);
}

const MARK_LABEL: Record<AttendanceMark, string> = {
  [AttendanceMark.PRESENT]: "Marked present",
  [AttendanceMark.ABSENT]: "Marked ABSENT",
  [AttendanceMark.EXCUSED]: "Marked excused",
  [AttendanceMark.NOT_EXPECTED]: "Not expected",
  [AttendanceMark.LATE]: "Marked late"
};

export default async function RightNowPage({
  searchParams
}: {
  searchParams?: Promise<{ period?: string; day?: string; camperId?: string; staffId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const params = searchParams ? await searchParams : {};

  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Right Now" eyebrow="Command Center" description="No active session." />
      </AppShell>
    );
  }

  // ---- What time / day / period is it? -----------------------------------
  const now = detroitNow();
  const dayStart = new Date(`${now.dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [calendarDay, slotTimes] = await Promise.all([
    prisma.sessionCalendarDay.findFirst({
      where: { sessionId: session.id, date: { gte: dayStart, lt: dayEnd } },
      select: { dayType: true, notes: true }
    }),
    getSlotTimes()
  ]);

  const calendarHalf: DayHalf | null =
    calendarDay?.dayType === SessionDayType.A ? "A" : calendarDay?.dayType === SessionDayType.B ? "B" : null;
  const overrideHalf: DayHalf | null = params.day === "A" ? "A" : params.day === "B" ? "B" : null;
  const dayHalf: DayHalf = overrideHalf ?? calendarHalf ?? "A";
  const nonClassDay =
    calendarDay &&
    calendarDay.dayType !== SessionDayType.A &&
    calendarDay.dayType !== SessionDayType.B;

  const detected = detectCurrentSlot(now.minutes, slotTimes);
  const overridePeriod =
    params.period && Object.keys(PERIOD_LABEL).includes(params.period) ? (params.period as Period) : null;
  const period: Period = overridePeriod ?? slotToPeriod(detected.slot, dayHalf);
  const slot = periodSlot(period);
  const isTwilight = slot === 5;
  const autoDetected = !overridePeriod;

  // ---- Camp-wide picture for this period ----------------------------------
  const [offerings, activeCampers, registeredThisPeriod, outagesNow, offPeriods] = await Promise.all([
    prisma.activityOffering.findMany({
      where: { sessionId: session.id, period, active: true, area: { active: true }, activity: { active: true } },
      include: {
        activity: { select: { name: true } },
        area: { select: { id: true, name: true } },
        staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } },
        registrations: {
          where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } },
          select: { camper: { select: { unit: true, gender: true } } }
        }
      },
      orderBy: [{ area: { name: "asc" } }, { activity: { name: "asc" } }]
    }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      select: { id: true, firstName: true, lastName: true, counselorAssistant: true, cabin: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.registration.findMany({
      where: { sessionId: session.id, period, status: { in: activeRegistration }, registrationRole: RegistrationRole.CAMPER },
      select: { camperId: true }
    }),
    prisma.outage.findMany({
      where: { sessionId: session.id, status: OutageStatus.ACTIVE, startDate: { lt: dayEnd }, endDate: { gte: dayStart } },
      include: {
        campers: { include: { camper: { select: { id: true, firstName: true, lastName: true } } } },
        staffLinks: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } }
      },
      orderBy: { startDate: "asc" }
    }),
    prisma.staffOffPeriod.count({ where: { sessionId: session.id, period } })
  ]);

  const outagesCoveringPeriod = outagesNow.filter((o) => outageCoversPeriod(o, period));
  const outCamperIds = new Set(outagesCoveringPeriod.flatMap((o) => o.campers.map((c) => c.camper.id)));
  const registeredIds = new Set(registeredThisPeriod.map((r) => r.camperId));

  // The safety number: active campers with NO registration this period and
  // NOT covered by any outage — nobody's paperwork says where they are.
  const unplacedCampers = isTwilight
    ? []
    : activeCampers.filter((c) => !registeredIds.has(c.id) && !outCamperIds.has(c.id));

  const areas = new Map<string, { name: string; offerings: typeof offerings }>();
  for (const offering of offerings) {
    if (!areas.has(offering.area.id)) areas.set(offering.area.id, { name: offering.area.name, offerings: [] });
    areas.get(offering.area.id)!.offerings.push(offering);
  }
  const areaList = Array.from(areas.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalInClass = offerings.reduce((sum, o) => sum + o.registrations.length, 0);
  const totalOnOutage = outCamperIds.size;
  const unitGenderRows = areaList.map((area) => ({
    label: area.name,
    tally: tallyByUnitAndGender(area.offerings.flatMap((o) => o.registrations.map((r) => r.camper)))
  }));

  // ---- "Where is X right now?" person card --------------------------------
  let personCard: React.ReactNode = null;
  let selectedName: string | null = null;

  if (params.camperId) {
    const camper = await prisma.camper.findUnique({
      where: { id: params.camperId },
      include: { cabin: { select: { name: true } } }
    });
    if (camper) {
      selectedName = `${camper.firstName} ${camper.lastName}`;
      const [registration, camperOutages, attendance] = await Promise.all([
        prisma.registration.findFirst({
          where: { sessionId: session.id, camperId: camper.id, period, status: { in: activeRegistration }, registrationRole: RegistrationRole.CAMPER },
          include: {
            offering: {
              include: {
                activity: { select: { name: true } },
                area: { select: { name: true } },
                staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } }
              }
            }
          }
        }),
        prisma.outage.findMany({
          where: {
            sessionId: session.id,
            status: OutageStatus.ACTIVE,
            startDate: { lt: dayEnd },
            endDate: { gte: dayStart },
            campers: { some: { camperId: camper.id } }
          },
          include: { staffLinks: { include: { staff: { select: { firstName: true, lastName: true } } } } }
        }),
        prisma.attendanceRecord.findFirst({
          where: { sessionId: session.id, camperId: camper.id, date: { gte: dayStart, lt: dayEnd } },
          orderBy: { updatedAt: "desc" },
          include: { offering: { include: { activity: { select: { name: true } } } } }
        })
      ]);
      const outageHere = camperOutages.find((o) => outageCoversPeriod(o, period)) ?? null;

      personCard = (
        <Panel className="border-forest-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Camper{camper.counselorAssistant ? " · CA" : ""}</p>
              <h2 className="text-2xl font-black text-forest-900">{camper.firstName} {camper.lastName}</h2>
              <p className="text-sm font-bold text-slate-600">{camper.cabin ? `Cabin ${camper.cabin.name}` : "No cabin assigned"}</p>
            </div>
            <Badge tone={outageHere ? "amber" : registration ? "green" : isTwilight ? "blue" : "red"}>
              {outageHere ? "Off program" : registration ? `In class · ${PERIOD_LABEL[period]}` : isTwilight ? "Twilight" : "No placement"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3">
            {outageHere ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="h-4 w-4" />{outageHere.manualTitle || outageHere.reason}</p>
                {outageHere.location ? <p className="mt-1 text-sm font-bold text-amber-800">Location: {outageHere.location}</p> : null}
                {outageHere.staffLinks.length ? (
                  <p className="mt-1 text-sm font-semibold text-amber-800">
                    With: {outageHere.staffLinks.map((l) => `${l.staff.firstName} ${l.staff.lastName}`).join(", ")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {outageHere.fullDay ? "All day" : `Periods: ${readStringArray(outageHere.periods).join(", ") || "all"}`} · <Link className="underline" href="/outages">Open in Outages</Link>
                </p>
              </div>
            ) : null}

            {registration ? (
              <div className={`rounded-lg border p-4 ${outageHere ? "border-slate-200 bg-slate-50" : "border-forest-300 bg-forest-50"}`}>
                {outageHere ? <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Normally scheduled</p> : null}
                <p className="flex items-center gap-2 font-black text-forest-900"><MapPin className="h-4 w-4" />{registration.offering.activity.name}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-700">{registration.offering.area.name} · Period {PERIOD_LABEL[period]}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Staffed by: {registration.offering.staffAssignments.length ? registration.offering.staffAssignments.map((a) => `${a.staff.firstName} ${a.staff.lastName}`).join(", ") : "nobody assigned yet"}
                </p>
              </div>
            ) : !outageHere && !isTwilight ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4">
                <p className="flex items-center gap-2 font-black text-red-900"><AlertTriangle className="h-4 w-4" />No active registration for period {PERIOD_LABEL[period]} and no outage covering it.</p>
                <p className="mt-1 text-sm font-semibold text-red-800">Nobody's paperwork says where this camper should be right now.</p>
              </div>
            ) : null}

            {isTwilight && !outageHere ? (
              <div className="rounded-lg border border-lake-200 bg-lake-50 p-4">
                <p className="font-black text-lake-900">Twilight period — campers are with their cabins / evening programming.</p>
                <p className="mt-0.5 text-sm font-bold text-lake-800">{camper.cabin ? `Cabin ${camper.cabin.name}` : "No cabin on record."}</p>
              </div>
            ) : null}

            {attendance ? (
              <p className={`text-sm font-bold ${attendance.mark === AttendanceMark.ABSENT ? "text-red-700" : "text-slate-600"}`}>
                <Clock className="mr-1 inline h-4 w-4" />
                Attendance today: {MARK_LABEL[attendance.mark]} at {attendance.offering.activity.name}
                {attendance.note ? ` — “${attendance.note}”` : ""}
              </p>
            ) : null}
          </div>
        </Panel>
      );
    }
  } else if (params.staffId) {
    const staff = await prisma.staff.findUnique({
      where: { id: params.staffId },
      select: { id: true, firstName: true, lastName: true, position: true, position2: true }
    });
    if (staff) {
      selectedName = `${staff.firstName} ${staff.lastName}`;
      const [assignment, offPeriod, staffOutages, cabinAssignment] = await Promise.all([
        prisma.staffAssignment.findUnique({
          where: { staffId_sessionId_period: { staffId: staff.id, sessionId: session.id, period } },
          include: { offering: { include: { activity: { select: { name: true } }, area: { select: { name: true } } } } }
        }),
        prisma.staffOffPeriod.findUnique({
          where: { staffId_sessionId_period: { staffId: staff.id, sessionId: session.id, period } },
          select: { id: true }
        }),
        prisma.outage.findMany({
          where: {
            sessionId: session.id,
            status: OutageStatus.ACTIVE,
            startDate: { lt: dayEnd },
            endDate: { gte: dayStart },
            staffLinks: { some: { staffId: staff.id } }
          },
          include: { staffLinks: { where: { staffId: staff.id }, select: { phone: true } } }
        }),
        prisma.cabinStaffAssignment.findUnique({
          where: { staffId_sessionId: { staffId: staff.id, sessionId: session.id } },
          include: { cabin: { select: { name: true } } }
        })
      ]);
      const outageHere = staffOutages.find((o) => outageCoversPeriod(o, period)) ?? null;

      personCard = (
        <Panel className="border-lake-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Staff{staff.position ? ` · ${staff.position}` : ""}</p>
              <h2 className="text-2xl font-black text-forest-900">{staff.firstName} {staff.lastName}</h2>
              <p className="text-sm font-bold text-slate-600">{cabinAssignment ? `Cabin ${cabinAssignment.cabin.name}` : "No cabin assignment"}</p>
            </div>
            <Badge tone={outageHere ? "amber" : assignment ? "green" : offPeriod ? "blue" : "neutral"}>
              {outageHere ? "Off camp / outage" : assignment ? `Teaching · ${PERIOD_LABEL[period]}` : offPeriod ? "Off period" : "Unassigned"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3">
            {outageHere ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="h-4 w-4" />{outageHere.manualTitle || outageHere.reason}</p>
                {outageHere.location ? <p className="mt-1 text-sm font-bold text-amber-800">Location: {outageHere.location}</p> : null}
                {outageHere.staffLinks[0]?.phone ? <p className="mt-1 text-sm font-bold text-amber-800">Trip phone: {outageHere.staffLinks[0].phone}</p> : null}
              </div>
            ) : null}
            {assignment ? (
              <div className={`rounded-lg border p-4 ${outageHere ? "border-slate-200 bg-slate-50" : "border-lake-300 bg-lake-50"}`}>
                {outageHere ? <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Normally scheduled</p> : null}
                <p className="flex items-center gap-2 font-black text-forest-900"><MapPin className="h-4 w-4" />{assignment.offering.activity.name}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-700">{assignment.offering.area.name} · Period {PERIOD_LABEL[period]}{assignment.role ? ` · ${assignment.role}` : ""}</p>
              </div>
            ) : null}
            {!assignment && !outageHere && !offPeriod ? (
              <p className="text-sm font-bold text-slate-500">No scream session assignment, off-period, or outage on record for {PERIOD_LABEL[period]}.</p>
            ) : null}
            {offPeriod && !assignment && !outageHere ? (
              <p className="text-sm font-bold text-lake-800">Scheduled off period — not expected at an activity.</p>
            ) : null}
          </div>
        </Panel>
      );
    }
  }

  const dayLabel = calendarDay ? calendarDay.dayType : "no calendar entry";

  return (
    <AppShell user={user}>
      <PageHeader
        title="Right Now"
        eyebrow={`Command Center · ${session.name}`}
        description="Where is everyone at this moment — one search away. Auto-detects the current period from the clock and the A/B calendar."
      >
        <AutoLiveRefresh intervalMs={30000} />
      </PageHeader>

      {/* Period & day controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-black text-slate-700"><Clock className="h-4 w-4" />{now.timeLabel} at camp</span>
        <span className="text-slate-300">·</span>
        <span className="text-sm font-bold text-slate-600">Today: {String(dayLabel)} day{calendarDay?.notes ? ` — ${calendarDay.notes}` : ""}</span>
        {nonClassDay ? <Badge tone="amber">Non-class day — pick the schedule manually</Badge> : null}
        {!calendarDay ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700">
            No A/B calendar entry for today — assuming {dayHalf}.
            <Link className="underline" href={`/right-now?day=${dayHalf === "A" ? "B" : "A"}`}>Switch to {dayHalf === "A" ? "B" : "A"}</Link>
          </span>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => {
          const p = slotToPeriod(s, dayHalf);
          const active = p === period;
          const times = slotTimes[s];
          return (
            <Link
              key={p}
              href={`/right-now?period=${p}${params.day ? `&day=${params.day}` : ""}${params.camperId ? `&camperId=${params.camperId}` : ""}${params.staffId ? `&staffId=${params.staffId}` : ""}`}
              className={`inline-flex min-h-10 flex-col items-center justify-center rounded-lg border px-4 py-1 text-sm font-black ${active ? "border-forest-600 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-forest-50"}`}
            >
              <span>{PERIOD_LABEL[p]}{s === 5 ? " · Twilight" : ""}</span>
              <span className={`text-[10px] font-bold ${active ? "text-forest-100" : "text-slate-400"}`}>{times.label}</span>
            </Link>
          );
        })}
        {autoDetected ? (
          <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-bold text-green-700"><Radio className="h-3.5 w-3.5" />{detected.inProgress ? "In progress — auto-detected" : detected.note}</span>
        ) : (
          <Link className="ml-1 text-xs font-bold text-lake-700 underline" href={`/right-now${params.camperId ? `?camperId=${params.camperId}` : params.staffId ? `?staffId=${params.staffId}` : ""}`}>Back to auto</Link>
        )}
      </div>

      {/* Person lookup */}
      <div className="mb-6">
        <RightNowPersonSearch selectedName={selectedName} />
      </div>

      {personCard ? <div className="mb-6">{personCard}</div> : null}

      {/* Camp-wide numbers */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberCard icon={<Users />} value={totalInClass} label="Campers in class" detail={`Period ${PERIOD_LABEL[period]}`} tone="green" />
        <NumberCard icon={<AlertTriangle />} value={totalOnOutage} label="Off program" detail="On an outage covering now" tone="amber" />
        <NumberCard icon={<UserRound />} value={offPeriods} label="Staff off period" detail={`Period ${PERIOD_LABEL[period]}`} tone="blue" />
        <NumberCard icon={<AlertTriangle />} value={unplacedCampers.length} label="No known placement" detail={isTwilight ? "N/A during Twilight" : "No class, no outage"} tone={unplacedCampers.length > 0 ? "red" : "green"} />
      </section>

      {/* By unit & gender */}
      {!isTwilight && unitGenderRows.length > 0 ? (
        <Panel className="mb-6">
          <SectionHeader title="By unit & gender" detail={`Period ${PERIOD_LABEL[period]} · who's actually in class right now, area by area`} />
          <UnitGenderTable rows={unitGenderRows} />
        </Panel>
      ) : null}

      {/* The safety panel */}
      {!isTwilight && unplacedCampers.length > 0 ? (
        <Panel className="mb-6 border-red-300">
          <SectionHeader title={`No known placement — ${unplacedCampers.length} camper${unplacedCampers.length === 1 ? "" : "s"}`} detail="Active this session, but no registration for this period and no outage covering it." />
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-black text-red-800">Show names</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {unplacedCampers.map((c) => (
                <li key={c.id} className="text-sm font-bold text-slate-800">
                  <Link className="hover:underline" href={`/right-now?camperId=${c.id}${overridePeriod ? `&period=${overridePeriod}` : ""}`}>
                    {c.lastName}, {c.firstName}
                  </Link>
                  <span className="text-slate-400"> {c.cabin ? `· ${c.cabin.name}` : ""}{c.counselorAssistant ? " · CA" : ""}</span>
                </li>
              ))}
            </ul>
          </details>
        </Panel>
      ) : null}

      {/* Outages happening now */}
      {outagesCoveringPeriod.length > 0 ? (
        <Panel className="mb-6">
          <SectionHeader title="Off program right now" detail={`${outagesCoveringPeriod.length} outage${outagesCoveringPeriod.length === 1 ? "" : "s"} covering this period`} />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {outagesCoveringPeriod.map((o) => (
              <div key={o.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-black text-amber-900">{o.manualTitle || o.reason}{o.location ? ` — ${o.location}` : ""}</p>
                <p className="mt-1 text-sm font-semibold text-amber-800">
                  {o.campers.length} camper{o.campers.length === 1 ? "" : "s"}{o.staffLinks.length ? ` · with ${o.staffLinks.map((l) => l.staff.lastName).join(", ")}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* Where every class is */}
      {isTwilight ? (
        <Panel>
          <SectionHeader title="Twilight" detail="Campers are with their cabins / evening programming. Staff twilight assignments below." />
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {offerings.map((o) => (
              <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-black text-forest-900">{o.activity.name}</p>
                <p className="text-xs font-bold text-slate-500">{o.area.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{o.staffAssignments.length ? o.staffAssignments.map((a) => `${a.staff.firstName} ${a.staff.lastName}`).join(", ") : "No staff assigned"}</p>
              </div>
            ))}
            {offerings.length === 0 ? <p className="text-sm font-bold text-slate-500">No twilight offerings for this period.</p> : null}
          </div>
        </Panel>
      ) : (
        <div className="grid gap-5">
          {areaList.map((area) => (
            <Panel key={area.name}>
              <SectionHeader title={area.name} detail={`${area.offerings.reduce((s, o) => s + o.registrations.length, 0)} campers across ${area.offerings.length} offering${area.offerings.length === 1 ? "" : "s"}`} />
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {area.offerings.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-forest-900">{o.activity.name}</p>
                      <span className="shrink-0 rounded bg-forest-50 px-2 py-0.5 text-xs font-black text-forest-800">{o.registrations.length}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {o.staffAssignments.length ? o.staffAssignments.map((a) => `${a.staff.firstName} ${a.staff.lastName}`).join(", ") : <span className="text-red-600">No staff assigned</span>}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
          {areaList.length === 0 ? (
            <Panel><p className="text-sm font-bold text-slate-500">No active offerings for period {PERIOD_LABEL[period]}.</p></Panel>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function NumberCard({ icon, value, label, detail, tone }: { icon: React.ReactNode; value: number; label: string; detail: string; tone: "green" | "amber" | "blue" | "red" }) {
  const tones: Record<string, string> = {
    green: "border-green-200 bg-green-50 text-green-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-lake-200 bg-lake-50 text-lake-800",
    red: "border-red-300 bg-red-50 text-red-800"
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 [&>svg]:h-5 [&>svg]:w-5">{icon}<span className="text-2xl font-black">{value}</span></div>
      <p className="mt-1 text-sm font-black">{label}</p>
      <p className="text-xs font-semibold opacity-80">{detail}</p>
    </div>
  );
}
