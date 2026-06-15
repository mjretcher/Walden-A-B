import { Period } from "@prisma/client";

export const SKI_STAFFING_LABEL = "Ski";

function normalizedActivityName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isTubingActivity(name: string) {
  const normalized = normalizedActivityName(name);
  return /\btube\b|\btubing\b/.test(normalized);
}

export function isSkiStaffingActivity(name: string) {
  const normalized = normalizedActivityName(name);
  return isTubingActivity(name) || /\bwater ski\b|\bwaterski\b|\bski\b|\bskiing\b/.test(normalized);
}

export function staffingActivityLabel(activityName: string) {
  return isSkiStaffingActivity(activityName) ? SKI_STAFFING_LABEL : activityName;
}

export function staffingAreaLabel(areaName: string, activityName: string) {
  return isSkiStaffingActivity(activityName) ? SKI_STAFFING_LABEL : areaName;
}

export function staffingGroupKey(period: Period | string, activityName: string) {
  return isSkiStaffingActivity(activityName) ? `${period}:${SKI_STAFFING_LABEL}` : null;
}
