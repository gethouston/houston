// Stamp Sentry Debug IDs into the freshly-built frontend (app/dist) at BUILD
// time, before Tauri embeds it into the .app / .msi.
//
// Wired as the tail of Tauri's `beforeBuildCommand` (see tauri.conf.json), so
// it runs after `pnpm build` (vite) but before cargo embeds `frontendDist` into
// the binary. That ordering is the whole point:
//
//   The release CI used to run `sentry-cli sourcemaps inject` AFTER tauri-action
//   had already bundled app/dist. The inject snippet shifts byte/line offsets,
//   so the uploaded source map no longer lined up with the bundle users
//   actually run — every in-app JS frame failed to symbolicate (Sentry event
//   error `js_invalid_sourcemap_location`) and the dashboard showed minified
//   soup, even though the map WAS uploaded and found. Injecting here keeps the
//   shipped bundle and its map byte-identical AND bakes the Debug ID into the
//   shipped JS, so debug-id matching works too. The CI step then only uploads.
//
// No-op unless SENTRY_DSN is baked into this build (i.e. an official, Sentry-
// enabled release). Local `tauri build` and forks without a DSN skip it, so the
// build needs no Sentry setup to succeed. Injection is a purely local op (no
// network, no auth token) — the actual upload still happens in release.yml,
// gated on SENTRY_AUTH_TOKEN.
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
// Throws (non-zero exit) on failure → fails the whole build loudly. We never
// want to ship a bundle whose map silently won't symbolicate.
await cli.execute(["sourcemaps", "inject", dist], true);
console.log("[sentry-inject] done.");
