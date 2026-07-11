import Link from "next/link";
import { CalendarClock, Users } from "lucide-react";
import { Gender, Period, RegistrationRole, RegistrationStatus, SessionDayType, Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { BreakdownToggle } from "@/components/breakdown-toggle";
import { Badge, buttonClass, Field, inputClass, PageHeader, Panel, SectionHeader } from "@/components/ui";
import { OfferingUnitBreakdown, UnitGenderTable } from "@/components/unit-gender-table";
import { requireUser } from "@/lib/auth";
import { tallyByUnitAndGender, UnitGenderTally } from "@/lib/camper-breakdown";
import { ALL_UNITS, PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
import { DayHalf, detroitNow, getSlotTimes, periodSlot } from "@/lib/period-times";
import { prisma } from "@/lib/prisma";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trip Planner" };

/**
 * Answers "if Unit 3 and 4 are off on a trip tomorrow, what do the numbers
 * at Waterfront (or anywhere) look like?" It reuses the exact
 * offering/registration data Right Now already queries for the same
 * session and period model, but for a chosen date instead of "now", with a
 * live subtraction for whichever units are marked away.
 *
 * This is a planning lens only — it doesn't read or write Outages. Marking
 * units "away" here previews the schedule impact; it doesn't excuse anyone
 * or change what Right Now / duty sheets show. If the trip is really
 * happening, log it in Outages too so the safety count stays accurate.
 */

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const CLASS_PERIODS_BY_HALF: Record<DayHalf, Period[]> = {
  A: [Period.P1A, Period.P2A, Period.P3A, Period.P4A],
  B: [Period.P1B, Period.P2B, Period.P3B, Period.P4B]
};

function isUnit(value: string): value is Unit {
  return (Object.values(Unit) as string[]).includes(value);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function buildHref(date: string, day: DayHalf | undefined, units: Unit[]): string {
  const qs = new URLSearchParams();
  qs.set("date", date);
  if (day) qs.set("day", day);
  for (const u of units) qs.append("units", u);
  return `/trip-planner?${qs.toString()}`;
}

export default async function TripPlannerPage({
  searchParams
}: {
  searchParams?: Promise<{ date?: string; day?: string; units?: string | string[] }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Trip Planner" eyebrow="Command Center" description="No active session." />
      </AppShell>
    );
  }

  const now = detroitNow();
  const defaultDate = addDaysToDateKey(now.dateKey, 1);
  const targetDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : defaultDate;

  const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
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
  const nonClassDay = Boolean(calendarDay && calendarDay.dayType !== SessionDayType.A && calendarDay.dayType !== SessionDayType.B);

  const rawUnits = params.units ? (Array.isArray(params.units) ? params.units : [params.units]) : [];
  const selectedUnits = new Set<Unit>(rawUnits.filter(isUnit));
  const selectedUnitsList = Array.from(selectedUnits);

  const periods = CLASS_PERIODS_BY_HALF[dayHalf];

  const [periodOfferings, awayPopulation] = await Promise.all([
    Promise.all(
      periods.map((period) =>
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, period, active: true, area: { active: true }, activity: { active: true } },
          include: {
            activity: { select: { name: true } },
            area: { select: { id: true, name: true } },
            registrations: {
              where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } },
              select: { camper: { select: { unit: true, gender: true } } }
            }
          },
          orderBy: [{ area: { name: "asc" } }, { activity: { name: "asc" } }]
        })
      )
    ),
    prisma.camper.count({ where: { sessionId: session.id, active: true, unit: { in: selectedUnitsList } } })
  ]);

  const periodSummaries = periods.map((period, i) => {
    const offerings = periodOfferings[i];
    const areas = new Map<
      string,
      {
        name: string;
        total: number;
        away: number;
        offerings: { id: string; activityName: string; total: number; away: number; remaining: number; tally: UnitGenderTally }[];
        people: { unit: Unit; gender: Gender }[];
      }
    >();
    let periodTotal = 0;
    let periodAway = 0;

    for (const offering of offerings) {
      const total = offering.registrations.length;
      const away = offering.registrations.filter((r) => selectedUnits.has(r.camper.unit)).length;
      const remaining = total - away;
      periodTotal += total;
      periodAway += away;

      if (!areas.has(offering.area.id)) areas.set(offering.area.id, { name: offering.area.name, total: 0, away: 0, offerings: [], people: [] });
      const areaEntry = areas.get(offering.area.id)!;
      areaEntry.total += total;
      areaEntry.away += away;
      areaEntry.offerings.push({
        id: offering.id,
        activityName: offering.activity.name,
        total,
        away,
        remaining,
        tally: tallyByUnitAndGender(offering.registrations.map((r) => r.camper))
      });
      areaEntry.people.push(...offering.registrations.map((r) => r.camper));
    }

    const areaList = Array.from(areas.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ ...a, tally: tallyByUnitAndGender(a.people) }));
    return { period, areaList, periodTotal, periodAway, hasOfferings: offerings.length > 0 };
  });

  return (
    <AppShell user={user}>
      <PageHeader
        title="Trip Planner"
        eyebrow={`Command Center · ${session.name}`}
        description="Pick a date and mark units away — every area's numbers update to show who'd actually still be around."
      />

      <form action="/trip-planner" method="GET" className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Date">
          <input type="date" name="date" defaultValue={targetDate} className={inputClass} />
        </Field>
        {overrideHalf ? <input type="hidden" name="day" value={overrideHalf} /> : null}
        {selectedUnitsList.map((u) => (
          <input key={u} type="hidden" name="units" value={u} />
        ))}
        <button type="submit" className={buttonClass}>Update</button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600">
          <CalendarClock className="h-4 w-4" />
          {formatDisplayDate(targetDate)} · {calendarDay ? String(calendarDay.dayType) : "no calendar entry"} day
          {calendarDay?.notes ? ` — ${calendarDay.notes}` : ""}
        </span>
        {!calendarDay ? (
          <Badge tone="amber">No A/B calendar entry for this date — showing {dayHalf} day</Badge>
        ) : nonClassDay ? (
          <Badge tone="amber">Calendar says {String(calendarDay.dayType)} (non-class) — showing {dayHalf} day anyway</Badge>
        ) : null}
        <Link href={buildHref(targetDate, dayHalf === "A" ? "B" : "A", selectedUnitsList)} className="text-sm font-bold text-lake-700 underline">
          View as {dayHalf === "A" ? "B" : "A"} day instead
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-black text-slate-700">
          <Users className="h-4 w-4" />
          Units away:
        </span>
        {ALL_UNITS.map((u) => {
          const isSelected = selectedUnits.has(u);
          const nextUnits = isSelected ? selectedUnitsList.filter((x) => x !== u) : [...selectedUnitsList, u];
          return (
            <Link
              key={u}
              href={buildHref(targetDate, overrideHalf ?? undefined, nextUnits)}
              className={`inline-flex min-h-10 items-center rounded-lg border px-4 py-1.5 text-sm font-black transition ${
                isSelected ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-red-50"
              }`}
            >
              {UNIT_LABEL[u]}
            </Link>
          );
        })}
        {selectedUnits.size === 0 ? (
          <span className="text-xs font-bold text-slate-400">Showing the normal schedule — tap a unit to see it pulled out.</span>
        ) : (
          <span className="text-xs font-bold text-red-700">
            {awayPopulation} camper{awayPopulation === 1 ? "" : "s"} in {selectedUnitsList.map((u) => UNIT_LABEL[u]).join(" & ")}, active this session.
          </span>
        )}
      </div>

      {periodSummaries.every((p) => !p.hasOfferings) ? (
        <Panel>
          <p className="text-sm font-bold text-slate-500">No active offerings found for the {dayHalf} day schedule.</p>
        </Panel>
      ) : (
        <BreakdownToggle>
          <div className="grid gap-6">
            {periodSummaries.map(({ period, areaList, periodTotal, periodAway, hasOfferings }) => (
              <div key={period}>
                <SectionHeader
                  title={`Period ${PERIOD_LABEL[period]} · ${slotTimes[periodSlot(period)].label}`}
                  detail={
                    selectedUnits.size > 0
                      ? `${periodTotal} normally in class → ${periodTotal - periodAway} remaining if those units leave`
                      : `${periodTotal} campers in class`
                  }
                />
                {hasOfferings ? (
                  <Panel className="mb-4">
                    <UnitGenderTable rows={areaList.map((a) => ({ label: a.name, tally: a.tally }))} awayUnits={selectedUnitsList} />
                  </Panel>
                ) : null}
                {hasOfferings ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {areaList.map((area) => (
                      <Panel key={area.name}>
                        <SectionHeader
                          title={area.name}
                          detail={selectedUnits.size > 0 ? `${area.total} → ${area.total - area.away}` : `${area.total} campers`}
                        />
                        <div className="grid gap-2">
                          {area.offerings.map((o) => (
                            <div key={o.id} className="rounded-lg border border-slate-200 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-forest-900">{o.activityName}</p>
                                <span className="shrink-0 rounded bg-forest-50 px-2 py-0.5 text-xs font-black text-forest-800">
                                  {o.away > 0 ? `${o.total} → ${o.remaining}` : o.total}
                                </span>
                              </div>
                              <OfferingUnitBreakdown tally={o.tally} awayUnits={selectedUnitsList} />
                            </div>
                          ))}
                        </div>
                      </Panel>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-slate-500">No active offerings for this period.</p>
                )}
              </div>
            ))}
          </div>
        </BreakdownToggle>
      )}
    </AppShell>
  );
}
