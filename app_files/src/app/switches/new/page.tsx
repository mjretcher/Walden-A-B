import { RegistrationStatus, SwitchStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { departureNote } from "@/lib/week-enrollment";
import { CamperSearch, type CamperRegistrationRow } from "@/components/switches/camper-search";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function NewCamperSwitchPage({
  searchParams
}: {
  searchParams?: Promise<{ registrationId?: string; camperId?: string; name?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });

  const registrations = session
    ? await prisma.registration.findMany({
        where: { sessionId: session.id, status: { in: activeRegistration } },
        include: {
          camper: {
            include: {
              cabin: true,
              weekEnrollments: true,
              sessionDesignations: true,
              allergies: { include: { allergyLabel: true } },
              switchRequests: { where: { sessionId: session.id }, select: { id: true, period: true, status: true } }
            }
          },
          offering: { include: { activity: true, area: true } }
        },
        orderBy: [{ camper: { lastName: "asc" } }, { camper: { firstName: "asc" } }, { period: "asc" }]
      })
    : [];

  const rows: CamperRegistrationRow[] = registrations.map((registration) => {
    const { camper, offering } = registration;
    return {
      registrationId: registration.id,
      camperId: registration.camperId,
      offeringId: registration.offeringId,
      firstName: camper.firstName,
      lastName: camper.lastName,
      cabinName: camper.cabin?.name ?? null,
      unitLabel: UNIT_LABEL[camper.unit],
      swimLabel: SWIM_LABEL[camper.swimLevel],
      age: camper.age,
      medicalFlags: camper.medicalFlags,
      allergies: camper.allergies.map((allergy) => allergy.allergyLabel.name),
      designations: camper.sessionDesignations.map((designation) => designation.label),
      departureNote: departureNote(camper.weekEnrollments),
      period: registration.period,
      periodLabel: PERIOD_LABEL[registration.period],
      areaName: offering.area.name,
      activityName: offering.activity.name,
      priorSwitchCount: camper.switchRequests.length,
      hasPendingSwitchThisPeriod: camper.switchRequests.some(
        (request) => request.status === SwitchStatus.PENDING && request.period === registration.period
      )
    };
  });

  return (
    <AppShell user={user}>
      <PageHeader
        title="New camper switch"
        eyebrow="Step 1 of 3 · Find the camper"
        description="Search by camper name, cabin, current activity, or area. Then tap any period on their schedule to start that switch."
      />

      {!session ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          No active session is selected, so camper switches are not available yet.
        </div>
      ) : (
        <CamperSearch
          registrations={rows}
          initialRegistrationId={params.registrationId ?? null}
          initialCamperId={params.camperId ?? null}
          initialCamperName={params.name ?? null}
        />
      )}
    </AppShell>
  );
}
