import { ActivityOffering, Camper, LimitType, Registration } from "@prisma/client";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";
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
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!offering.active) errors.push("Offering is inactive.");
  if (!offering.visibleForCamperRegistration) errors.push("This offering is hidden from camper registration.");
  if (!camper.active) errors.push("Camper is inactive.");
  if (offering.preAssigned && !override) errors.push("This is a pre-assigned activity.");
  const eligibleUnits = readStringArray(offering.eligibleUnits);

  // Counselor Assistants are not bound by unit eligibility — they may register
  // for any class, whether as a camper or as a teaching assistant.
  if (!camper.counselorAssistant && !eligibleUnits.includes(camper.unit)) {
    errors.push(`Camper is ${UNIT_LABEL[camper.unit]}, which is not eligible for ${PERIOD_LABEL[offering.period]}.`);
  }
  if (existingRegistration) {
    errors.push(`Camper already has a ${PERIOD_LABEL[offering.period]} registration. Use the switch workflow to preserve history.`);
  }

  const isCapacityManaged = offering.limitType !== LimitType.UNLIMITED;
  const isFull = Boolean(offering.rosterLimit && enrollmentCount >= offering.rosterLimit);
  if (offering.limitType === LimitType.SPECIAL_APPROVAL && !override) {
    errors.push("This offering requires Area Head or Executive Admin approval.");
  }
  if (isCapacityManaged && isFull && !override) {
    errors.push("Class is full. Requires Area Head or Executive Admin override.");
  }
  if (isCapacityManaged && isFull && override) {
    warnings.push("Capacity override will place this offering over its roster limit.");
  }

  return {
    allowed: errors.length === 0,
    requiresOverride: errors.some((error) => error.includes("override") || error.includes("approval")),
    isFull: isCapacityManaged && isFull,
    errors,
    warnings
  };
}
