#!/usr/bin/env node
/**
 * scripts/build-with-conditional-db-push.mjs
 *
 * Vercel deploy script that runs `prisma db push` ONLY when prisma/schema.prisma
 * actually changed since the previous successful deploy.
 *
 * Why this exists:
 *   The previous Vercel build override was `prisma generate && prisma db push &&
 *   next build`, which ran `db push` on every single deploy. Each `db push`
 *   opens a Neon connection and inspects the live schema — that's network
 *   transfer Neon charges against the monthly quota. We were pushing the
 *   project past its free-tier 5 GB monthly limit largely from these no-op
 *   schema syncs on deploys that didn't change the schema at all.
 *
 * Behavior:
 *   1. `prisma generate`  — always runs; no network, just regenerates the
 *      Prisma client from the local schema file.
 *   2. `prisma db push`   — runs ONLY if schema.prisma changed between the
 *      previous deploy's commit (VERCEL_GIT_PREVIOUS_SHA) and the current
 *      commit (HEAD). On first deploy or when the previous SHA can't be
 *      resolved, errs on the side of running db push.
 *   3. `next build`       — always runs.
 *
 * Vercel build command:
 *   node scripts/build-with-conditional-db-push.mjs
 *
 * Local use:
 *   `npm run build` stays untouched (no db push). If you need to apply a
 *   schema change locally, run `npx prisma db push` explicitly against the
 *   target DATABASE_URL.
 */

import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n[build] $ ${command}`);
  execSync(command, { stdio: "inherit" });
}

/**
 * Returns one of:
 *   "changed"     — schema.prisma differs vs the previous deploy; db push needed
 *   "unchanged"   — schema.prisma is identical vs the previous deploy; skip
 *   "unknown"     — couldn't tell (no previous SHA, shallow clone too shallow,
 *                   git failed); fall back to running db push for safety
 */
function classifySchemaChange() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!previousSha) {
    return { state: "unknown", reason: "VERCEL_GIT_PREVIOUS_SHA not set (first deploy or fresh project)" };
  }

  try {
    // Ensure the previous commit is available in the shallow clone. Vercel
    // does a shallow fetch by default; this fetch is a no-op if we already
    // have it. If the fetch fails, fall through and let `git diff` fail to
    // the catch block.
    try {
      execSync(`git fetch --no-tags --depth=50 origin ${previousSha}`, { stdio: "pipe" });
    } catch {
      // Best-effort. Diff will still try.
    }

    // exit 0 → no changes; exit 1 → changes; any other exit → error.
    // The pathspec is relative to the current working directory, which is
    // app_files/ on Vercel (the project root that contains package.json).
    execSync(`git diff --quiet ${previousSha} HEAD -- prisma/schema.prisma`, { stdio: "pipe" });
    return { state: "unchanged", reason: `no changes to schema.prisma between ${previousSha.slice(0, 7)} and HEAD` };
  } catch (err) {
    if (err && err.status === 1) {
      return { state: "changed", reason: `schema.prisma differs vs ${previousSha.slice(0, 7)}` };
    }
    return { state: "unknown", reason: `git diff failed: ${err && err.message ? err.message : err}` };
  }
}

async function main() {
  console.log("[build] Conditional db-push build script starting");

  run("prisma generate");

  const decision = classifySchemaChange();
  console.log(`[build] Schema status: ${decision.state} — ${decision.reason}`);

  if (decision.state === "unchanged") {
    console.log("[build] Skipping prisma db push (schema identical to previous deploy)");
  } else {
    // "changed" or "unknown" → run db push. We err toward running it so a
    // schema change is never silently missed.
    run("prisma db push --accept-data-loss=false");
  }

  run("next build");
  console.log("\n[build] Done.");
}

main().catch((err) => {
  console.error("[build] Build failed:", err);
  process.exit(1);
});
