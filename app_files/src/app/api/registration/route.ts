import { NextRequest, NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { canOverrideCapacity } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { validateRegistration } from "@/lib/eligibility";
import { parseRegistrationWindow } from "@/lib/registration-windows";
import { nextConsecutivePeriod, previousConsecutivePeriod, PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

// Thrown from inside the transaction to abort it and carry the exact
// response we want back out — Prisma re-throws whatever the callback
// throws, so this is how a mid-transaction validation failure becomes a
// normal-looking 422/403 instead of a 500.
class RegistrationRejected extends Error {
  constructor(
    public payload: Record<string, unknown>,
    public status: number
  ) {
    super("Registration rejected");
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const camperId = String(body.camperId ?? "");
  const offeringId = String(body.offeringId ?? "");
  const counselorApproval = String(body.counselorApproval ?? "").trim();
  const wantsOverride = Boolean(body.override);
  const canOverride = canOverrideCapacity(user.role);
  const registrationWindow = parseRegistrationWindow(body.registrationWindow);
  const registrationRole = body.registrationRole === RegistrationRole.TEACHING_ASSISTANT ? RegistrationRole.TEACHING_ASSISTANT : RegistrationRole.CAMPER;

  const [camper, offering] = await Promise.all([
    prisma.camper.findUnique({ where: { id: camperId }, include: { cabin: true } }),
    prisma.activityOffering.findFirst({
      where: { id: offeringId, active: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } },
      include: { activity: true, area: true }
    })
  ]);

  if (!camper || !offering) return NextResponse.json({ error: "Camper or offering not found." }, { status: 404 });
  if (registrationRole === RegistrationRole.TEACHING_ASSISTANT && !camper.counselorAssistant) {
    return NextResponse.json({ error: "Only campers marked as Counselor Assistants can be registered as teaching assistants." }, { status: 422 });
  }
  if (user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== offering.areaId && wantsOverride) {
    return NextResponse.json({ error: "Area Heads can only override into their area." }, { status: 403 });
  }

  // 2-PERIOD (double-block) classes: when the chosen offering spans two
  // consecutive periods, we register the camper in BOTH the chosen period and
  // its partner period. We need a matching sibling offering (same menu +
  // activity) in the next period; both registrations are created atomically.
  let siblingOffering = null as Awaited<ReturnType<typeof prisma.activityOffering.findFirst>> | null;
  const status = wantsOverride && canOverride ? RegistrationStatus.OVERRIDDEN : RegistrationStatus.ACTIVE;
  const overrideReason = wantsOverride && canOverride ? "Manual capacity/special approval override." : null;

  if (offering.spansTwoPeriods) {
    const partnerPeriod = nextConsecutivePeriod(offering.period);
    if (!partnerPeriod) {
      return NextResponse.json({ error: `${offering.activity.name} is marked as a two-period class but ${PERIOD_LABEL[offering.period]} has no following period in the same day. Move it to an earlier period (e.g. 3A so it can span into 4A).` }, { status: 422 });
    }

    siblingOffering = await prisma.activityOffering.findFirst({
      where: {
        sessionId: offering.sessionId,
        menuId: offering.menuId,
        activityId: offering.activityId,
        period: partnerPeriod,
        active: true,
        visibleForCamperRegistration: true,
        area: { active: true },
        activity: { active: true }
      },
      include: { activity: true, area: true }
    });

    if (!siblingOffering) {
      return NextResponse.json({ error: `${offering.activity.name} runs two periods, but there's no ${PERIOD_LABEL[partnerPeriod]} offering to pair with ${PERIOD_LABEL[offering.period]}. Build ${offering.activity.name} in ${PERIOD_LABEL[partnerPeriod]} too (Menu Builder), then register again.` }, { status: 422 });
    }
  }

  // Everything capacity-sensitive (the count check AND the create) happens
  // inside one locked transaction. The previous version checked the count,
  // then created the registration as a separate step — under concurrent
  // registration load, two requests for the same near-full offering could
  // both read "one spot left" and both get created, oversubscribing it.
  // Locking the offering row(s) FOR UPDATE forces concurrent requests
  // targeting the same offering to queue up and see each other's committed
  // work before deciding. Lock order is sorted by id so two overlapping
  // two-period classes can never deadlock against each other.
  try {
    const registration = await prisma.$transaction(async (tx) => {
      const idsToLock = siblingOffering ? [offeringId, siblingOffering.id].sort() : [offeringId];
      for (const id of idsToLock) {
        await tx.$queryRaw`SELECT id FROM "ActivityOffering" WHERE id = ${id} FOR UPDATE`;
      }

      const [existingRegistration, enrollmentCount] = await Promise.all([
        tx.registration.findFirst({
          where: { camperId, sessionId: offering.sessionId, registrationWindow, period: offering.period, status: { in: activeRegistration } }
        }),
        tx.registration.count({
          where: { offeringId, registrationWindow, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } }
        })
      ]);

      const result = validateRegistration({
        camper,
        offering,
        existingRegistration,
        enrollmentCount: registrationRole === RegistrationRole.TEACHING_ASSISTANT ? 0 : enrollmentCount,
        override: (wantsOverride && canOverride) || registrationRole === RegistrationRole.TEACHING_ASSISTANT
      });

      if (!result.allowed) {
        throw new RegistrationRejected({ ...result, error: result.errors[0] }, 422);
      }

      if (siblingOffering) {
        const [siblingExisting, siblingCount] = await Promise.all([
          tx.registration.findFirst({
            where: { camperId, sessionId: siblingOffering.sessionId, registrationWindow, period: siblingOffering.period, status: { in: activeRegistration } }
          }),
          tx.registration.count({
            where: { offeringId: siblingOffering.id, registrationWindow, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } }
          })
        ]);

        const siblingResult = validateRegistration({
          camper,
          offering: siblingOffering,
          existingRegistration: siblingExisting,
          enrollmentCount: registrationRole === RegistrationRole.TEACHING_ASSISTANT ? 0 : siblingCount,
          override: (wantsOverride && canOverride) || registrationRole === RegistrationRole.TEACHING_ASSISTANT
        });

        if (!siblingResult.allowed) {
          throw new RegistrationRejected({ ...siblingResult, error: `Second period (${PERIOD_LABEL[siblingOffering.period]}): ${siblingResult.errors[0]}` }, 422);
        }
        result.warnings.push(...siblingResult.warnings);
      }

      const primary = await tx.registration.create({
        data: {
          camperId,
          offeringId,
          sessionId: offering.sessionId,
          menuId: offering.menuId,
          period: offering.period,
          registrationWindow,
          registrationRole,
          counselorApproval: counselorApproval || user.name,
          approvedByUserId: user.id,
          status,
          overrideReason
        },
        include: {
          camper: { include: { cabin: true } },
          offering: { include: { activity: true, area: true } }
        }
      });

      if (siblingOffering) {
        await tx.registration.create({
          data: {
            camperId,
            offeringId: siblingOffering.id,
            sessionId: siblingOffering.sessionId,
            menuId: siblingOffering.menuId,
            period: siblingOffering.period,
            registrationWindow,
            registrationRole,
            counselorApproval: counselorApproval || user.name,
            approvedByUserId: user.id,
            status,
            overrideReason
          }
        });
      }

      return { primary, warnings: result.warnings };
    });

    return NextResponse.json({ registration: registration.primary, warnings: registration.warnings, spannedInto: siblingOffering ? PERIOD_LABEL[siblingOffering.period] : null });
  } catch (err) {
    if (err instanceof RegistrationRejected) {
      return NextResponse.json(err.payload, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const registrationId = String(searchParams.get("registrationId") ?? "");
  if (!registrationId) {
    return NextResponse.json({ error: "Missing registrationId." }, { status: 400 });
  }

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { offering: { include: { activity: true } } }
  });
  if (!registration) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  // Area Heads can only remove registrations within their own area.
  if (user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== registration.offering.areaId) {
    return NextResponse.json({ error: "Area Heads can only remove registrations in their area." }, { status: 403 });
  }

  // If this registration is one half of a 2-period (double-block) class, find
  // and remove its partner too so we never leave a stranded half-class. The
  // partner is the same camper + window + activity in the adjacent period.
  const partnerPeriods = [nextConsecutivePeriod(registration.period), previousConsecutivePeriod(registration.period)].filter(Boolean);
  let partnerId: string | null = null;
  if (registration.offering.spansTwoPeriods || partnerPeriods.length) {
    const partner = await prisma.registration.findFirst({
      where: {
        id: { not: registration.id },
        camperId: registration.camperId,
        sessionId: registration.sessionId,
        registrationWindow: registration.registrationWindow,
        period: { in: partnerPeriods as any[] },
        offering: { activityId: registration.offering.activityId, menuId: registration.offering.menuId }
      },
      include: { offering: { select: { spansTwoPeriods: true } } }
    });
    // Only treat it as a span partner if either side is flagged as spanning.
    if (partner && (partner.offering.spansTwoPeriods || registration.offering.spansTwoPeriods)) {
      partnerId = partner.id;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.registration.delete({ where: { id: registrationId } });
    if (partnerId) {
      await tx.registration.delete({ where: { id: partnerId } });
    }
  });

  return NextResponse.json({
    ok: true,
    removed: { id: registrationId, activity: registration.offering.activity.name, period: registration.period },
    alsoRemovedPartner: Boolean(partnerId)
  });
}
