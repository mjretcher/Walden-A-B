// Sent by the client as the override "id" when Mike explicitly rejects every
// fuzzy/exact-match suggestion for a no-person/multiple-matches row and wants
// a brand-new record created instead -- e.g. "Judah Carps" fuzzy-matching
// "Colin Carps" (same last name only) and "Judah Slatkin" (same first name
// only) when neither is actually the same kid. Distinct from simply leaving
// the row unmatched: that means "don't touch this person at all," while this
// means "yes, create them, just not from any of these."
//
// Lives in its own plain module (not actions.ts) because a "use server" file
// may only export async functions -- a non-async const export there breaks
// the Next.js build even though it passes a plain esbuild syntax check.
export const CREATE_NEW_SENTINEL = "__CREATE_NEW__";
