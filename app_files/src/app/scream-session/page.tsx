import { UserRole } from "@prisma/client";
import { CalendarDays, Download, Monitor } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ScreamSessionBoard } from "@/components/scream-session-board";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

const OFF_PERIOD_VALUE = "__OFF_PERIOD__";

export default async function ScreamSessionPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [staff, offerings] = session
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
        })
      ])
    : [[], []];

  const periodOptions = STAFF_PERIODS.map((period) => ({ value: period, label: PERIOD_LABEL[period] }));

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-forest-900">Scream Session</h1>
          <p className="mt-1 text-base text-slate-600">Staff Assignment • Executive Admin</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={secondaryButtonClass} type="button"><CalendarDays className="h-4 w-4" />{session?.name ?? "No Session"} • Summer {session?.year ?? ""}</button>
          <Badge tone="green">Live Updates</Badge>
          <a className={secondaryButtonClass} href="/reports/area-block-plan" target="_blank" rel="noreferrer"><Monitor className="h-4 w-4" />Open Block Plan Monitor</a>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule"><Download className="h-4 w-4" />Export Staff AB Schedule</a>
        </div>
      </div>
      <ScreamSessionBoard
        periods={periodOptions}
        staff={staff.map((row) => ({
          id: row.id,
          name: `${row.firstName} ${row.lastName}`,
          primaryArea: row.primaryArea?.name ?? "",
          skills: row.skills.map((skill) => skill.name),
          certifications: row.certifications.map((cert) => cert.name),
          availabilityNotes: row.availabilityNotes,
          assignments: {
            ...Object.fromEntries(row.offPeriods.map((offPeriod) => [offPeriod.period, OFF_PERIOD_VALUE])),
            ...Object.fromEntries(row.assignments.map((assignment) => [assignment.period, assignment.offeringId]))
          }
        }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          label: `${PERIOD_LABEL[offering.period]} ${offering.area.name} ${offering.activity.name}`,
          period: offering.period,
          periodLabel: PERIOD_LABEL[offering.period],
          area: offering.area.name,
          activity: offering.activity.name,
          staffTarget: offering.staffTarget,
          staffAssigned: offering.staffAssignments.length
        }))}
      />
    </AppShell>
  );
}
