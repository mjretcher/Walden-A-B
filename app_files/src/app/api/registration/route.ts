import { NextRequest, NextResponse } from "next/server";
import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentEventGuest } from "@/lib/event-auth";
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
  // Actor is EITHER a logged-in User OR a Registration Day event guest
  // (mess-hall join code). Everything downstream — eligibility validation,
  // two-period pairing, waitlists, the FOR UPDATE capacity locking — is
  // shared; only attribution and permission shape differ:
  //   - guests are locked to their event's registration window (body value
  //     ignored) so nobody in the mess hall can register into the wrong one
  //   - guests CAN override, but only by naming the approving Area Head
  //     (the existing overrideApprovedBy requirement enforces this)
  //   - guest registrations record eventGuestId instead of approvedByUserId
  const user = await getCurrentUser();
  const guestCtx = user ? null : await getCurrentEventGuest();
  if (!user && !guestCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const camperId = String(body.camperId ?? "");
  const offeringId = String(body.offeringId ?? "");
  const counselorApproval = String(body.counselorApproval ?? "").trim();
  const wantsOverride = Boolean(body.override);
  const overrideApprovedBy = String(body.overrideApprovedBy ?? "").trim();
  const joinWaitlist = Boolean(body.joinWaitlist);
  const canOverride = user ? canOverrideCapacity(user.role) : true;
  const registrationWindow = guestCtx ? guestCtx.event.registrationWindow : parseRegistrationWindow(body.registrationWindow);
  const registrationRole = body.registrationRole === RegistrationRole.TEACHING_ASSISTANT ? RegistrationRole.TEACHING_ASSISTANT : RegistrationRole.CAMPER;

  // Enforced server-side, not just in the UI: an override is only as good
  // as its paper trail, so it can't go through without a name attached to
  // it, no matter how the request was made.
  if (wantsOverride && canOverride && !overrideApprovedBy) {
    return NextResponse.json({ error: "Overriding this registration requires the name of the person approving it." }, { status: 422 });
  }

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
  if (user && user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== offering.areaId && wantsOverride) {
    return NextResponse.json({ error: "Area Heads can only override into their area." }, { status: 403 });
  }

  // 2-PERIOD (double-block) classes: when the chosen offering spans two
  // consecutive periods, we register the camper in BOTH the chosen period and
  // its partner period. We need a matching sibling offering (same menu +
  // activity) in the next period; both registrations are created atomically.
  let siblingOffering = null as Awaited<ReturnType<typeof prisma.activityOffering.findFirst>> | null;
  const status = wantsOverride && canOverride ? RegistrationStatus.OVERRIDDEN : RegistrationStatus.ACTIVE;


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
      const overriddenReasons = [...result.overriddenReasons];

      // A rejection is "waitlist-eligible" only when being full is the SOLE
      // reason it failed (not also blocked by, say, an ineligible unit) and
      // the offering has waitlisting turned on. This is what lets the client
      // show "add to waitlist" instead of a dead-end error, without us
      // string-matching error text.
      const primaryWaitlistEligible = !result.allowed && result.isFull && offering.allowWaitlist && result.errors.length === 1;
      let waitlisted = false;

      if (!result.allowed) {
        if (joinWaitlist && primaryWaitlistEligible) {
          waitlisted = true;
        } else {
          throw new RegistrationRejected({ ...result, error: result.errors[0], waitlistAvailable: primaryWaitlistEligible }, 422);
        }
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

        const siblingWaitlistEligible = !siblingResult.allowed && siblingResult.isFull && siblingOffering.allowWaitlist && siblingResult.errors.length === 1;

        if (!siblingResult.allowed) {
          if (joinWaitlist && siblingWaitlistEligible) {
            // Keep two-period pairs consistent: if either half needs
            // waitlisting, waitlist both rather than leaving a half-active,
            // half-waitlisted class (mirrors the existing both-or-nothing
            // rule this endpoint already enforced for plain rejections).
            waitlisted = true;
          } else {
            throw new RegistrationRejected({ ...siblingResult, error: `Second period (${PERIOD_LABEL[siblingOffering.period]}): ${siblingResult.errors[0]}`, waitlistAvailable: siblingWaitlistEligible }, 422);
          }
        }
        result.warnings.push(...siblingResult.warnings);
        overriddenReasons.push(...siblingResult.overriddenReasons.map((reason) => `Second period (${PERIOD_LABEL[siblingOffering!.period]}): ${reason}`));
      }

      const finalStatus = waitlisted ? RegistrationStatus.WAITLISTED : status;
      // Build a specific, attributable reason (who approved it, and exactly
      // what was overridden) instead of the old generic "Manual
      // capacity/special approval override." text — this is what shows up
      // wherever overrideReason gets surfaced later, so it needs to actually
      // say something useful.
      const overrideApplies = !waitlisted && wantsOverride && canOverride;
      const finalOverrideReason = overrideApplies
        ? overriddenReasons.length
          ? `Approved by ${overrideApprovedBy} — overrode: ${overriddenReasons.join(" ")}`
          : `Approved by ${overrideApprovedBy}.`
        : null;
      const finalCounselorApproval = overrideApplies ? overrideApprovedBy : counselorApproval || (user?.name ?? guestCtx!.guest.name);

      // Guard against duplicate waitlist entries (e.g. a double-click) —
      // the existingRegistration check above only looks at ACTIVE/OVERRIDDEN
      // registrations for this period, so it wouldn't catch "already
      // waitlisted for this exact offering." If found, treat re-joining as
      // idempotent rather than creating a second entry.
      if (waitlisted) {
        const existingWaitlistEntry = await tx.registration.findFirst({
          where: { camperId, offeringId, registrationWindow, status: RegistrationStatus.WAITLISTED },
          include: {
            camper: { include: { cabin: true } },
            offering: { include: { activity: true, area: true } }
          }
        });
        if (existingWaitlistEntry) {
          return { primary: existingWaitlistEntry, warnings: [...result.warnings, "Already on the waitlist for this offering."], waitlisted: true };
        }
      }

      // Waitlist position is per-offering, computed under the same row lock
      // taken above — so two people joining the same waitlist at once still
      // get distinct, correctly-ordered positions.
      async function nextWaitlistPosition(forOfferingId: string) {
        const last = await tx.registration.findFirst({
          where: { offeringId: forOfferingId, registrationWindow, status: RegistrationStatus.WAITLISTED },
          orderBy: { waitlistPosition: "desc" },
          select: { waitlistPosition: true }
        });
        return (last?.waitlistPosition ?? 0) + 1;
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
          counselorApproval: finalCounselorApproval,
          approvedByUserId: user?.id ?? null,
          eventGuestId: guestCtx?.guest.id ?? null,
          status: finalStatus,
          overrideReason: finalOverrideReason,
          waitlistPosition: waitlisted ? await nextWaitlistPosition(offeringId) : null
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
            counselorApproval: finalCounselorApproval,
            approvedByUserId: user?.id ?? null,
            eventGuestId: guestCtx?.guest.id ?? null,
            status: finalStatus,
            overrideReason: finalOverrideReason,
            waitlistPosition: waitlisted ? await nextWaitlistPosition(siblingOffering.id) : null
          }
        });
      }

      return { primary, warnings: result.warnings, waitlisted };
    });

    return NextResponse.json({
      registration: registration.primary,
      warnings: registration.warnings,
      waitlisted: registration.waitlisted,
      spannedInto: siblingOffering ? PERIOD_LABEL[siblingOffering.period] : null
    });
  } catch (err) {
    if (err instanceof RegistrationRejected) {
      return NextResponse.json(err.payload, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  // Same dual-actor model as POST: Registration Day guests can remove
  // registrations too (fixing mistakes live in the mess hall), with no
  // area scoping — that restriction only ever applied to Area Head users.
  const user = await getCurrentUser();
  const guestCtx = user ? null : await getCurrentEventGuest();
  if (!user && !guestCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (user && user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== registration.offering.areaId) {
    return NextResponse.json({ error: "Area Heads can only remove registrations in their area." }, { status: 403 });
  }

  // Guests are locked to their event's window on removal just like on
  // create — a mess-hall device must never be able to delete a Weeks 1-2
  // registration while doing Session 2 sign-ups.
  if (guestCtx && registration.registrationWindow !== guestCtx.event.registrationWindow) {
    return NextResponse.json({ error: "This registration belongs to a different registration window and can't be removed from the event screen." }, { status: 403 });
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
