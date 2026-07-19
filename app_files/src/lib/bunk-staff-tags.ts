// Bunk Management: two small pure helpers shared between the assignment
// board and the print view, so both read the exact same live signal off
// the Staff record rather than maintaining their own copies.

/**
 * Derives the camp-hierarchy tag -- Girls Side Head / Boys Side Head /
 * Unit Head / Unit Programmer -- directly from the same position/position2
 * free-text fields already maintained on the Staff Management screen --
 * never stored anywhere else, so it can never go stale relative to that
 * screen. Returns null for a plain counselor (no tag shown).
 *
 * Matches the same join-then-regex-test convention already used elsewhere
 * for position parsing (see staffScreamEligible in lib/real-data-import.ts),
 * but deliberately more permissive than a single exact phrase: real HR job
 * titles vary in wording/abbreviation (typos, "UP"/"UH" shorthand, etc.),
 * so each tier matches on its full phrase OR the same shorthand already
 * used on the paper cabin sheets. Checked in hierarchy order (Side Head
 * outranks Unit Head outranks Unit Programmer) so a title carrying more
 * than one signal reports the highest one.
 *
 * If real position data uses wording this still doesn't catch, that's a
 * sign to widen these patterns further, not a sign the approach is wrong
 * -- the source of truth stays Staff Management either way.
 */
export function deriveCabinRoleLabel(position?: string | null, position2?: string | null): string | null {
  const joined = `${position ?? ""} ${position2 ?? ""}`;

  if (/girls?\s*side\s*head|\bGSH\b/i.test(joined)) return "Girls Side Head";
  if (/boys?\s*side\s*head|\bBSH\b/i.test(joined)) return "Boys Side Head";
  if (/unit\s*head|\bUH\b/i.test(joined)) return "Unit Head";
  if (/unit\s*program(?:m?er|ming)|\bprogram(?:m?er)\b|\bUP\b/i.test(joined)) return "Unit Programmer";
  return null;
}

/** Same abbreviation convention used on the paper cabin sheets, for print output. */
export function cabinRoleSuffix(label: string | null): string {
  if (label === "Unit Head") return " (UH)";
  if (label === "Unit Programmer") return " (UP)";
  if (label === "Girls Side Head") return " (GSH)";
  if (label === "Boys Side Head") return " (BSH)";
  return "";
}

/**
 * One-call convenience for the reports suite: " (UH)" / " (UP)" /
 * " (BSH)" / " (GSH)" straight off a Staff record's position fields, ""
 * for everyone else. DISPLAY-ONLY — never feed this into strings used
 * for matching or dedup (e.g. the CA name-matching in
 * lib/ca-staff-exclusion.ts compares raw first/last names; a tagged name
 * would silently stop matching).
 */
export function staffRoleSuffix(staff: { position?: string | null; position2?: string | null }): string {
  return cabinRoleSuffix(deriveCabinRoleLabel(staff.position, staff.position2));
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
