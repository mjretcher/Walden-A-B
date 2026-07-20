import { prisma } from "@/lib/prisma";
import { staffRoleSuffix } from "@/lib/bunk-staff-tags";

// Cabin-centric roster feed: every cabin with its session-scoped staff and
// campers, plus unplaced campers and hand-picked out-of-cabin staff. This is
// the same data the Bunk Management print sheet renders
// (bunk-management/print/page.tsx), reshaped as a stable JSON/flat feed a
// second consumer -- the Kitchen mess-hall seating tool -- can pull. Staff
// cabin membership comes straight from CabinStaffAssignment (the live board),
// exactly like the print sheet, NOT the legacy Staff.cabinId scalar.

export type CabinRosterStaff = {
  id: string;
  firstName: string;
  lastName: string;
  name: string; // "First Last (UH)" — same leadership tagging as the paper cabin sheets
  role: string | null; // just the tag portion, e.g. "(UH) (UP)", or null
  knownAs: string | null; // nickname / alternate spelling used on rosters
};

export type CabinRosterCamper = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  counselorAssistant: boolean;
};

export type CabinRosterCabin = {
  cabinId: string;
  cabin: string;
  unit: string;
  gender: string;
  beds: number;
  staff: CabinRosterStaff[];
  campers: CabinRosterCamper[];
};

export type CabinRoster = {
  session: { id: string; name: string; cycle: string; year: number; active: boolean } | null;
  generatedAt: string;
  counts: {
    cabins: number;
    staff: number;
    campers: number;
    unplacedCampers: number;
    outOfCabinStaff: number;
  };
  cabins: CabinRosterCabin[];
  unplacedCampers: CabinRosterCamper[];
  outOfCabinStaff: CabinRosterStaff[];
};

type StaffRow = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: string | null;
  position2: string | null;
};

function toStaff(s: StaffRow): CabinRosterStaff {
  const suffix = staffRoleSuffix(s); // leading-space form, e.g. " (UH) (UP)" or ""
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    name: `${s.firstName} ${s.lastName}${suffix}`,
    role: suffix.trim() || null,
    knownAs: s.nickname
  };
}

const staffSelect = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  position: true,
  position2: true
} as const;

const camperSelect = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  counselorAssistant: true
} as const;

const camperOrder = [
  { counselorAssistant: "asc" as const },
  { lastName: "asc" as const },
  { firstName: "asc" as const }
];

export async function buildCabinRoster(sessionId: string): Promise<CabinRoster> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, name: true, cycle: true, year: true, active: true }
  });

  if (!session) {
    return {
      session: null,
      generatedAt: new Date().toISOString(),
      counts: { cabins: 0, staff: 0, campers: 0, unplacedCampers: 0, outOfCabinStaff: 0 },
      cabins: [],
      unplacedCampers: [],
      outOfCabinStaff: []
    };
  }

  const [cabinRows, unplaced, outListings] = await Promise.all([
    prisma.cabin.findMany({
      orderBy: [
        { gender: "asc" },
        { unit: "asc" },
        { sortOrder: { sort: "asc", nulls: "last" } },
        { name: "asc" }
      ],
      select: {
        id: true,
        name: true,
        unit: true,
        gender: true,
        beds: true,
        campers: {
          where: { sessionId: session.id, active: true },
          select: camperSelect,
          orderBy: camperOrder
        },
        cabinStaffAssignments: {
          where: { sessionId: session.id },
          select: { staff: { select: staffSelect } }
        }
      }
    }),
    prisma.camper.findMany({
      where: { sessionId: session.id, active: true, cabinId: null },
      select: camperSelect,
      orderBy: camperOrder
    }),
    prisma.outOfCabinListing.findMany({
      where: {
        sessionId: session.id,
        showOnCabinSheet: true,
        staff: { active: true, cabinStaffAssignments: { none: { sessionId: session.id } } }
      },
      select: { staff: { select: staffSelect } }
    })
  ]);

  const cabins: CabinRosterCabin[] = cabinRows
    .map((c) => ({
      cabinId: c.id,
      cabin: c.name,
      unit: c.unit as string,
      gender: c.gender as string,
      beds: c.beds,
      staff: c.cabinStaffAssignments.map((a) => toStaff(a.staff)),
      campers: c.campers.map((camper) => ({ ...camper }))
    }))
    // A global Cabin row that no one is assigned to this session isn't part
    // of this session's roster — drop the empties so consumers only see live cabins.
    .filter((c) => c.staff.length > 0 || c.campers.length > 0);

  const unplacedCampers: CabinRosterCamper[] = unplaced.map((c) => ({ ...c }));
  const outOfCabinStaff = outListings.map((l) => toStaff(l.staff));

  const staff = cabins.reduce((n, c) => n + c.staff.length, 0);
  const campers = cabins.reduce((n, c) => n + c.campers.length, 0);

  return {
    session,
    generatedAt: new Date().toISOString(),
    counts: {
      cabins: cabins.length,
      staff,
      campers,
      unplacedCampers: unplacedCampers.length,
      outOfCabinStaff: outOfCabinStaff.length
    },
    cabins,
    unplacedCampers,
    outOfCabinStaff
  };
}

export const cabinRosterFlatColumns = ["Cabin", "Unit", "Gender", "Type", "Name", "Role"] as const;
export type CabinRosterFlatRow = Record<(typeof cabinRosterFlatColumns)[number], string>;

/** One row per person, for a quick copy/paste- or spreadsheet-friendly view. */
export function buildCabinRosterFlatRows(roster: CabinRoster): CabinRosterFlatRow[] {
  const rows: CabinRosterFlatRow[] = [];
  for (const c of roster.cabins) {
    for (const s of c.staff) {
      rows.push({ Cabin: c.cabin, Unit: c.unit, Gender: c.gender, Type: "Staff", Name: s.name, Role: s.role ?? "" });
    }
    for (const camper of c.campers) {
      rows.push({
        Cabin: c.cabin,
        Unit: c.unit,
        Gender: c.gender,
        Type: camper.counselorAssistant ? "CA" : "Camper",
        Name: `${camper.firstName} ${camper.lastName}`,
        Role: ""
      });
    }
  }
  for (const s of roster.outOfCabinStaff) {
    rows.push({ Cabin: "OUT OF CABIN", Unit: "", Gender: "", Type: "Staff", Name: s.name, Role: s.role ?? "" });
  }
  for (const camper of roster.unplacedCampers) {
    rows.push({
      Cabin: "UNPLACED",
      Unit: "",
      Gender: "",
      Type: camper.counselorAssistant ? "CA" : "Camper",
      Name: `${camper.firstName} ${camper.lastName}`,
      Role: ""
    });
  }
  return rows;
}

// Flattened seed for the in-app Mess Hall Seating board: one person list
// plus cabin metadata, built from the same live roster as the export.
export type MessHallPerson = {
  id: string; first: string; last: string;
  cabin: string; cabinId: string; unit: string; gender: string;
  type: "staff" | "camper" | "ca"; tag: string;
};
export type MessHallCabin = { cabinId: string; cabin: string; unit: string; gender: string };
export type MessHallSeed = {
  session: CabinRoster["session"];
  generatedAt: string;
  cabins: MessHallCabin[];
  people: MessHallPerson[];
};

export async function buildMessHallSeed(sessionId: string): Promise<MessHallSeed> {
  const r = await buildCabinRoster(sessionId);
  const people: MessHallPerson[] = [];
  const cabins: MessHallCabin[] = [];
  const addStaff = (s: CabinRosterStaff, cabin: string, cabinId: string, unit: string, gender: string) =>
    people.push({ id: s.id, first: s.firstName, last: s.lastName, cabin, cabinId, unit, gender, type: "staff", tag: (s.role || "").trim() });
  const addCamper = (k: CabinRosterCamper, cabin: string, cabinId: string, unit: string, gender: string) =>
    people.push({ id: k.id, first: k.firstName, last: k.lastName, cabin, cabinId, unit, gender, type: k.counselorAssistant ? "ca" : "camper", tag: "" });

  for (const c of r.cabins) {
    cabins.push({ cabinId: c.cabinId, cabin: c.cabin, unit: c.unit, gender: c.gender });
    c.staff.forEach((s) => addStaff(s, c.cabin, c.cabinId, c.unit, c.gender));
    c.campers.forEach((k) => addCamper(k, c.cabin, c.cabinId, c.unit, c.gender));
  }
  if (r.unplacedCampers.length) {
    cabins.push({ cabinId: "__unplaced__", cabin: "UNPLACED", unit: "", gender: "" });
    r.unplacedCampers.forEach((k) => addCamper(k, "UNPLACED", "__unplaced__", "", ""));
  }
  if (r.outOfCabinStaff.length) {
    cabins.push({ cabinId: "__ooc__", cabin: "OUT OF CABIN", unit: "", gender: "" });
    r.outOfCabinStaff.forEach((s) => addStaff(s, "OUT OF CABIN", "__ooc__", "", ""));
  }
  return { session: r.session, generatedAt: r.generatedAt, cabins, people };
}
