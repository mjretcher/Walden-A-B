/**
 * Camp wall-clock time. Server components render in the deploy region's
 * timezone (UTC on Vercel), so any `new Date().toLocaleString()` without an
 * explicit timeZone prints ~4-5 hours ahead of camp -- which is exactly the
 * "Generated at 3:53 PM" bug on the print sheets when it was 11:53 AM at
 * camp. Every server-rendered "Generated at" stamp goes through here so the
 * timezone lives in one place and can't drift page by page.
 *
 * America/Detroit is the camp's actual location and matches the period-time
 * detection in lib/period-times.ts (session-cookie cutoffs use
 * America/New_York, the same offset). DST is handled by the zone itself.
 */
export const CAMP_TIME_ZONE = "America/Detroit";

/** "7/20/26, 11:53 AM" in camp time -- for print-sheet "Generated at" stamps. */
export function formatGeneratedAt(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMP_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}
