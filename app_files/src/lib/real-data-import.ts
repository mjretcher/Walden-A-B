import { Gender, PrismaClient, SwimLevel, Unit, WeekBlock } from "@prisma/client";
import { parseCsv } from "@/lib/csv";
import { slugify } from "@/lib/slugify";

type ImportPrisma = PrismaClient;

const sampleCampers = [
  ["Mike", "Retcher"],
  ["Robert", "Schultz"],
  ["Jack", "Stiffzand"],
  ["Kinzlie", "Lemer"],
  ["Jonah", "Berke"],
  ["Elan", "Kanter"]
];

const sampleStaff = [
  ["Matthew", "Ashley"],
  ["Claudia", "Audino"],
  ["Riley", "Baker"],
  ["Jack", "Behrendt"],
  ["Oscar", "Bernal"],
  ["Navie", "Olson"],
  ["Anna", "Green"],
  ["Jake", "Miller"],
  ["Sam", "Rivera"]
];

const supportRolePattern = /director|admin|nurse|cho|social worker|maintenance|kitchen|office|support/i;
const certificationPattern = /\b(lg|wsi|bwm|cpr|first aid|lifeguard|boat|driver|ski|tube)\b/i;

const camperWeekColumns: Array<{ block: WeekBlock; boy: string; girl: string }> = [
  { block: WeekBlock.WK1_2, boy: "wk12BBunk", girl: "wk12GBunk" },
  { block: WeekBlock.WK3_4, boy: "wk34BBunk", girl: "wk34GBunk" },
  { block: WeekBlock.WK5_6, boy: "wk56BBunk", girl: "wk56GBunk" },
  { block: WeekBlock.WK7, boy: "wk7BBunk", girl: "wk7GBunk" }
];

export function parseRealCamperCsv(csv: string) {
  return parseCsv(csv).filter((row) => row.firstName || row.lastName);
}

export function parseRealStaffCsv(csv: string) {
  return parseCsv(csv).filter((row) => row.firstName || row.lastName);
}

export async function previewRealCamperImport(prisma: ImportPrisma, csv: string) {
  const session = await activeSession(prisma);
  const rows = parseRealCamperCsv(csv);
  return {
    session: session?.name ?? null,
    rows: rows.length,
    valid: rows.filter((row) => row.firstName && row.lastName && parseGender(row.gender)).length,
    invalid: rows.filter((row) => !row.firstName || !row.lastName || !parseGender(row.gender)).length,
    sampleReplacementCandidates: session ? await countSampleCampers(prisma, session.id) : 0,
    firstRows: rows.slice(0, 8).map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      age: row.personAgeToday,
      campGrade: row.campGrade,
      bunks: camperWeekColumns.map((column) => row[column.boy] || row[column.girl]).filter(Boolean)
    }))
  };
}

export async function previewRealStaffImport(prisma: ImportPrisma, csv: string) {
  const rows = parseRealStaffCsv(csv);
  return {
    rows: rows.length,
    eligible: rows.filter((row) => staffScreamEligible(row.position, row.position2)).length,
    ineligible: rows.filter((row) => !staffScreamEligible(row.position, row.position2)).length,
    sampleReplacementCandidates: await countSampleStaff(prisma),
    firstRows: rows.slice(0, 8).map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      position: row.position,
      position2: row.position2,
      screamEligible: staffScreamEligible(row.position, row.position2)
    }))
  };
}

export async function importRealCampers(prisma: ImportPrisma, csv: string, { replaceSamples = false } = {}) {
  const session = await activeSession(prisma);
  if (!session) throw new Error("No active session found.");
  const rows = parseRealCamperCsv(csv);
  if (replaceSamples) await deleteSampleCampers(prisma, session.id);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const gender = parseGender(row.gender);
    if (!row.firstName || !row.lastName || !gender) {
      skipped += 1;
      continue;
    }

    const weekBunks = camperWeekColumns
      .map((column) => ({ block: column.block, cabinName: (row[column.boy] || row[column.girl] || "").trim() }))
      .filter((item) => item.cabinName);
    const primaryCabinName = weekBunks[0]?.cabinName ?? null;
    const unit = unitFromGrade(row.campGrade);
    const cabin = primaryCabinName ? await upsertCabin(prisma, primaryCabinName, unit, gender) : null;

    const existing = await prisma.camper.findFirst({
      where: { firstName: row.firstName.trim(), lastName: row.lastName.trim(), sessionId: session.id }
    });

    const data = {
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      gender,
      genderIdentity: row.genderIdentity?.trim() || null,
      age: parseFloatOrNull(row.personAgeToday),
      campGrade: row.campGrade?.trim() || null,
      unit,
      cabinId: cabin?.id ?? null,
      swimLevel: SwimLevel.PENDING_SWIM_TEST,
      active: true,
      sessionId: session.id
    };

    const camper = existing
      ? await prisma.camper.update({ where: { id: existing.id }, data })
      : await prisma.camper.create({ data });

    for (const item of weekBunks) {
      const weekCabin = await upsertCabin(prisma, item.cabinName, unit, gender);
      await prisma.camperWeekEnrollment.upsert({
        where: { camperId_sessionId_weekBlock: { camperId: camper.id, sessionId: session.id, weekBlock: item.block } },
        create: { camperId: camper.id, sessionId: session.id, weekBlock: item.block, cabinId: weekCabin.id, cabinName: item.cabinName },
        update: { cabinId: weekCabin.id, cabinName: item.cabinName }
      });
    }

    imported += 1;
  }

  return { imported, skipped, rows: rows.length };
}

export async function importRealStaff(prisma: ImportPrisma, csv: string, { replaceSamples = false } = {}) {
  const rows = parseRealStaffCsv(csv);
  if (replaceSamples) await deleteSampleStaff(prisma);

  const areas = await prisma.area.findMany({ where: { active: true } });
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.firstName || !row.lastName) {
      skipped += 1;
      continue;
    }

    const area = matchArea(areas, row.position2) ?? matchArea(areas, row.position);
    const position2 = row.position2?.trim() || null;
    const certificationNames = position2 && certificationPattern.test(position2) ? [position2] : [];
    const certifications = await Promise.all(certificationNames.map((name) => prisma.certification.upsert({
      where: { name },
      create: { name },
      update: { active: true }
    })));

    const existing = await prisma.staff.findFirst({ where: { firstName: row.firstName.trim(), lastName: row.lastName.trim() } });
    const baseData = {
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      age: parseFloatOrNull(row.age),
      position: row.position?.trim() || null,
      position2,
      employmentStart: parseDate(row.employmentStart),
      employmentEnd: parseDate(row.employmentEnd),
      screamEligible: staffScreamEligible(row.position, row.position2),
      primaryAreaId: area?.id ?? null,
      statusCertification: position2,
      active: true
    };

    if (existing) {
      await prisma.staff.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          certifications: { set: certifications.map((certification) => ({ id: certification.id })) }
        }
      });
    } else {
      await prisma.staff.create({
        data: {
          ...baseData,
          certifications: { connect: certifications.map((certification) => ({ id: certification.id })) }
        }
      });
    }
    imported += 1;
  }

  return { imported, skipped, rows: rows.length };
}

export function staffScreamEligible(position?: string, position2?: string) {
  const joined = `${position ?? ""} ${position2 ?? ""}`.trim();
  if (/area assistant/i.test(joined)) return true;
  if (supportRolePattern.test(joined)) return false;
  return true;
}

async function activeSession(prisma: ImportPrisma) {
  return prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
}

function parseGender(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (normalized?.startsWith("F")) return Gender.FEMALE;
  if (normalized?.startsWith("M")) return Gender.MALE;
  if (normalized?.startsWith("N")) return Gender.NON_BINARY;
  return normalized ? Gender.UNSPECIFIED : null;
}

function unitFromGrade(value?: string) {
  const grade = Number(value?.match(/\d+/)?.[0] ?? 0);
  if (grade >= 10) return Unit.UNIT4;
  if (grade >= 8) return Unit.UNIT3;
  if (grade >= 6) return Unit.UNIT2;
  return Unit.UNIT1;
}

function parseFloatOrNull(value?: string) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const [month, day, year] = trimmed.split(/[/-]/).map(Number);
  if (!month || !day || !year) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

async function upsertCabin(prisma: ImportPrisma, name: string, unit: Unit, gender: Gender) {
  return prisma.cabin.upsert({
    where: { name },
    create: { name, unit, gender: cabinGender(name, gender) },
    update: {}
  });
}

function cabinGender(name: string, fallback: Gender) {
  if (/^B/i.test(name)) return Gender.MALE;
  if (/^G/i.test(name)) return Gender.FEMALE;
  return fallback;
}

function matchArea(areas: { id: string; name: string }[], value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return areas.find((area) => area.name.toLowerCase() === normalized || slugify(area.name) === slugify(normalized)) ?? null;
}

async function countSampleCampers(prisma: ImportPrisma, sessionId: string) {
  return prisma.camper.count({ where: { sessionId, OR: sampleCampers.map(([firstName, lastName]) => ({ firstName, lastName })) } });
}

async function countSampleStaff(prisma: ImportPrisma) {
  return prisma.staff.count({ where: { OR: sampleStaff.map(([firstName, lastName]) => ({ firstName, lastName })) } });
}

async function deleteSampleCampers(prisma: ImportPrisma, sessionId: string) {
  await prisma.camper.deleteMany({ where: { sessionId, OR: sampleCampers.map(([firstName, lastName]) => ({ firstName, lastName })) } });
}

async function deleteSampleStaff(prisma: ImportPrisma) {
  await prisma.staff.deleteMany({ where: { OR: sampleStaff.map(([firstName, lastName]) => ({ firstName, lastName })) } });
}
