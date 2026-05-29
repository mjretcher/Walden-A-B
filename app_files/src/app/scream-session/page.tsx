import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ScreamSessionBoard } from "@/components/scream-session-board";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

export default async function ScreamSessionPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [staff, offerings] = session
    ? await Promise.all([
        prisma.staff.findMany({
          where: { active: true },
          include: {
            primaryArea: true,
            skills: true,
            certifications: true,
            assignments: { where: { sessionId: session.id }, include: { offering: true } }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true },
          include: { area: true, activity: true },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        })
      ])
    : [[], []];

  const periodLabels = STAFF_PERIODS.map((period) => PERIOD_LABEL[period]);

  return (
    <AppShell user={user}>
      <PageHeader title="Scream Session" eyebrow="Projector-friendly staff assignment" />
      <ScreamSessionBoard
        periods={periodLabels}
        staff={staff.map((row) => ({
          id: row.id,
          name: `${row.firstName} ${row.lastName}`,
          primaryArea: row.primaryArea?.name ?? "",
          skills: row.skills.map((skill) => skill.name),
          certifications: row.certifications.map((cert) => cert.name),
          availabilityNotes: row.availabilityNotes,
          assignments: Object.fromEntries(row.assignments.map((assignment) => [PERIOD_LABEL[assignment.period], assignment.offeringId]))
        }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          label: `${PERIOD_LABEL[offering.period]} ${offering.area.name} ${offering.activity.name}`,
          period: PERIOD_LABEL[offering.period],
          area: offering.area.name,
          activity: offering.activity.name
        }))}
      />
    </AppShell>
  );
}
