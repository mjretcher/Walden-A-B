import { RegistrationStatus, RegistrationWindow } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CounselorRegistration } from "@/components/counselor-registration";
import { PageHeader } from "@/components/ui";
import { canOverrideCapacity } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { readStringArray } from "@/lib/local-arrays";
import { parseRegistrationWindow, REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

type RegistrationSearchParams = {
  window?: string | string[];
};

function genderLabel(gender: string) {
  return gender.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RegistrationPage({ searchParams }: { searchParams?: Promise<RegistrationSearchParams> }) {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};
  const registrationWindow = parseRegistrationWindow(params.window);

  const [campers, offerings] = session
    ? await Promise.all([
        prisma.camper.findMany({
          where: { sessionId: session.id, active: true },
          include: { cabin: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, active: true, area: { active: true }, activity: { active: true } },
          include: {
            area: true,
            activity: true,
            _count: { select: { registrations: { where: { registrationWindow, status: { in: activeRegistration } } } } }
          },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        })
      ])
    : [[], []];

  return (
    <AppShell user={user}>
      <PageHeader title="Camper Registration" eyebrow="Counselor-assisted activity sign-up" />
      <CounselorRegistration
        canOverride={canOverrideCapacity(user.role)}
        registrationWindow={registrationWindow}
        registrationWindows={Object.values(RegistrationWindow).map((window) => ({
          value: window,
          label: REGISTRATION_WINDOW_LABEL[window],
          description: REGISTRATION_WINDOW_DESCRIPTION[window]
        }))}
        campers={campers.map((camper) => ({
          id: camper.id,
          name: `${camper.firstName} ${camper.lastName}`,
          cabin: camper.cabin?.name ?? "No cabin",
          unit: UNIT_LABEL[camper.unit],
          gender: genderLabel(camper.gender),
          swim: SWIM_CODE[camper.swimLevel],
          medicalFlags: camper.medicalFlags
        }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          period: PERIOD_LABEL[offering.period],
          activity: offering.activity.name,
          area: offering.area.name,
          count: offering._count.registrations,
          limit: offering.rosterLimit,
          limitType: offering.limitType,
          preAssigned: offering.preAssigned,
          active: offering.active,
          eligibleUnits: readStringArray(offering.eligibleUnits).map((unit) => UNIT_LABEL[unit as keyof typeof UNIT_LABEL] ?? unit),
          eligibleSwimLevels: readStringArray(offering.eligibleSwimLevels).map((level) => SWIM_LABEL[level as keyof typeof SWIM_LABEL] ?? level)
        }))}
      />
    </AppShell>
  );
}
