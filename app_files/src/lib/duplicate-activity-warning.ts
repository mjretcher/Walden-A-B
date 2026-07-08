import { Period, RegistrationWindow } from "@prisma/client";
import { PERIOD_LABEL } from "@/lib/periods";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

export type ActivityRegistrationRef = { period: Period; registrationWindow: RegistrationWindow };

// Non-blocking awareness flag for the switches flow: a camper ending up
// registered for the SAME activity more than once, either in another period
// this quarter (e.g. Tubing on both an A-day and a B-day) or already
// completed in an earlier quarter this session (e.g. took Tubing in
// Weeks 1-2, now being switched into Tubing again in Weeks 3-4). Mike wants
// staff to see this, not be blocked by it -- it's common enough on purpose
// (a camper loving an activity) that it should never disable submit.
export function describeDuplicateActivity(matches: ActivityRegistrationRef[], targetWindow: RegistrationWindow): string | null {
  if (!matches.length) return null;

  const sameWindow = matches.filter((match) => match.registrationWindow === targetWindow);
  const otherWindows = matches.filter((match) => match.registrationWindow !== targetWindow);

  const parts: string[] = [];
  if (sameWindow.length) {
    const periods = sameWindow.map((match) => PERIOD_LABEL[match.period]).join(", ");
    parts.push(`already has this activity this quarter (${periods})`);
  }
  if (otherWindows.length) {
    const detail = otherWindows
      .map((match) => `${PERIOD_LABEL[match.period]} in ${REGISTRATION_WINDOW_LABEL[match.registrationWindow]}`)
      .join("; ");
    parts.push(`previously took it — ${detail}`);
  }

  return parts.length ? `Duplicate activity: ${parts.join(" · ")}` : null;
}
