// Bunk Management: two small pure helpers shared between the assignment
// board and the print view, so both read the exact same live signal off
// the Staff record rather than maintaining their own copies.

/**
 * Derives the "Unit Head" / "Unit Programmer" tag directly from the same
 * position/position2 free-text fields already maintained on the Staff
 * Management screen -- never stored on the assignment itself, so it can
 * never go stale relative to that screen. Returns null for a plain
 * counselor (no tag shown), matching how CAs and plain staff render with
 * no suffix at all.
 *
 * Matches the same join-then-regex-test convention already used elsewhere
 * for position parsing (see staffScreamEligible in lib/real-data-import.ts).
 */
export function deriveCabinRoleLabel(position?: string | null, position2?: string | null): string | null {
  const joined = `${position ?? ""} ${position2 ?? ""}`;
  if (/unit\s*head/i.test(joined)) return "Unit Head";
  if (/unit\s*programmer/i.test(joined)) return "Unit Programmer";
  return null;
}

/** Same abbreviation used in print output for the two tags above. */
export function cabinRoleSuffix(label: string | null): string {
  if (label === "Unit Head") return " (UH)";
  if (label === "Unit Programmer") return " (UP)";
  return "";
}

/**
 * Identical logic to the isLifeguard checks already used by the
 * Waterfront Staffing report, the Staff A/B Schedule, and the Scream
 * Session board (lib/staff-schedule-report.ts, components/scream-session-board.tsx) --
 * checks the certifications relation first, falls back to the legacy
 * statusCertification free-text field. Reused here verbatim rather than
 * re-derived, so a staff member marked LG anywhere in the app is marked
 * LG here too.
 */
export function isLifeguardStaff(staff: { certifications: { name: string }[]; statusCertification: string | null }): boolean {
  const certText = staff.certifications.map((c) => c.name).join(" ");
  return /\bLG\b|lifeguard/i.test(`${certText} ${staff.statusCertification ?? ""}`);
}
