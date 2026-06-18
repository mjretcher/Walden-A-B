import assert from "node:assert/strict";
import { DEFAULT_STAFF_TARGET, activeCamperCount, filterActivitiesForArea, periodsForMenuSelection, visibleMenuRows } from "../src/lib/menu-builder-behavior";

assert.equal(DEFAULT_STAFF_TARGET, 2, "new manually created classes default to a staff target of 2");

const registrations = [
  { registrationRole: "CAMPER", status: "ACTIVE" },
  { registrationRole: "CAMPER", status: "OVERRIDDEN" },
  { registrationRole: "CAMPER", status: "REMOVED" },
  { registrationRole: "TEACHING_ASSISTANT", status: "ACTIVE" }
];

assert.equal(activeCamperCount([]), 0, "staff-only classes with no campers count as zero campers");
assert.equal(activeCamperCount(registrations), 2, "camper counts exclude assistants and removed registrations");

assert.deepEqual(
  filterActivitiesForArea([
    { id: "archery", areaId: "athletics" },
    { id: "canoe", areaId: "waterfront" }
  ], "waterfront").map((activity) => activity.id),
  ["canoe"],
  "activity dropdown filters to the selected area"
);

assert.deepEqual(
  periodsForMenuSelection({ daySelection: "SINGLE", singlePeriod: "P2B", checkedPeriods: ["P1A"] }),
  ["P2B"],
  "single-class add keeps current selected period behavior"
);

assert.deepEqual(
  periodsForMenuSelection({ daySelection: "A", singlePeriod: "P2B", checkedPeriods: [] }),
  ["P1A", "P2A", "P3A", "P4A", "P5A"],
  "A day add creates all A periods"
);

assert.deepEqual(
  periodsForMenuSelection({ daySelection: "BOTH", singlePeriod: "P2B", checkedPeriods: [] }),
  ["P1B", "P2B", "P3B", "P4B", "P5B", "P1A", "P2A", "P3A", "P4A", "P5A"],
  "both-day add creates independent target periods"
);

assert.deepEqual(
  visibleMenuRows([
    { label: "Unit 1", visible: true, includeInPrint: true },
    { label: "Unit 2", visible: false, includeInPrint: true },
    { label: "Unit 3", visible: true, includeInPrint: false }
  ]).map((row) => row.label),
  ["Unit 1", "Unit 3"],
  "row-level hidden items stay out of menu display"
);

assert.deepEqual(
  visibleMenuRows([
    { label: "Unit 1", visible: true, includeInPrint: true },
    { label: "Unit 2", visible: true, includeInPrint: false }
  ], true).map((row) => row.label),
  ["Unit 1"],
  "row-level print exclusion is independent from display visibility"
);

console.log("Menu Builder focused behavior tests passed.");
