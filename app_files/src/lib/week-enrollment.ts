import { WeekBlock } from "@prisma/client";
import { WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";

const WEEK_BLOCK_ORDER: WeekBlock[] = [WeekBlock.WK1_2, WeekBlock.WK3_4, WeekBlock.WK5_6, WeekBlock.WK7];

/**
 * "Leaves after Weeks 5-6" when the camper's last enrolled week block is not
 * the final week of the session. Returns null when it can't be determined
 * (no week enrollments) or the camper stays through the final week.
 */
export function departureNote(weekEnrollments: { weekBlock: WeekBlock }[]): string | null {
  if (!weekEnrollments.length) return null;
  const lastIndex = Math.max(...weekEnrollments.map((week) => WEEK_BLOCK_ORDER.indexOf(week.weekBlock)));
  const lastBlock = WEEK_BLOCK_ORDER[lastIndex];
  if (lastBlock === WeekBlock.WK7) return null;
  return `Leaves after ${WEEK_BLOCK_LABEL[lastBlock]}`;
}
