"use server";

import { revalidatePath } from "next/cache";
import { Gender, RegistrationStatus, SwimLevel, Unit, UserRole, WeekBlock } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeStringArray } from "@/lib/local-arrays";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL } from "@/lib/periods";
import { logAudit } from "@/lib/audit";
import { flagRostersForCabinChange, flagRostersForNicknameChange } from "@/lib/roster-reprint";

const camperConsumerPaths = ["/admin/campers", "/registration", "/cards", "/rosters", "/search", "/dashboard", "/area-dashboard", "/switches"];

function revalidateCamperConsumers() {
  for (const path of camperConsumerPaths) revalidatePath(path);
}

function selectedCamperIds(formData: FormData) {
  return formData.getAll("camperId").map((value) => String(value)).filter(Boolean);
}

function selectedSwimLevel(formData: FormData) {
  const value = String(formData.get("swimLevel") ?? "");
  return Object.values(SwimLevel).includes(value as SwimLevel) ? (value as SwimLevel) : null;
}

function selectedEnum<T extends string>(value: FormDataEntryValue | null, allowed: T[]) {
  const text = String(value ?? "");
  return allowed.includes(text as T) ? (text as T) : null;
}

function confirmation(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function activeSessionId() {
  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true } });
  return session?.id ?? null;
}

export async function createCamper(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  // Explicit from the form (the "Add Camper" panel carries a hidden sessionId
  // matching whichever session the page is currently viewing) rather than
  // always the active one -- this is what lets a camper be added to a
  // session other than whichever is active. Falls back to active only if
  // the form somehow didn't carry one (defensive; the current caller always
  // sends it).
  const requestedSessionId = String(formData.get("sessionId") ?? "").trim();
  const sessionId = requestedSessionId || (await activeSessionId());
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const gender = selectedEnum(formData.get("gender"), Object.values(Gender) as Gender[]);
  const unit = selectedEnum(formData.get("unit"), Object.values(Unit) as Unit[]);
  const swimLevel = selectedSwimLevel(formData) ?? SwimLevel.PENDING_SWIM_TEST;
  const cabinId = String(formData.get("cabinId") ?? "");

  if (!sessionId || !firstName || !lastName || !gender || !unit) return;

  const cabin = cabinId
    ? await prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true, name: true } })
    : null;
  if (cabinId && !cabin) return;

  const weekBlocks = formData
    .getAll("weekBlock")
    .map(String)
    .filter((value): value is WeekBlock => Object.values(WeekBlock).includes(value as WeekBlock));

  await prisma.camper.create({
    data: {
      firstName,
      lastName,
      gender,
      genderIdentity: String(formData.get("genderIdentity") ?? "").trim() || null,
      age: parseNumber(String(formData.get("age") ?? "")),
      campGrade: String(formData.get("campGrade") ?? "").trim() || null,
      unit,
      cabinId: cabin?.id ?? null,
      swimLevel,
      medicalFlags: String(formData.get("medicalFlags") ?? "").trim() || null,
      counselorAssistant: formData.get("counselorAssistant") === "on",
      active: true,
      sessionId,
      weekEnrollments: cabin && weekBlocks.length
        ? {
            create: weekBlocks.map((weekBlock) => ({
              sessionId,
              weekBlock,
              cabinId: cabin.id,
              cabinName: cabin.name
            }))
          }
        : undefined
    }
  });

  revalidateCamperConsumers();
}

/**
 * Bulk swim-level update for a specific set of selected campers. No session
 * check needed here at all -- the ids come from checkboxes on the page,
 * which only ever lists campers from whichever session is currently being
 * viewed, so the ids are already correctly scoped. Re-deriving "active
 * session" and requiring a match against it was the actual bug: it silently
 * matched zero rows the moment the page was viewing a non-active session.
 */
export async function bulkUpdateCamperSwimLevels(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const ids = selectedCamperIds(formData);
  const swimLevel = selectedSwimLevel(formData);
  if (!ids.length || !swimLevel) return;
  if (confirmation(formData, "confirmBulkSwim").toUpperCase() !== "SWIM") return;

  await prisma.camper.updateMany({
    where: { id: { in: ids }, active: true },
    data: { swimLevel }
  });

  revalidateCamperConsumers();
}

/**
 * "Set every active camper in a session to X" -- unlike the bulk action
 * above, this has no id list to derive scope from, so it genuinely needs an
 * explicit sessionId. Sent as a hidden field from the client alongside the
 * two confirm-panel forms, carrying whichever session the page is viewing.
 */
async function setAllActiveCampersTo(swimLevel: SwimLevel, formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return;

  const expected = `SET ALL TO ${SWIM_LABEL[swimLevel].toUpperCase()}`;
  if (confirmation(formData, "confirmAllSwim").toUpperCase() !== expected) return;

  await prisma.camper.updateMany({
    where: { sessionId, active: true },
    data: { swimLevel }
  });

  revalidateCamperConsumers();
}

export async function setAllActiveCampersToMuskie(formData: FormData) {
  await setAllActiveCampersTo(SwimLevel.MUSKIE, formData);
}

export async function setAllActiveCampersToPendingSwimTest(formData: FormData) {
  await setAllActiveCampersTo(SwimLevel.PENDING_SWIM_TEST, formData);
}

export type RosterFlagResult = {
  ok: boolean;
  affectedRosters: { offeringId: string; label: string }[];
};

export async function updateCamperCabin(formData: FormData): Promise<RosterFlagResult> {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const cabinId = String(formData.get("cabinId") ?? "");
  if (!camperId) return { ok: false, affectedRosters: [] };

  // Looked up by camperId alone -- no "must also match the active session"
  // check. The camper's own sessionId (fetched below) is the only session
  // that matters for this edit; requiring it to equal whichever session
  // happens to be globally active was the actual bug, since it silently
  // matched nothing the moment this camper's session wasn't the active one.
  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, sessionId: true, firstName: true, lastName: true, cabinId: true, unit: true, cabin: { select: { name: true } } }
  });
  if (!camper) return { ok: false, affectedRosters: [] };
  const sessionId = camper.sessionId;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return { ok: false, affectedRosters: [] };

  const nextCabinId = cabinId || null;
  // Look up the destination cabin's unit so we can sync the camper's unit at
  // the same time — previously updateCamperCabin only changed cabinId, leaving
  // Camper.unit stale, which is what made (for example) moves to G37 look like
  // they "didn't take" on roster/eligibility views that filter by unit.
  let nextUnit: Unit | null = null;
  let nextCabinName: string | null = null;
  if (nextCabinId) {
    const cabin = await prisma.cabin.findUnique({ where: { id: nextCabinId }, select: { id: true, unit: true, name: true } });
    if (!cabin) return { ok: false, affectedRosters: [] };
    nextUnit = cabin.unit;
    nextCabinName = cabin.name;
  }

  if (camper.cabinId === nextCabinId && (nextUnit === null || camper.unit === nextUnit)) return { ok: true, affectedRosters: [] };

  await prisma.camper.update({
    where: { id: camper.id },
    data: {
      cabinId: nextCabinId,
      // Only update unit when assigning to a cabin (cabin determines unit).
      // When clearing the cabin, leave unit untouched so the camper's unit
      // stays intact for roster filters.
      ...(nextUnit ? { unit: nextUnit } : {})
    }
  });

  logAudit({
    action: "camper.cabin_change",
    actorId: actor.id,
    targetType: "camper",
    targetId: camper.id,
    metadata: { camperName: expectedName, fromCabinId: camper.cabinId, toCabinId: nextCabinId }
  });

  // Every activity roster this camper is currently on (camper role or TA
  // role, either one prints a Cabin column) is now stale — flag each
  // distinct offering for reprint, same mechanism the Rosters page already
  // uses for approved switches.
  const activeRegistrations = await prisma.registration.findMany({
    where: { camperId: camper.id, sessionId, status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] } },
    select: {
      offeringId: true,
      offering: { select: { period: true, activity: { select: { name: true } }, area: { select: { name: true } } } }
    }
  });
  const affectedByOffering = new Map<string, string>();
  for (const registration of activeRegistrations) {
    if (affectedByOffering.has(registration.offeringId)) continue;
    const { period, activity, area } = registration.offering;
    affectedByOffering.set(registration.offeringId, `${area.name} · ${activity.name} · Period ${PERIOD_LABEL[period]}`);
  }
  const offeringIds = Array.from(affectedByOffering.keys());

  if (offeringIds.length) {
    await flagRostersForCabinChange({
      sessionId,
      camperId: camper.id,
      camperName: expectedName,
      offeringIds,
      fromCabinName: camper.cabin?.name ?? null,
      toCabinName: nextCabinName,
      decidedByName: actor.name
    });
  }

  revalidateCamperConsumers();

  return {
    ok: true,
    affectedRosters: offeringIds.map((offeringId) => ({ offeringId, label: affectedByOffering.get(offeringId)! }))
  };
}

// quickUpdateCamperCabin removed -- registration no longer offers a cabin
// quick-edit. Real camper cabin changes happen in Camper Management only
// (app/admin/campers), matching the same "one clear place to change this"
// principle as the staff-side cabin assignment editor.

/**
 * Change a camper's unit independent of cabin. Useful when a camper doesn't
 * have a cabin assigned yet, or when their unit needs to be corrected without
 * moving cabins. Typed-name confirmation required (same pattern as
 * updateCamperCabin) since unit changes affect roster filters, eligibility,
 * and reports.
 */
export async function updateCamperUnit(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const unitRaw = String(formData.get("unit") ?? "");
  if (!camperId) return;
  if (!Object.values(Unit).includes(unitRaw as Unit)) return;
  const nextUnit = unitRaw as Unit;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, firstName: true, lastName: true, unit: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  if (camper.unit === nextUnit) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { unit: nextUnit }
  });

  revalidateCamperConsumers();
}

/**
 * Change a single camper's swim level directly, without needing to select
 * them and use the bulk panel. Same typed-name confirmation pattern as
 * updateCamperUnit — swim level gates waterfront eligibility, so a
 * one-off correction deserves the same deliberateness as a unit change,
 * not a silent one-click edit.
 */
export async function updateCamperSwimLevel(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  if (!camperId) return;
  const nextSwimLevel = selectedSwimLevel(formData);
  if (!nextSwimLevel) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, firstName: true, lastName: true, swimLevel: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  if (camper.swimLevel === nextSwimLevel) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { swimLevel: nextSwimLevel }
  });

  revalidateCamperConsumers();
}

export async function updateCamperNickname(formData: FormData): Promise<RosterFlagResult> {
  const actor = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!camperId) return { ok: false, affectedRosters: [] };

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, sessionId: true, firstName: true, lastName: true, nickname: true }
  });
  if (!camper) return { ok: false, affectedRosters: [] };
  const sessionId = camper.sessionId;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return { ok: false, affectedRosters: [] };

  const nextNickname = nickname || null;
  if ((camper.nickname ?? null) === nextNickname) return { ok: true, affectedRosters: [] };

  await prisma.camper.update({
    where: { id: camper.id },
    data: { nickname: nextNickname }
  });

  // Same staleness problem as a cabin change, just for the printed Name
  // column instead of Cabin -- flag every activity roster this camper is
  // currently on (camper or TA role).
  const activeRegistrations = await prisma.registration.findMany({
    where: { camperId: camper.id, sessionId, status: { in: [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN] } },
    select: {
      offeringId: true,
      offering: { select: { period: true, activity: { select: { name: true } }, area: { select: { name: true } } } }
    }
  });
  const affectedByOffering = new Map<string, string>();
  for (const registration of activeRegistrations) {
    if (affectedByOffering.has(registration.offeringId)) continue;
    const { period, activity, area } = registration.offering;
    affectedByOffering.set(registration.offeringId, `${area.name} · ${activity.name} · Period ${PERIOD_LABEL[period]}`);
  }
  const offeringIds = Array.from(affectedByOffering.keys());

  if (offeringIds.length) {
    await flagRostersForNicknameChange({
      sessionId,
      camperId: camper.id,
      camperName: expectedName,
      offeringIds,
      toNickname: nextNickname,
      decidedByName: actor.name
    });
  }

  revalidateCamperConsumers();

  return {
    ok: true,
    affectedRosters: offeringIds.map((offeringId) => ({ offeringId, label: affectedByOffering.get(offeringId)! }))
  };
}

export async function updateCamperMedicalFlags(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const medicalFlags = String(formData.get("medicalFlags") ?? "").trim();
  if (!camperId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { medicalFlags: medicalFlags || null }
  });

  revalidateCamperConsumers();
}

export async function updateCamperAllergies(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  if (!camperId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  const selectedLabelIds = formData.getAll("allergyLabelId").map(String).filter(Boolean);
  const existingLabels = await prisma.allergyLabel.findMany({
    where: { id: { in: selectedLabelIds }, active: true },
    select: { id: true }
  });
  const customNames = String(formData.get("customAllergies") ?? "")
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  const customLabels = await Promise.all(customNames.map((name) => prisma.allergyLabel.upsert({
    where: { name },
    create: { name, category: "Custom" },
    update: { active: true }
  })));
  const nextLabelIds = Array.from(new Set([
    ...existingLabels.map((label) => label.id),
    ...customLabels.map((label) => label.id)
  ]));

  await prisma.$transaction([
    prisma.camperAllergy.deleteMany({ where: { camperId: camper.id } }),
    ...nextLabelIds.map((allergyLabelId) => prisma.camperAllergy.create({
      data: {
        camperId: camper.id,
        allergyLabelId,
        notes: String(formData.get(`allergyNote:${allergyLabelId}`) ?? "").trim() || null
      }
    }))
  ]);

  revalidateCamperConsumers();
}

export async function updateCamperCounselorAssistant(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  if (!camperId) return;

  const camper = await prisma.camper.findFirst({
    where: { id: camperId, active: true },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!camper) return;

  const expectedName = `${camper.firstName} ${camper.lastName}`;
  if (confirmation(formData, "confirmCamperName").toLowerCase() !== expectedName.toLowerCase()) return;

  await prisma.camper.update({
    where: { id: camper.id },
    data: { counselorAssistant: formData.get("counselorAssistant") === "on" }
  });

  revalidateCamperConsumers();
}

export async function deleteCamper(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const camperId = String(formData.get("camperId") ?? "");
  const confirm = confirmation(formData, "confirmDelete").toUpperCase();
  if (!camperId || confirm !== "DELETE") return;

  // BUDDY NUMBER PERMANENCE: if this camper holds a buddy number, retire
  // it into the session's monotonic high-water mark BEFORE the row (and
  // its number) is hard-deleted -- inside one transaction so the number
  // can never slip through. Generation starts above the high water, so a
  // deleted camper's number is never reissued to someone else, even if
  // they held the current max. (Deactivating instead of deleting keeps
  // the row and needs none of this.) See admin/buddy-numbers/actions.ts.
  await prisma.$transaction(async (tx) => {
    const camper = await tx.camper.findUnique({
      where: { id: camperId },
      select: { buddyNumber: true, sessionId: true }
    });
    if (!camper) return;

    if (camper.buddyNumber !== null) {
      const sessionRow = await tx.session.findUnique({
        where: { id: camper.sessionId },
        select: { buddyNumberHighWater: true }
      });
      if (sessionRow && sessionRow.buddyNumberHighWater < camper.buddyNumber) {
        await tx.session.update({
          where: { id: camper.sessionId },
          data: { buddyNumberHighWater: camper.buddyNumber }
        });
      }
    }

    await tx.camper.delete({ where: { id: camperId } });
  });

  revalidateCamperConsumers();
}

export async function createCamperFilterGroup(formData: FormData) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  // Explicit from the form (hidden field carrying whichever session the page
  // is viewing) rather than always active -- a saved registration-pool group
  // is tied to one specific session, same reasoning as createCamper.
  const requestedSessionId = String(formData.get("sessionId") ?? "").trim();
  const sessionId = requestedSessionId || (await activeSessionId());
  if (!sessionId) return;

  const name = confirmation(formData, "groupName");
  if (!name) return;

  const weekBlocks = formData
    .getAll("weekBlock")
    .map(String)
    .filter((value): value is WeekBlock => Object.values(WeekBlock).includes(value as WeekBlock));
  const sessionDesignations = formData.getAll("designation").map(String).filter(Boolean);

  await prisma.camperFilterGroup.upsert({
    where: { sessionId_name: { sessionId, name } },
    create: {
      sessionId,
      name,
      description: confirmation(formData, "groupDescription") || null,
      weekBlocks: writeStringArray(weekBlocks),
      sessionDesignations: writeStringArray(sessionDesignations),
      createdByUserId: user.id
    },
    update: {
      description: confirmation(formData, "groupDescription") || null,
      weekBlocks: writeStringArray(weekBlocks),
      sessionDesignations: writeStringArray(sessionDesignations),
      active: true
    }
  });

  revalidateCamperConsumers();
}

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Archives an existing group by its own id -- no active-session check needed, same reasoning as the per-camper editors. */
export async function archiveCamperFilterGroup(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const id = String(formData.get("groupId") ?? "");
  if (!id) return;

  await prisma.camperFilterGroup.updateMany({
    where: { id },
    data: { active: false }
  });

  revalidateCamperConsumers();
}
