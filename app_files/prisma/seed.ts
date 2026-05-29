import { PrismaClient, Gender, Period, SwimLevel, UserRole, Unit } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords";
import { activitiesByArea, areaNames, bMenu2023Session2Offerings } from "../src/lib/menu-reference";
import { slugify } from "../src/lib/slugify";
import { writeStringArray } from "../src/lib/local-arrays";

const prisma = new PrismaClient();

async function main() {
  await reset();

  const session = await prisma.session.create({
    data: {
      name: "2025 Session 2",
      year: 2025,
      cycle: "S2",
      active: true,
      notes: "Starter session seeded from the B MENU 2023 S2 reference and 2025 staff schedule format."
    }
  });

  const menu = await prisma.menu.create({
    data: {
      sessionId: session.id,
      name: "B Menu 2023 S2 Reference",
      cycle: "S2",
      active: true,
      notes: "Initial B-day offerings and roster limits extracted from B MENU 2023 S2.docx."
    }
  });

  const areaMap = new Map<string, string>();
  for (const name of areaNames) {
    const area = await prisma.area.create({
      data: { name, slug: slugify(name), active: true }
    });
    areaMap.set(name, area.id);
  }

  const activityMap = new Map<string, string>();
  for (const [areaName, names] of Object.entries(activitiesByArea)) {
    const areaId = areaMap.get(areaName);
    if (!areaId) throw new Error(`Missing area: ${areaName}`);

    for (const name of names) {
      const activity = await prisma.activity.create({
        data: {
          name,
          slug: slugify(name),
          areaId,
          active: true
        }
      });
      activityMap.set(`${areaName}:${name}`, activity.id);
    }
  }

  for (const seed of bMenu2023Session2Offerings) {
    const areaId = areaMap.get(seed.area);
    const activityId = activityMap.get(`${seed.area}:${seed.activity}`);
    if (!areaId || !activityId) throw new Error(`Missing seed target: ${seed.area} / ${seed.activity}`);

    await prisma.activityOffering.create({
      data: {
        sessionId: session.id,
        menuId: menu.id,
        areaId,
        activityId,
        period: seed.period,
        eligibleUnits: writeStringArray(seed.eligibleUnits ?? [Unit.UNIT1, Unit.UNIT2, Unit.UNIT3, Unit.UNIT4]),
        eligibleSwimLevels: writeStringArray(seed.eligibleSwimLevels ?? []),
        rosterLimit: seed.rosterLimit,
        limitType: seed.limitType,
        allowOverride: true,
        preAssigned: seed.preAssigned ?? false,
        staffTarget: seed.staffTarget ?? 1,
        active: true,
        notes: seed.notes
      }
    });
  }

  const cabins = await seedCabins();
  await seedUsers(areaMap);
  await seedCampers(session.id, cabins);
  const staff = await seedStaff(areaMap, cabins);
  await seedAssignments(session.id, staff);

  console.log("Seed complete.");
  console.log("Login: admin@campwalden.local / walden2025!");
}

async function reset() {
  await prisma.attendanceRecord.deleteMany();
  await prisma.switchRequest.deleteMany();
  await prisma.staffAssignment.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.activityOffering.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.camper.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.area.deleteMany();
  await prisma.cabin.deleteMany();
  await prisma.session.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.skill.deleteMany();
}

async function seedCabins() {
  const data = [
    { name: "B-1", unit: Unit.UNIT1, gender: Gender.MALE },
    { name: "B-7", unit: Unit.UNIT2, gender: Gender.MALE },
    { name: "B-10", unit: Unit.UNIT3, gender: Gender.MALE },
    { name: "B-12", unit: Unit.UNIT4, gender: Gender.MALE },
    { name: "G-4", unit: Unit.UNIT1, gender: Gender.FEMALE },
    { name: "G-9", unit: Unit.UNIT3, gender: Gender.FEMALE }
  ];

  const map = new Map<string, string>();
  for (const cabin of data) {
    const created = await prisma.cabin.create({ data: cabin });
    map.set(cabin.name, created.id);
  }
  return map;
}

async function seedUsers(areaMap: Map<string, string>) {
  const passwordHash = hashPassword("walden2025!");
  await prisma.user.createMany({
    data: [
      {
        email: "admin@campwalden.local",
        name: "Executive Admin",
        role: UserRole.EXECUTIVE_ADMIN,
        passwordHash
      },
      {
        email: "waterfront@campwalden.local",
        name: "Waterfront Area Head",
        role: UserRole.AREA_HEAD,
        areaId: areaMap.get("Waterfront"),
        passwordHash
      },
      {
        email: "counselor@campwalden.local",
        name: "Counselor",
        role: UserRole.COUNSELOR,
        passwordHash
      }
    ]
  });
}

async function seedCampers(sessionId: string, cabins: Map<string, string>) {
  await prisma.camper.createMany({
    data: [
      {
        firstName: "Mike",
        lastName: "Retcher",
        gender: Gender.MALE,
        unit: Unit.UNIT1,
        cabinId: cabins.get("B-1"),
        swimLevel: SwimLevel.MUSKIE,
        sessionId,
        medicalFlags: "Nut allergy"
      },
      {
        firstName: "Robert",
        lastName: "Schultz",
        gender: Gender.MALE,
        unit: Unit.UNIT2,
        cabinId: cabins.get("B-7"),
        swimLevel: SwimLevel.WALLEYE,
        sessionId
      },
      {
        firstName: "Jack",
        lastName: "Stiffzand",
        gender: Gender.MALE,
        unit: Unit.UNIT3,
        cabinId: cabins.get("B-10"),
        swimLevel: SwimLevel.MUSKIE,
        sessionId
      },
      {
        firstName: "Kinzlie",
        lastName: "Lemer",
        gender: Gender.FEMALE,
        unit: Unit.UNIT3,
        cabinId: cabins.get("G-9"),
        swimLevel: SwimLevel.BLUEGILL,
        sessionId
      },
      {
        firstName: "Jonah",
        lastName: "Berke",
        gender: Gender.MALE,
        unit: Unit.UNIT2,
        cabinId: cabins.get("B-7"),
        swimLevel: SwimLevel.WALLEYE,
        sessionId
      },
      {
        firstName: "Elan",
        lastName: "Kanter",
        gender: Gender.MALE,
        unit: Unit.UNIT4,
        cabinId: cabins.get("B-12"),
        swimLevel: SwimLevel.MUSKIE,
        sessionId
      }
    ]
  });
}

async function seedStaff(areaMap: Map<string, string>, cabins: Map<string, string>) {
  const waterfront = areaMap.get("Waterfront");
  const athletics = areaMap.get("Athletics");
  const arts = areaMap.get("Arts & Crafts");
  const nature = areaMap.get("Nature");
  const media = areaMap.get("Media & Tech");

  const certNames = ["LG", "WSI", "M", "BWM", "Riding Safety"];
  const skillNames = ["Ski", "Archery", "Video", "Animal Care", "Drama", "Tennis", "Tube", "Fishing"];

  for (const name of certNames) await prisma.certification.create({ data: { name } });
  for (const name of skillNames) await prisma.skill.create({ data: { name } });

  const staffData = [
    ["Matthew", "Ashley", "M", athletics, ["Tennis", "Archery"]],
    ["Claudia", "Audino", "M", waterfront, ["Ski", "Tube", "Fishing"]],
    ["Riley", "Baker", "M", arts, ["Drama"]],
    ["Jack", "Behrendt", "LG", waterfront, ["Ski", "Tube"]],
    ["Oscar", "Bernal", "M", media, ["Video"]],
    ["Navie", "Olson", "LG", waterfront, ["Fishing"]],
    ["Anna", "Green", "WSI", waterfront, ["Ski", "Tube"]],
    ["Jake", "Miller", "BWM", athletics, ["Archery", "Tennis"]],
    ["Sam", "Rivera", "M", nature, ["Animal Care"]]
  ] as const;

  const created: Record<string, string> = {};
  for (const [firstName, lastName, cert, primaryAreaId, skills] of staffData) {
    const staff = await prisma.staff.create({
      data: {
        firstName,
        lastName,
        statusCertification: cert,
        primaryAreaId,
        cabinId: cabins.get("B-10"),
        availabilityNotes: cert === "LG" ? "Prioritize waterfront coverage." : null,
        certifications: { connect: [{ name: cert }] },
        skills: { connect: skills.map((name) => ({ name })) }
      }
    });
    created[`${firstName} ${lastName}`] = staff.id;
  }

  return created;
}

async function seedAssignments(sessionId: string, staff: Record<string, string>) {
  const assignments = [
    ["Claudia Audino", Period.P1B, "Fishing"],
    ["Jack Behrendt", Period.P2B, "Water-skiing"],
    ["Anna Green", Period.P3B, "Water-skiing"],
    ["Navie Olson", Period.P1B, "Fishing"],
    ["Matthew Ashley", Period.P2B, "Archery"],
    ["Jake Miller", Period.P3B, "Archery"],
    ["Oscar Bernal", Period.P1B, "Video"],
    ["Sam Rivera", Period.P2B, "Animal Care"]
  ] as const;

  for (const [staffName, period, activityName] of assignments) {
    const offering = await prisma.activityOffering.findFirst({
      where: { sessionId, period, activity: { name: activityName } }
    });
    const staffId = staff[staffName];
    if (!offering || !staffId) continue;

    await prisma.staffAssignment.create({
      data: {
        staffId,
        sessionId,
        offeringId: offering.id,
        period,
        role: "Lead"
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
