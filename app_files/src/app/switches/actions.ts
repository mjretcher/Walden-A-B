"use server";

import { RegistrationRole, RegistrationStatus, SwitchStatus, SwitchType, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canOverrideCapacity } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { validateRegistration } from "@/lib/eligibility";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export async function createCamperSwitch(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const currentRegistrationId = String(formData.get("currentRegistrationId"));
  const requestedOfferingId = String(formData.get("requestedOfferingId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const [currentRegistration, requestedOffering] = await Promise.all([
    prisma.registration.findUnique({ where: { id: currentRegistrationId }, include: { camper: true } }),
    prisma.activityOffering.findFirst({
      where: { id: requestedOfferingId, active: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } }
    })
  ]);

  if (!currentRegistration || !requestedOffering) throw new Error("Missing current registration or requested offering.");
  if (user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== requestedOffering.areaId) {
    throw new Error("Area Heads may only approve switches into their own area.");
  }

  const enrollmentCount = await prisma.registration.count({ where: { offeringId: requestedOfferingId, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } });
  const result = validateRegistration({
    camper: currentRegistration.camper,
    offering: requestedOffering,
    enrollmentCount,
    override: canOverrideCapacity(user.role)
  });

  await prisma.switchRequest.create({
    data: {
      type: SwitchType.CAMPER,
      status: SwitchStatus.PENDING,
      sessionId: currentRegistration.sessionId,
      camperId: currentRegistration.camperId,
      currentOfferingId: currentRegistration.offeringId,
      requestedOfferingId,
      period: currentRegistration.period,
      reason,
      validationNotes: [...result.errors, ...result.warnings].join(" ") || null,
      requestedBy: user.name
    }
  });

  revalidatePath("/switches");
}

export async function createStaffSwitch(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const staffAssignmentId = String(formData.get("staffAssignmentId"));
  const requestedOfferingId = String(formData.get("requestedOfferingId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const assignment = await prisma.staffAssignment.findUnique({ where: { id: staffAssignmentId } });
  const requestedOffering = await prisma.activityOffering.findFirst({ where: { id: requestedOfferingId, active: true, area: { active: true }, activity: { active: true } } });
  if (!assignment || !requestedOffering) throw new Error("Missing current assignment or requested offering.");

  await prisma.switchRequest.create({
    data: {
      type: SwitchType.STAFF,
      status: SwitchStatus.PENDING,
      sessionId: assignment.sessionId,
      staffId: assignment.staffId,
      currentOfferingId: assignment.offeringId,
      requestedOfferingId,
      staffAssignmentId,
      period: assignment.period,
      reason,
      requestedBy: user.name
    }
  });

  revalidatePath("/switches");
}

export async function decideSwitch(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "approve" | "deny";
  const request = await prisma.switchRequest.findUnique({
    where: { id },
    include: { camper: true, requestedOffering: true, staffAssignment: true }
  });
  if (!request) throw new Error("Switch request not found.");

  if (decision === "deny") {
    const denyReason = String(formData.get("denyReason") ?? "").trim();
    await prisma.switchRequest.update({
      where: { id },
      data: {
        status: SwitchStatus.DENIED,
        decidedByUserId: user.id,
        decidedAt: new Date(),
        // Repurpose validationNotes to also carry the human denial reason,
        // prefixed "Denied: " so history can distinguish it from auto-validation.
        validationNotes: denyReason ? `Denied: ${denyReason}` : request.validationNotes
      }
    });
    revalidatePath("/switches");
    return;
  }

  if (request.type === SwitchType.CAMPER) {
    const { camper, requestedOffering, camperId, requestedOfferingId } = request;
    if (!camper || !camperId || !requestedOffering || !requestedOfferingId) throw new Error("Camper switch is incomplete.");
    if (!requestedOffering.visibleForCamperRegistration) throw new Error("Requested offering is hidden from camper registration.");
    if (user.role === UserRole.AREA_HEAD && user.areaId && user.areaId !== requestedOffering.areaId) {
      throw new Error("Area Heads may only approve switches into their own area.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.registration.updateMany({
        where: {
          camperId,
          offeringId: request.currentOfferingId ?? undefined,
          period: request.period,
          status: { in: activeRegistration }
        },
        data: { status: RegistrationStatus.REMOVED }
      });
      await tx.registration.create({
        data: {
          camperId,
          offeringId: requestedOfferingId,
          sessionId: request.sessionId,
          menuId: requestedOffering.menuId,
          period: request.period,
          registrationRole: RegistrationRole.CAMPER,
          approvedByUserId: user.id,
          counselorApproval: user.name,
          status: canOverrideCapacity(user.role) ? RegistrationStatus.OVERRIDDEN : RegistrationStatus.ACTIVE,
          overrideReason: "Approved switch workflow."
        }
      });
      await tx.switchRequest.update({
        where: { id },
        data: { status: user.role === UserRole.EXECUTIVE_ADMIN ? SwitchStatus.OVERRIDDEN : SwitchStatus.APPROVED, decidedByUserId: user.id, decidedAt: new Date() }
      });
    });
  } else {
    const { requestedOfferingId, staffAssignment, staffAssignmentId } = request;
    if (!staffAssignment || !staffAssignmentId || !requestedOfferingId) throw new Error("Staff switch is incomplete.");
    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.update({
        where: { id: staffAssignmentId },
        data: { offeringId: requestedOfferingId, period: request.period, notes: "Updated through staff switch workflow." }
      });
      await tx.switchRequest.update({
        where: { id },
        data: { status: SwitchStatus.APPROVED, decidedByUserId: user.id, decidedAt: new Date() }
      });
    });
  }

  revalidatePath("/switches");
  revalidatePath("/rosters");
  revalidatePath("/area-dashboard");
}

// Wizard Step 3 submit. Unlike the legacy hub form, area heads MAY submit
// cross-area switches here — the request simply routes to the destination
// area head for approval. Exec admins may additionally approve immediately,
// which applies the registration change in a single transaction with no
// PENDING state.
export async function submitCamperSwitch(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const registrationId = String(formData.get("registrationId"));
  const requestedOfferingId = String(formData.get("offeringId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "submit") === "approve" ? "approve" : "submit";

  const [registration, requestedOffering] = await Promise.all([
    prisma.registration.findFirst({
      where: { id: registrationId, status: { in: activeRegistration } },
      include: { camper: true }
    }),
    prisma.activityOffering.findFirst({
      where: { id: requestedOfferingId, active: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } },
      include: { area: { select: { name: true } } }
    })
  ]);

  if (!registration || !requestedOffering) throw new Error("Missing registration or requested offering.");

  const enrollmentCount = await prisma.registration.count({
    where: { offeringId: requestedOfferingId, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } }
  });
  const result = validateRegistration({
    camper: registration.camper,
    offering: requestedOffering,
    enrollmentCount,
    override: canOverrideCapacity(user.role)
  });
  const validationNotes = [...result.errors, ...result.warnings].join(" ") || null;
  const camperName = `${registration.camper.firstName} ${registration.camper.lastName}`;

  if (decision === "approve") {
    if (user.role !== UserRole.EXECUTIVE_ADMIN) throw new Error("Only executive admins can approve immediately.");

    await prisma.$transaction(async (tx) => {
      await tx.registration.updateMany({
        where: { camperId: registration.camperId, offeringId: registration.offeringId, period: registration.period, status: { in: activeRegistration } },
        data: { status: RegistrationStatus.REMOVED }
      });
      await tx.registration.create({
        data: {
          camperId: registration.camperId,
          offeringId: requestedOfferingId,
          sessionId: registration.sessionId,
          menuId: requestedOffering.menuId,
          period: registration.period,
          registrationRole: RegistrationRole.CAMPER,
          approvedByUserId: user.id,
          counselorApproval: user.name,
          status: RegistrationStatus.OVERRIDDEN,
          overrideReason: "Immediate approval via switch wizard."
        }
      });
      await tx.switchRequest.create({
        data: {
          type: SwitchType.CAMPER,
          status: SwitchStatus.OVERRIDDEN,
          sessionId: registration.sessionId,
          camperId: registration.camperId,
          currentOfferingId: registration.offeringId,
          requestedOfferingId,
          period: registration.period,
          reason,
          validationNotes,
          requestedBy: user.name,
          decidedByUserId: user.id,
          decidedAt: new Date()
        }
      });
    });

    revalidatePath("/switches");
    revalidatePath("/rosters");
    revalidatePath("/area-dashboard");
    redirect(`/switches?toast=approved&name=${encodeURIComponent(camperName)}`);
  }

  await prisma.switchRequest.create({
    data: {
      type: SwitchType.CAMPER,
      status: SwitchStatus.PENDING,
      sessionId: registration.sessionId,
      camperId: registration.camperId,
      currentOfferingId: registration.offeringId,
      requestedOfferingId,
      period: registration.period,
      reason,
      validationNotes,
      requestedBy: user.name
    }
  });

  revalidatePath("/switches");
  redirect(`/switches?toast=submitted&name=${encodeURIComponent(camperName)}&area=${encodeURIComponent(requestedOffering.area.name)}`);
}

// Wizard Step 3 submit for staff switches. Mirrors submitCamperSwitch: area
// heads may submit cross-area, and exec admins may approve immediately, which
// re-points the staff assignment to the new offering in one transaction.
export async function submitStaffSwitch(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const staffAssignmentId = String(formData.get("assignmentId"));
  const requestedOfferingId = String(formData.get("offeringId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "submit") === "approve" ? "approve" : "submit";

  const [assignment, requestedOffering] = await Promise.all([
    prisma.staffAssignment.findUnique({ where: { id: staffAssignmentId }, include: { staff: true } }),
    prisma.activityOffering.findFirst({
      where: { id: requestedOfferingId, active: true, area: { active: true }, activity: { active: true } },
      include: { area: { select: { name: true } } }
    })
  ]);

  if (!assignment || !requestedOffering) throw new Error("Missing assignment or requested offering.");
  const staffName = `${assignment.staff.firstName} ${assignment.staff.lastName}`;

  if (decision === "approve") {
    if (user.role !== UserRole.EXECUTIVE_ADMIN) throw new Error("Only executive admins can approve immediately.");

    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.update({
        where: { id: staffAssignmentId },
        data: { offeringId: requestedOfferingId, period: requestedOffering.period, notes: "Immediate approval via staff switch wizard." }
      });
      await tx.switchRequest.create({
        data: {
          type: SwitchType.STAFF,
          status: SwitchStatus.APPROVED,
          sessionId: assignment.sessionId,
          staffId: assignment.staffId,
          currentOfferingId: assignment.offeringId,
          requestedOfferingId,
          staffAssignmentId,
          period: assignment.period,
          reason,
          requestedBy: user.name,
          decidedByUserId: user.id,
          decidedAt: new Date()
        }
      });
    });

    revalidatePath("/switches");
    revalidatePath("/rosters");
    revalidatePath("/area-dashboard");
    redirect(`/switches?toast=approved&name=${encodeURIComponent(staffName)}`);
  }

  await prisma.switchRequest.create({
    data: {
      type: SwitchType.STAFF,
      status: SwitchStatus.PENDING,
      sessionId: assignment.sessionId,
      staffId: assignment.staffId,
      currentOfferingId: assignment.offeringId,
      requestedOfferingId,
      staffAssignmentId,
      period: assignment.period,
      reason,
      requestedBy: user.name
    }
  });

  revalidatePath("/switches");
  redirect(`/switches?toast=submitted&name=${encodeURIComponent(staffName)}&area=${encodeURIComponent(requestedOffering.area.name)}`);
}
