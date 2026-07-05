export const REGISTRATION_ASSIGNMENT_SECTIONS = [
  {
    name: "Athletics",
    className: "registration-assignments__section--athletics",
    slots: [
      "Softball",
      "Soccer",
      "Basketball",
      "Tennis",
      "Golf",
      "Fencing",
      "Volleyball",
      "Archery",
      "Gymnastics",
      "Track",
      "Fitness",
      "Hockey",
      "LAX",
      "Frisbee",
      "AFAR",
      "BFAR"
    ]
  },
  { name: "Riding", className: "registration-assignments__section--riding", slots: [] },
  { name: "Media", className: "registration-assignments__section--media", slots: [] },
  {
    name: "Waterfront",
    className: "registration-assignments__section--waterfront",
    slots: ["Swimming", "Canoeing", "Sailing", "Kayaking", "Skiing", "Windsurf", "Fishing", "SUP", "Tube"]
  },
  {
    name: "Performing Arts",
    className: "registration-assignments__section--performing",
    slots: ["Theatre", "Guitar", "Aerobics", "Pom Pon", "Jazz"]
  },
  {
    name: "Arts & Crafts",
    className: "registration-assignments__section--arts",
    slots: ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"]
  },
  {
    name: "Outdoor Life",
    className: "registration-assignments__section--outdoor",
    slots: ["Nature", "Tripping", "Campcraft", "Outdoor Cook", "Biking"]
  },
  { name: "Checkout", className: "registration-assignments__section--checkout", slots: ["Unit 1, 2", "Unit 3", "Unit 4"] }
] as const;

export const REGISTRATION_ASSIGNMENT_EXTRA_SECTION = "These Assignments Are For Quarter";
export const REGISTRATION_ASSIGNMENT_LEGACY_EXTRA_SECTION = "Additional / Quarter Assignments";

export const REGISTRATION_ASSIGNMENT_EXTRA_LABELS: readonly string[] = [];

export function registrationAssignmentRowKey(section: string, index: number, custom = false) {
  return `${custom ? "custom" : "slot"}:${section}:${index}`;
}
