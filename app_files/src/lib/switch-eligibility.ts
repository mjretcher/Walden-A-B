import { LimitType, SwimLevel, Unit, UserRole } from "@prisma/client";
import { canOverrideCapacity } from "@/lib/access";
import { readStringArray } from "@/lib/local-arrays";
import { SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";

export type VerdictTone = "ok" | "warn" | "block" | "current";

export type EligibilityVerdict = {
  tone: VerdictTone;
  /** Short verdict sentence shown on the offering card. */
  label: string;
  /** Whether THIS user may select the offering as a destination. */
  selectable: boolean;
  /** "Select →" or "Select anyway →". */
  selectLabel: string;
  /** Tooltip shown when the offering is not selectable for this user. */
  disabledReason?: string;
  /** True when selecting flags the resulting switch as a capacity override. */
  override: boolean;
};

type OfferingForVerdict = {
  eligibleUnits: string;
  eligibleSwimLevels: string;
  preAssigned: boolean;
  limitType: LimitType;
  rosterLimit: number | null;
  allowOverride: boolean;
};

/**
 * Maps a camper + destination offering into one of the verdict states from the
 * switches redesign spec (Step 2 card grid). Hard eligibility blocks
 * (unit/swim/pre-assigned) are only overridable by exec admins; capacity blocks
 * follow the offering's limit type and allowOverride flag.
 */
export function computeOfferingVerdict({
  camperFirstName,
  camperUnit,
  camperSwimLevel,
  counselorAssistant,
  offering,
  enrollmentCount,
  isCurrent,
  role
}: {
  camperFirstName: string;
  camperUnit: Unit;
  camperSwimLevel: SwimLevel;
  counselorAssistant: boolean;
  offering: OfferingForVerdict;
  enrollmentCount: number;
  isCurrent: boolean;
  role: UserRole;
}): EligibilityVerdict {
  if (isCurrent) {
    return { tone: "current", label: "Current offering", selectable: false, selectLabel: "", override: false };
  }

  const isExec = role === UserRole.EXECUTIVE_ADMIN;
  const canOverride = canOverrideCapacity(role);

  // Hard eligibility blocks — area heads cannot bypass these, only exec admins.
  const eligibleUnits = readStringArray(offering.eligibleUnits);
  const eligibleSwimLevels = readStringArray(offering.eligibleSwimLevels);
  const unitOk = counselorAssistant || eligibleUnits.includes(camperUnit);
  const swimOk = counselorAssistant || eligibleSwimLevels.length === 0 || eligibleSwimLevels.includes(camperSwimLevel);

  if (!unitOk || !swimOk || offering.preAssigned) {
    const label = !unitOk
      ? `${UNIT_LABEL[camperUnit]} not eligible for this period`
      : !swimOk
        ? `Swim level ${SWIM_LABEL[camperSwimLevel]} not eligible`
        : "Pre-assigned — approval required";
    return {
      tone: "block",
      label,
      selectable: isExec,
      selectLabel: "Select anyway →",
      disabledReason: isExec ? undefined : "Contact exec admin",
      override: true
    };
  }

  const unlimited = offering.limitType === LimitType.UNLIMITED;
  const specialApproval = offering.limitType === LimitType.SPECIAL_APPROVAL;
  const atCapacity = offering.rosterLimit != null && enrollmentCount >= offering.rosterLimit;

  if (!unlimited && atCapacity) {
    if (offering.limitType === LimitType.FLEXIBLE) {
      return { tone: "warn", label: "At capacity — limit is a guide", selectable: true, selectLabel: "Select →", override: true };
    }
    // FIXED (or special-approval) at capacity.
    if (!offering.allowOverride) {
      return {
        tone: "block",
        label: "At capacity — exec admin only",
        selectable: isExec,
        selectLabel: "Select anyway →",
        disabledReason: isExec ? undefined : "Contact exec admin",
        override: true
      };
    }
    return {
      tone: "warn",
      label: "At capacity — override required",
      selectable: canOverride,
      selectLabel: "Select →",
      disabledReason: canOverride ? undefined : "Contact exec admin",
      override: true
    };
  }

  if (specialApproval) {
    return {
      tone: "warn",
      label: "Approval required",
      selectable: canOverride,
      selectLabel: "Select →",
      disabledReason: canOverride ? undefined : "Contact exec admin",
      override: false
    };
  }

  return { tone: "ok", label: `${camperFirstName} is eligible`, selectable: true, selectLabel: "Select →", override: false };
}
