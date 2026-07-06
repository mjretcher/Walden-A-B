import { Period, UserRole } from "@prisma/client";
import { CalendarDays, Download, Lock, LockOpen, Monitor } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ScreamSessionBoard } from "@/components/scream-session-board";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";
import { toggleScreamSessionLock } from "./actions";
import { ScreamSessionFreshnessBanner } from "@/components/scream-session-freshness-banner";
import { isTubingActivity, staffingActivityLabel, staffingAreaLabel, staffingGroupKey } from "@/lib/staffing-groups";
import { openConflictsWithHolders } from "@/lib/prescream";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scream Session" };

const OFF_PERIOD_VALUE = "__OFF_PERIOD__";
const SCREAM_SESSION_PERIODS: Period[] = [
  Period.P1A,
  Period.P2A,
  Period.P3A,
  Period.P4A,
  Period.P5A,
  Period.P1B,
  Period.P2B,
  Period.P3B,
  Period.P4B,
  Period.P5B
];

type OfferingForStaffing = Awaited<ReturnType<typeof prisma.activityOffering.findMany>>[number] & {
  area: { name: string };
  activity: { name: string };
  staffAssignments: { id: string }[];
};

function buildStaffingOfferings(offerings: OfferingForStaffing[]) {
  const sourceToStaffingId = new Map<string, string>();
  const grouped = new Map<string, OfferingForStaffing[]>();
  const result: OfferingForStaffing[] = [];

  for (const offering of offerings) {
    const key = staffingGroupKey(offering.period, offering.activity.name);
    if (!key) {
      sourceToStaffingId.set(offering.id, offering.id);
      result.push(offering);
      continue;
    }
    grouped.set(key, [...(grouped.get(key) ?? []), offering]);
  }

  for (const group of grouped.values()) {
    const canonical = group.find((offering) => !isTubingActivity(offering.activity.name)) ?? group[0];
    for (const offering of group) sourceToStaffingId.set(offering.id, canonical.id);
    result.push({
      ...canonical,
      staffTarget: group.reduce((total, offering) => total + offering.staffTarget, 0),
      staffAssignments: group.flatMap((offering) => offering.staffAssignments)
    });
  }

  return {
    offerings: result.sort((left, right) => {
      const periodOrder = SCREAM_SESSION_PERIODS.indexOf(left.period) - SCREAM_SESSION_PERIODS.indexOf(right.period);
      if (periodOrder !== 0) return periodOrder;
      return staffingActivityLabel(left.activity.name).localeCompare(staffingActivityLabel(right.activity.name));
    }),
    sourceToStaffingId
  };
}

export default async function ScreamSessionPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [rawStaff, offerings, cabins, latestAssignment, latestOffPeriod, caNameSet] = session
    ? await Promise.all([
        prisma.staff.findMany({
          where: { active: true, screamEligible: true },
          include: {
            primaryArea: true,
            skills: true,
            certifications: true,
            assignments: { where: { sessionId: session.id }, include: { offering: true } },
            offPeriods: { where: { sessionId: session.id } }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
          include: { area: true, activity: true, staffAssignments: { select: { id: true } } },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
        prisma.staffAssignment.findFirst({ where: { sessionId: session.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        prisma.staffOffPeriod.findFirst({ where: { sessionId: session.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
        buildCaNameSet(session.id)
      ])
    : [[], [], [], null, null, new Set<string>()];

  // Counselor Assistants are handled entirely through camper registration
  // (a Teaching Assistant registration on their own record) — Mike doesn't
  // want them appearing on the Scream Session board at all, staffable or
  // otherwise. They're Camper records, not Staff records, so normally that
  // would already be automatic; the exception is a stray Staff row left
  // over from before CAs were routed correctly (see lib/ca-staff-
  // exclusion.ts), which this filters out the same way the Staff Schedule
  // report does.
  const staff = rawStaff.filter((person) => !isCaStaffRecord(person, caNameSet));

  // Same "latest touch" calculation as /api/scream-session/last-updated —
  // this is the baseline the freshness banner compares subsequent polls
  // against, so the two need to agree on what "latest" means.
  const initialLatestTimestamps = [session?.lastStaffingChangeAt, latestAssignment?.updatedAt, latestOffPeriod?.updatedAt].filter(Boolean) as Date[];
  const initialLatest = initialLatestTimestamps.length
    ? new Date(Math.max(...initialLatestTimestamps.map((d) => d.getTime()))).toISOString()
    : null;

  const periodOptions = SCREAM_SESSION_PERIODS.map((period) => ({ value: period, label: PERIOD_LABEL[period] }));

  // PreScream conflicts (2+ areas wanting the same staff+period) surface
  // directly on the board so they're impossible to miss during the live
  // event, in addition to the dedicated /prescream conflicts list.
  const openConflicts = session ? await openConflictsWithHolders(session.id) : [];
  const preScreamConflicts = openConflicts.map((c) => ({
    staffId: c.staffId,
    period: c.period,
    areaNames: [c.holderAreaName, ...c.claims.map((claim) => claim.area.name)].filter(Boolean) as string[]
  }));
  const staffingOfferings = buildStaffingOfferings(offerings);

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-forest-900">Scream Session</h1>
          <p className="mt-1 text-base text-slate-600">Staff Assignment • Executive Admin</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm"><CalendarDays className="h-4 w-4" />{session?.name ?? "No Session"} • Summer {session?.year ?? ""}</span>
          {session?.screamSessionLocked
            ? <Badge tone="red">Locked</Badge>
            : <Badge tone="green">Live Updates</Badge>}
          <a className={secondaryButtonClass} href="/reports/area-block-plan" target="_blank" rel="noreferrer"><Monitor className="h-4 w-4" />Open Block Plan Monitor</a>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule"><Download className="h-4 w-4" />Export Staff AB Schedule</a>
          {session ? <ScreamLockButton sessionId={session.id} locked={session.screamSessionLocked} /> : null}
        </div>
      </div>
      {session ? <ScreamSessionFreshnessBanner sessionId={session.id} initialLatest={initialLatest} /> : null}
      <ScreamSessionBoard
        periods={periodOptions}
        preScreamConflicts={preScreamConflicts}
        cabins={cabins.map((cabin) => ({ id: cabin.id, name: cabin.name, unit: cabin.unit }))}
        canEditStaff={user.role === UserRole.EXECUTIVE_ADMIN}
        staff={staff.map((row) => ({
          id: row.id,
          name: `${row.firstName} ${row.lastName}`,
          primaryArea: row.primaryArea?.name ?? "",
          skills: row.skills.map((skill) => skill.name),
          certifications: row.certifications.map((cert) => cert.name),
          availabilityNotes: row.availabilityNotes,
          cabinId: row.cabinId,
          housingLabel: row.housingLabel,
          swimLevel: row.swimLevel,
          assignments: {
            ...Object.fromEntries(row.offPeriods.map((offPeriod) => [offPeriod.period, OFF_PERIOD_VALUE])),
            ...Object.fromEntries(row.assignments.map((assignment) => [assignment.period, staffingOfferings.sourceToStaffingId.get(assignment.offeringId) ?? assignment.offeringId]))
          }
        }))}
        offerings={staffingOfferings.offerings.map((offering) => ({
          id: offering.id,
          label: `${PERIOD_LABEL[offering.period]} ${staffingAreaLabel(offering.area.name, offering.activity.name)} ${staffingActivityLabel(offering.activity.name)}`,
          period: offering.period,
          periodLabel: PERIOD_LABEL[offering.period],
          area: staffingAreaLabel(offering.area.name, offering.activity.name),
          activity: staffingActivityLabel(offering.activity.name),
          staffTarget: offering.staffTarget,
          staffAssigned: offering.staffAssignments.length
        }))}
        locked={session?.screamSessionLocked ?? false}
      />
    </AppShell>
  );
}

function ScreamLockButton({ sessionId, locked }: { sessionId: string; locked: boolean }) {
  return (
    <details className="relative">
      <summary className={`inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black ${locked ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-700"}`}>
        {locked ? <><Lock className="h-4 w-4" />Unlock Scream</> : <><LockOpen className="h-4 w-4" />Lock Scream</>}
      </summary>
      <form action={toggleScreamSessionLock} className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
        <input name="sessionId" type="hidden" value={sessionId} />
        <input name="lock" type="hidden" value={locked ? "false" : "true"} />
        <p className="text-sm font-black text-slate-900">{locked ? "Unlock Scream Session" : "Lock Scream Session"}</p>
        <p className="mt-1 text-xs text-slate-500">{locked ? "Re-enable editing for all admins." : "Prevent any further assignment changes until unlocked."}</p>
        <input
          className="mt-3 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          name="password"
          type="password"
          placeholder="Enter lock password"
          required
          autoComplete="off"
        />
        <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-forest-900 px-3 text-sm font-black text-white" type="submit">
          {locked ? "Unlock" : "Lock"}
        </button>
      </form>
    </details>
  );
}
