export const A_DAY_PERIODS = ["P1A", "P2A", "P3A", "P4A", "P5A"] as const;
export const B_DAY_PERIODS = ["P1B", "P2B", "P3B", "P4B", "P5B"] as const;
export const AB_DAY_PERIODS = [...B_DAY_PERIODS, ...A_DAY_PERIODS] as const;
export const DEFAULT_STAFF_TARGET = 2;

export type MenuDaySelection = "SINGLE" | "A" | "B" | "BOTH" | "CUSTOM";

export function periodsForMenuSelection({
  daySelection,
  singlePeriod,
  checkedPeriods
}: {
  daySelection: string;
  singlePeriod: string;
  checkedPeriods: string[];
}) {
  const uniqueChecked = uniquePeriods(checkedPeriods);
  if (daySelection === "A") return [...A_DAY_PERIODS];
  if (daySelection === "B") return [...B_DAY_PERIODS];
  if (daySelection === "BOTH") return [...B_DAY_PERIODS, ...A_DAY_PERIODS];
  if (daySelection === "CUSTOM" && uniqueChecked.length) return uniqueChecked;
  return uniquePeriods([singlePeriod || B_DAY_PERIODS[0]]);
}

export function filterActivitiesForArea<T extends { areaId: string }>(activities: T[], areaId: string) {
  return activities.filter((activity) => activity.areaId === areaId);
}

export function activeCamperCount<T extends { registrationRole?: string; status?: string }>(registrations: T[]) {
  return registrations.filter((registration) => {
    const role = registration.registrationRole ?? "CAMPER";
    const status = registration.status ?? "ACTIVE";
    return role === "CAMPER" && (status === "ACTIVE" || status === "OVERRIDDEN");
  }).length;
}

export function visibleMenuRows<T extends { visible: boolean; includeInPrint: boolean }>(rows: T[], printOnly = false) {
  return rows.filter((row) => row.visible && (!printOnly || row.includeInPrint));
}

function uniquePeriods(periods: string[]) {
  const allowed = new Set(AB_DAY_PERIODS);
  return Array.from(new Set(periods.filter((period) => allowed.has(period as (typeof AB_DAY_PERIODS)[number]))));
}
