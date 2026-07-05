import { ActivityOffering, Camper, LimitType, Registration } from "@prisma/client";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { readStringArray } from "@/lib/local-arrays";

type OfferingForValidation = Pick<
  ActivityOffering,
  | "active"
  | "preAssigned"
  | "visibleForCamperRegistration"
  | "period"
  | "eligibleUnits"
  | "eligibleSwimLevels"
  | "rosterLimit"
  | "limitType"
  | "allowOverride"
>;

type CamperForValidation = Pick<Camper, "active" | "unit" | "swimLevel" | "status" | "counselorAssistant">;

export function validateRegistration({
  camper,
  offering,
  existingRegistration,
  enrollmentCount,
  override = false
}: {
  camper: CamperForValidation;
  offering: OfferingForValidation;
  existingRegistration?: Pick<Registration, "id" | "offeringId"> | null;
  enrollmentCount: number;
  override?: boolean;
}) {
  // Hard blocks: never bypassable by an Area Head / Exec Admin override,
  // no matter what.
  const blockingErrors: string[] = [];
  // Everything here CAN be bypassed by override — unit, swim level, capacity,
  // special approval, pre-assigned. These get collected separately so
  // `requiresOverride` can say "yes, override would fix this" precisely,
  // rather than the old approach of guessing from error text substrings
  // (which never matched the unit/swim-level messages at all, so those two
  // couldn't be overridden no matter what the person clicked).
  const overridableErrors: string[] = [];
  const warnings: string[] = [];

  if (!offering.active) blockingErrors.push("Offering is inactive.");
  if (!offering.visibleForCamperRegistration) blockingErrors.push("This offering is hidden from camper registration.");
  if (!camper.active) blockingErrors.push("Camper is inactive.");
  if (existingRegistration) {
    blockingErrors.push(`Camper already has a ${PERIOD_LABEL[offering.period]} registration. Use the switch workflow to preserve history.`);
  }

  if (offering.preAssigned) overridableErrors.push("This is a pre-assigned activity.");

  // Counselor Assistants are not bound by unit/swim eligibility — they may
  // register for any class, whether as a camper or as a teaching assistant.
  // An empty eligible list means "open to everyone," not "open to no one."
  const eligibleUnits = readStringArray(offering.eligibleUnits);
  if (!camper.counselorAssistant && eligibleUnits.length && !eligibleUnits.includes(camper.unit)) {
    overridableErrors.push(`Camper is ${UNIT_LABEL[camper.unit]}, which is not eligible for ${PERIOD_LABEL[offering.period]}.`);
  }

  const eligibleSwimLevels = readStringArray(offering.eligibleSwimLevels);
  if (!camper.counselorAssistant && eligibleSwimLevels.length && !eligibleSwimLevels.includes(camper.swimLevel)) {
    overridableErrors.push(`Camper's swim level (${SWIM_LABEL[camper.swimLevel]}) is not eligible for ${PERIOD_LABEL[offering.period]}.`);
  }

  const isCapacityManaged = offering.limitType !== LimitType.UNLIMITED;
  const isFull = Boolean(offering.rosterLimit && enrollmentCount >= offering.rosterLimit);
  if (offering.limitType === LimitType.SPECIAL_APPROVAL) {
    overridableErrors.push("This offering requires Area Head or Executive Admin approval.");
  }
  if (isCapacityManaged && isFull) {
    overridableErrors.push("Class is full. Requires Area Head or Executive Admin override.");
  }

  const errors = override ? [...blockingErrors] : [...blockingErrors, ...overridableErrors];
  if (override) warnings.push(...overridableErrors);

  return {
    allowed: errors.length === 0,
    // True whenever an override would actually clear the way: no hard
    // blocks, and at least one overridable reason present. Checked
    // independent of whether `override` was already applied, so the client
    // can offer an "allow override" action on the very first rejection.
    requiresOverride: blockingErrors.length === 0 && overridableErrors.length > 0,
    isFull: isCapacityManaged && isFull,
    // Surfaced so the API route can build a specific, attributable
    // overrideReason ("approved by X — overrode: ...") instead of a generic
    // one, when an override is actually being used.
    overriddenReasons: override ? overridableErrors : [],
    errors,
    warnings
  };
}
