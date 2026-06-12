import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  importRealCampers,
  importRealStaff,
  previewRealCamperImport,
  previewRealStaffImport
} from "../src/lib/real-data-import";

const prisma = new PrismaClient();

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const staffPath = argValue("--staff");
  const campersPath = argValue("--campers");
  const commit = process.argv.includes("--commit");
  const replaceSamples = process.argv.includes("--replace-samples");

  if (!staffPath && !campersPath) {
    throw new Error("Pass --staff path/to/staff.csv and/or --campers path/to/campers.csv");
  }

  console.log(commit ? "COMMIT MODE" : "PREVIEW MODE");
  console.log(replaceSamples ? "Sample replacement is enabled for known seed sample names only." : "Sample replacement is not enabled.");

  if (staffPath) {
    const csv = readFileSync(staffPath, "utf8");
    const preview = await previewRealStaffImport(prisma, csv);
    console.log("Staff preview:", JSON.stringify(preview, null, 2));
    if (commit) console.log("Staff import:", await importRealStaff(prisma, csv, { replaceSamples }));
  }

  if (campersPath) {
    const csv = readFileSync(campersPath, "utf8");
    const preview = await previewRealCamperImport(prisma, csv);
    console.log("Camper preview:", JSON.stringify(preview, null, 2));
    if (commit) console.log("Camper import:", await importRealCampers(prisma, csv, { replaceSamples }));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
