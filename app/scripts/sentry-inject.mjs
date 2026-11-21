import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SentryCli } from "@sentry/cli";

if (!process.env.SENTRY_DSN) {
  console.log(
    "[sentry-inject] SENTRY_DSN unset — skipping Debug ID injection (dev/fork build).",
  );
  process.exit(0);
}

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (!existsSync(dist)) {
  console.error(
    `[sentry-inject] frontend build not found at ${dist} — did \`pnpm build\` run first?`,
  );
  process.exit(1);
}

console.log(`[sentry-inject] injecting Sentry Debug IDs into ${dist}`);
const cli = new SentryCli();
await cli.execute(["sourcemaps", "inject", dist], true);
console.log("[sentry-inject] done.");
