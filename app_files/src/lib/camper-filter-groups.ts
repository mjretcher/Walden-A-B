import { Prisma, WeekBlock } from "@prisma/client";
import { readStringArray } from "@/lib/local-arrays";

export const WEEK_BLOCK_LABEL: Record<WeekBlock, string> = {
  [WeekBlock.WK1_2]: "Weeks 1-2",
  [WeekBlock.WK3_4]: "Weeks 3-4",
  [WeekBlock.WK5_6]: "Weeks 5-6",
  [WeekBlock.WK7]: "Week 7"
};

export type CamperFilterGroupRecord = {
  id: string;
  weekBlocks: string | null;
  sessionDesignations: string | null;
};

export type CamperPoolParams = {
  weekBlock?: string | string[];
  designation?: string | string[];
  group?: string | string[];
};

export function asParamArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function selectedWeekBlocks(values: string[]) {
  const allWeekBlocks = Object.values(WeekBlock) as WeekBlock[];
  return Array.from(new Set(values)).filter((value): value is WeekBlock => allWeekBlocks.includes(value as WeekBlock));
}

export function resolveCamperPoolFilters(params: CamperPoolParams, groups: CamperFilterGroupRecord[]) {
  const selectedGroupIds = asParamArray(params.group);
  const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id));
  const weekBlocks = selectedWeekBlocks([
    ...asParamArray(params.weekBlock),
    ...selectedGroups.flatMap((group) => readStringArray(group.weekBlocks))
  ]);
  const designations = Array.from(new Set([
    ...asParamArray(params.designation),
    ...selectedGroups.flatMap((group) => readStringArray(group.sessionDesignations))
  ])).filter(Boolean);

  return { selectedGroupIds, weekBlocks, designations };
}

export function camperPoolWhere({ weekBlocks, designations }: { weekBlocks: WeekBlock[]; designations: string[] }) {
  const poolFilters: Prisma.CamperWhereInput[] = [];
  if (weekBlocks.length) poolFilters.push({ weekEnrollments: { some: { weekBlock: { in: weekBlocks } } } });
  if (designations.length) poolFilters.push({ sessionDesignations: { some: { label: { in: designations } } } });
  return poolFilters.length ? ({ OR: poolFilters } satisfies Prisma.CamperWhereInput) : {};
}

