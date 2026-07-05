// A camper's nickname, when set, is what should print on cards and
// rosters — the first name stays the legal/registration name everywhere
// else (camper management, search, imports, exports). This is the one
// place that decides "what name goes on paper," so every printed surface
// stays consistent if that decision ever changes.
export function camperPrintName(camper: { firstName: string; lastName: string; nickname?: string | null }): string {
  const displayFirst = camper.nickname?.trim() || camper.firstName;
  return `${displayFirst} ${camper.lastName}`;
}
