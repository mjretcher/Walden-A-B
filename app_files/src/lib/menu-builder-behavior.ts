export const A_DAY_PERIODS = ["P1A", "P2A", "P3A", "P4A", "P5A"] as const;
export const B_DAY_PERIODS = ["P1B", "P2B", "P3B", "P4B", "P5B"] as const;
export const AB_DAY_PERIODS = [...B_DAY_PERIODS, ...A_DAY_PERIODS] as const;
export const DEFAULT_STAFF_TARGET = 2;
export const UNLIMITED_CAPACITY_TOTAL = 30;

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

export function isPrintableMenuOffering<T extends { includeInPrint?: boolean; menuRows?: { visible: boolean; includeInPrint: boolean }[] }>(offering: T) {
  if (offering.includeInPrint === false) return false;
  if (!offering.menuRows?.length) return true;
  return visibleMenuRows(offering.menuRows, true).length > 0;
}

export function effectiveCapacity(rosterLimit: number | null) {
  return rosterLimit ?? UNLIMITED_CAPACITY_TOTAL;
}

export function capacityTotal<T extends { includeInPrint?: boolean; rosterLimit: number | null; registrations: unknown[]; menuRows?: { visible: boolean; includeInPrint: boolean }[] }>(offerings: T[]) {
  return offerings.filter(isPrintableMenuOffering).reduce(
    (total, offering) => ({
      filled: total.filled + offering.registrations.length,
      capacity: total.capacity + effectiveCapacity(offering.rosterLimit)
    }),
    { filled: 0, capacity: 0 }
  );
}

export function formatCapacityTotal(total: { filled: number; capacity: number }) {
  return `${total.filled}/${total.capacity}`;
}

function uniquePeriods(periods: string[]) {
  const allowed = new Set(AB_DAY_PERIODS);
  return Array.from(new Set(periods.filter((period) => allowed.has(period as (typeof AB_DAY_PERIODS)[number]))));
}
