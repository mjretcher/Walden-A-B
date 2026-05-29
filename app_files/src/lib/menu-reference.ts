import { LimitType, Period, SwimLevel, Unit } from "@prisma/client";

export const areaNames = [
  "Waterfront",
  "Athletics",
  "Fitness",
  "Riding",
  "Arts & Crafts",
  "Performing Arts",
  "Media & Tech",
  "Nature"
];

export const activitiesByArea: Record<string, string[]> = {
  Waterfront: [
    "Kayak",
    "Fishing",
    "Stand Up Paddle Board",
    "Blue Gill Swim",
    "Canoe",
    "Mackinac/lap swim",
    "Sailing",
    "Swim Instruction",
    "Tube",
    "Water-skiing"
  ],
  Athletics: [
    "Archery",
    "Soccer",
    "Tennis",
    "Baseball",
    "Gymnastics",
    "Gymnastics Advanced",
    "Pickleball",
    "Bike Repair",
    "Volleyball",
    "Frisbee Golf",
    "Game Room/Playground",
    "Rugby",
    "Co-ed JWBA",
    "Fencing",
    "WBA",
    "Soccer League (WSL)",
    "A-Field-a-Rama"
  ],
  Fitness: ["Fit Walk", "Hammock", "Yoga"],
  Riding: ["Riding"],
  "Arts & Crafts": [
    "Candles",
    "Strings & Beads",
    "Clay",
    "Free Draw",
    "Project Runway",
    "Lapidary",
    "Tie-Dye",
    "Shrinky Dink",
    "Drawing",
    "Sculpture",
    "Out of the Box"
  ],
  "Performing Arts": ["Drama/Play", "Bachata", "Jam Session", "Improv/Comedy", "Meditation"],
  "Media & Tech": [
    "Walden Pond",
    "Video",
    "Chess & Checkers",
    "B&W Photo",
    "Radio",
    "Digital Photo",
    "Beats Music Creation"
  ],
  Nature: ["Farm & Garden", "Animal Care", "Nature Class", "Campcraft", "Kittens in Meadow", "Hikes and Trips", "Hikes"]
};

const allUnits = [Unit.UNIT1, Unit.UNIT2, Unit.UNIT3, Unit.UNIT4];
const allSwimLevels = [SwimLevel.BLUEGILL, SwimLevel.WALLEYE, SwimLevel.MUSKIE];

export type MenuOfferingSeed = {
  period: Period;
  area: string;
  activity: string;
  rosterLimit?: number;
  eligibleUnits?: Unit[];
  eligibleSwimLevels?: SwimLevel[];
  limitType?: LimitType;
  preAssigned?: boolean;
  staffTarget?: number;
  notes?: string;
};

function offering(
  period: Period,
  area: string,
  activity: string,
  rosterLimit?: number,
  eligibleUnits = allUnits,
  notes?: string
): MenuOfferingSeed {
  const isPreAssigned = area === "Riding";
  const waterfrontHeavy = ["Water-skiing", "Tube", "Sailing", "Canoe"].includes(activity);
  const limitType = rosterLimit ? LimitType.FIXED : LimitType.SPECIAL_APPROVAL;

  return {
    period,
    area,
    activity,
    rosterLimit,
    eligibleUnits,
    eligibleSwimLevels: activity === "Blue Gill Swim" ? [SwimLevel.BLUEGILL] : allSwimLevels,
    limitType,
    preAssigned: isPreAssigned,
    staffTarget: isPreAssigned ? 2 : waterfrontHeavy ? 3 : 1,
    notes
  };
}

const u12 = [Unit.UNIT1, Unit.UNIT2];
const u34 = [Unit.UNIT3, Unit.UNIT4];
const u234 = [Unit.UNIT2, Unit.UNIT3, Unit.UNIT4];

// Extracted from /Users/mike/Downloads/B MENU 2023 S2.docx.
export const bMenu2023Session2Offerings: MenuOfferingSeed[] = [
  offering(Period.P1B, "Waterfront", "Kayak", 10),
  offering(Period.P1B, "Waterfront", "Fishing", 12),
  offering(Period.P1B, "Waterfront", "Stand Up Paddle Board", 8, u34),
  offering(Period.P1B, "Waterfront", "Blue Gill Swim", 20, u12),
  offering(Period.P1B, "Athletics", "Archery", 10),
  offering(Period.P1B, "Athletics", "Co-ed JWBA", 20, u12),
  offering(Period.P1B, "Athletics", "Fencing", 8, u234),
  offering(Period.P1B, "Athletics", "Tennis", 24, u234),
  offering(Period.P1B, "Athletics", "Baseball", 20, u34),
  offering(Period.P1B, "Athletics", "Gymnastics", 10),
  offering(Period.P1B, "Athletics", "Pickleball", 10),
  offering(Period.P1B, "Athletics", "Bike Repair", 4),
  offering(Period.P1B, "Fitness", "Fit Walk", 15),
  offering(Period.P1B, "Fitness", "Hammock", 15),
  offering(Period.P1B, "Riding", "Riding", undefined, allUnits, "You will be given your riding time and day before registration."),
  offering(Period.P1B, "Arts & Crafts", "Candles", 6, u12),
  offering(Period.P1B, "Arts & Crafts", "Strings & Beads", 12),
  offering(Period.P1B, "Arts & Crafts", "Clay", 8, u34),
  offering(Period.P1B, "Arts & Crafts", "Free Draw", 12),
  offering(Period.P1B, "Arts & Crafts", "Project Runway", 8),
  offering(Period.P1B, "Performing Arts", "Drama/Play", 25),
  offering(Period.P1B, "Media & Tech", "Walden Pond", 12),
  offering(Period.P1B, "Media & Tech", "Video", 6),
  offering(Period.P1B, "Media & Tech", "Chess & Checkers", 10),
  offering(Period.P1B, "Nature", "Farm & Garden", 12),
  offering(Period.P1B, "Nature", "Animal Care", 12),

  offering(Period.P2B, "Waterfront", "Canoe", 16),
  offering(Period.P2B, "Waterfront", "Mackinac/lap swim", 12, u234),
  offering(Period.P2B, "Waterfront", "Sailing", 12),
  offering(Period.P2B, "Waterfront", "Swim Instruction", 3),
  offering(Period.P2B, "Waterfront", "Tube", 30),
  offering(Period.P2B, "Waterfront", "Water-skiing", 18, allUnits, "Imported as Ski from B Menu."),
  offering(Period.P2B, "Waterfront", "Stand Up Paddle Board", 9, u34),
  offering(Period.P2B, "Athletics", "Soccer", 20),
  offering(Period.P2B, "Athletics", "Tennis", 20),
  offering(Period.P2B, "Athletics", "WBA", 20, u34),
  offering(Period.P2B, "Athletics", "Volleyball", 20),
  offering(Period.P2B, "Athletics", "Archery", 10),
  offering(Period.P2B, "Athletics", "Gymnastics Advanced", 10),
  offering(Period.P2B, "Fitness", "Fit Walk", 15),
  offering(Period.P2B, "Riding", "Riding", undefined, allUnits, "Pre-assigned riding block."),
  offering(Period.P2B, "Arts & Crafts", "Candles", 6, u34),
  offering(Period.P2B, "Arts & Crafts", "Lapidary", 6, u34),
  offering(Period.P2B, "Arts & Crafts", "Tie-Dye", 12),
  offering(Period.P2B, "Arts & Crafts", "Clay", 8),
  offering(Period.P2B, "Arts & Crafts", "Strings & Beads", 12),
  offering(Period.P2B, "Media & Tech", "B&W Photo", 6, u34),
  offering(Period.P2B, "Media & Tech", "Radio", 6),
  offering(Period.P2B, "Nature", "Nature Class", 10),
  offering(Period.P2B, "Nature", "Campcraft", 10, u234),

  offering(Period.P3B, "Waterfront", "Mackinac/lap swim", 12, u234),
  offering(Period.P3B, "Waterfront", "Kayak", 10),
  offering(Period.P3B, "Waterfront", "Sailing", 12),
  offering(Period.P3B, "Waterfront", "Tube", 30),
  offering(Period.P3B, "Waterfront", "Water-skiing", 18, allUnits, "All levels."),
  offering(Period.P3B, "Waterfront", "Stand Up Paddle Board", 9, u34),
  offering(Period.P3B, "Athletics", "Archery", 10),
  offering(Period.P3B, "Athletics", "Frisbee Golf", 8),
  offering(Period.P3B, "Athletics", "Soccer League (WSL)", 40, u234),
  offering(Period.P3B, "Athletics", "Tennis", 15),
  offering(Period.P3B, "Athletics", "Game Room/Playground", 15),
  offering(Period.P3B, "Athletics", "Pickleball", 10),
  offering(Period.P3B, "Fitness", "Hammock", 15),
  offering(Period.P3B, "Riding", "Riding", undefined, allUnits, "Pre-assigned riding block."),
  offering(Period.P3B, "Arts & Crafts", "Lapidary", 6, u12),
  offering(Period.P3B, "Arts & Crafts", "Shrinky Dink", 8),
  offering(Period.P3B, "Arts & Crafts", "Out of the Box", 12),
  offering(Period.P3B, "Arts & Crafts", "Drawing", 10),
  offering(Period.P3B, "Performing Arts", "Bachata", 20),
  offering(Period.P3B, "Performing Arts", "Jam Session", 10),
  offering(Period.P3B, "Media & Tech", "B&W Photo", 6, u34),
  offering(Period.P3B, "Media & Tech", "Digital Photo", 6, u12),
  offering(Period.P3B, "Nature", "Kittens in Meadow", 10),
  offering(Period.P3B, "Nature", "Farm & Garden", 12),
  offering(Period.P3B, "Nature", "Hikes and Trips", 10, u234, "Into 4th period."),

  offering(Period.P4B, "Waterfront", "Sailing", 12),
  offering(Period.P4B, "Waterfront", "Tube", 30),
  offering(Period.P4B, "Waterfront", "Stand Up Paddle Board", 9, u34),
  offering(Period.P4B, "Waterfront", "Water-skiing", 18, allUnits, "All levels."),
  offering(Period.P4B, "Waterfront", "Blue Gill Swim", 20, u12),
  offering(Period.P4B, "Athletics", "Archery", 10),
  offering(Period.P4B, "Athletics", "Game Room/Playground", 20),
  offering(Period.P4B, "Athletics", "A-Field-a-Rama", 20, allUnits, "Basketball, LAX, softball, tennis, pickleball, badminton."),
  offering(Period.P4B, "Athletics", "Rugby", 20),
  offering(Period.P4B, "Fitness", "Yoga", 15),
  offering(Period.P4B, "Fitness", "Hammock", 15),
  offering(Period.P4B, "Riding", "Riding", undefined, allUnits, "Pre-assigned riding block."),
  offering(Period.P4B, "Arts & Crafts", "Strings & Beads", 12),
  offering(Period.P4B, "Arts & Crafts", "Shrinky Dink", 8),
  offering(Period.P4B, "Arts & Crafts", "Tie-Dye", 12),
  offering(Period.P4B, "Arts & Crafts", "Sculpture", 8),
  offering(Period.P4B, "Performing Arts", "Improv/Comedy", 25),
  offering(Period.P4B, "Performing Arts", "Meditation", 15),
  offering(Period.P4B, "Media & Tech", "Beats Music Creation", 6),
  offering(Period.P4B, "Media & Tech", "B&W Photo", 6, u34),
  offering(Period.P4B, "Nature", "Hikes", 10, u234, "Continued from 3rd."),
  offering(Period.P4B, "Nature", "Animal Care", 12)
];
