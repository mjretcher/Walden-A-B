import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const userCount = await prisma.user.count();

  if (userCount > 0 && process.env.FORCE_RESEED !== "1") {
    console.log("Database already has data. Skipping seed.");
  } else {
    const result = spawnSync("npx", ["prisma", "db", "seed"], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
} finally {
  await prisma.$disconnect();
}
