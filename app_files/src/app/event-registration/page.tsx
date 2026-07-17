import { redirect } from "next/navigation";
import { RegistrationRole, RegistrationStatus } from "@prisma/client";
import { getCurrentEventGuest } from "@/lib/event-auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { readStringArray } from "@/lib/local-arrays";
import { EventRegistrationClient } from "./client";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

/**
 * The mess-hall registration screen for Registration Day event guests.
 * Deliberately NOT the admin /registration page: no pool filters, no window
 * picker (locked to the event's window), no camper editing — just search →
 * card → register, sized for phones. All writes go through the shared
 * /api/registration endpoint, so validation and capacity locking are
 * identical to the admin path.
 */
export default async function EventRegistrationPage() {
  const guestCtx = await getCurrentEventGuest();
  if (!guestCtx) redirect("/join");

  const session = await prisma.session.findFirst({ where: { id: guestCtx.event.sessionId } });
  if (!session) redirect("/join");

  const [campers, offerings] = await Promise.all([
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true },
      include: { cabin: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    }),
    prisma.activityOffering.findMany({
      where: {
        sessionId: session.id,
        active: true,
        // Same eligibility rule as the admin registration page:
        // visibleForCamperRegistration ONLY (not visibleOnMenu).
        visibleForCamperRegistration: true,
        area: { active: true },
        activity: { active: true }
      },
      include: {
        area: { select: { name: true } },
        activity: { select: { name: true } },
        _count: {
          select: {
            registrations: {
              where: {
                registrationWindow: guestCtx.event.registrationWindow,
                registrationRole: RegistrationRole.CAMPER,
                status: { in: activeRegistration }
              }
            }
          }
        }
      },
      orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
    })
  ]);

  return (
    <EventRegistrationClient
      guestName={guestCtx.guest.name}
      eventName={guestCtx.event.name}
      windowLabel={REGISTRATION_WINDOW_LABEL[guestCtx.event.registrationWindow]}
      campers={campers.map((camper) => ({
        id: camper.id,
        name: `${camper.firstName} ${camper.lastName}`,
        cabin: camper.cabin?.name ?? "No cabin",
        unit: UNIT_LABEL[camper.unit],
        gender: camper.gender,
        swim: SWIM_CODE[camper.swimLevel],
        counselorAssistant: camper.counselorAssistant
      }))}
      offerings={offerings.map((offering) => ({
        id: offering.id,
        period: PERIOD_LABEL[offering.period],
        activity: offering.activity.name,
        area: offering.area.name,
        count: offering._count.registrations,
        limit: offering.rosterLimit,
        allowWaitlist: offering.allowWaitlist,
        spansTwoPeriods: offering.spansTwoPeriods,
        eligibleUnits: readStringArray(offering.eligibleUnits).map((unit) => UNIT_LABEL[unit as keyof typeof UNIT_LABEL] ?? unit),
        eligibleSwimCodes: readStringArray(offering.eligibleSwimLevels).map((level) => SWIM_CODE[level as keyof typeof SWIM_CODE] ?? level),
        eligibleSwimLabels: readStringArray(offering.eligibleSwimLevels).map((level) => SWIM_LABEL[level as keyof typeof SWIM_LABEL] ?? level)
      }))}
    />
  );
}
