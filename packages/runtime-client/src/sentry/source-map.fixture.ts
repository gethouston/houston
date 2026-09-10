import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

/**
 * Test-only: a two-file TypeScript program bundled the way selfhost/bundle.mjs
 * bundles the engine (external `.map`, no `sourcesContent`), so the mapper is
 * exercised against real esbuild output rather than a hand-written map.
 *
 * `throwFromFixture` is over-indented on purpose: the generated column then
 * differs from the original one, which is what catches a 0/1-based mix-up.
 * `logFromFixture` routes through an `observability/logging.ts` so the
 * reporter-frame trim has a mapped frame to pop.
 *
 * Emitted as CommonJS and loaded through Node's own `require`: vitest never
 * sees the file, so nothing but the mapper under test can rewrite its frames.
 */
export const SITE_SOURCE = `import { emit } from "../observability/logging";
export function throwFromFixture(): never {
      throw new Error("fixture boom");
}
export function logFromFixture(sentry: { captureLog(level: "ERROR", values: unknown[]): void }): void {
  emit(sentry, "fixture log site");
}
`;
/** 1-based line of the \`throw\` in SITE_SOURCE. */
export const THROW_LINE = 3;
/** 1-based line of the \`emit(...)\` call in SITE_SOURCE. */
export const LOG_LINE = 6;

const LOGGING_SOURCE = `export function emit(sentry: { captureLog(level: "ERROR", values: unknown[]): void }, message: string): void {
  sentry.captureLog("ERROR", [message]);
}
`;

export interface FixtureBundle {
  dir: string;
  bundlePath: string;
  mapPath: string;
  sitePath: string;
  loggingPath: string;
}

export async function buildFixtureBundle(): Promise<FixtureBundle> {
  // realpath: esbuild writes `sources` relative to the REAL outdir, and macOS
  // symlinks /var → /private/var.
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "houston-sourcemap-"));
  const sitePath = join(dir, "src", "app", "site.ts");
  const loggingPath = join(dir, "src", "observability", "logging.ts");
  mkdirSync(join(dir, "src", "app"), { recursive: true });
  mkdirSync(join(dir, "src", "observability"), { recursive: true });
  writeFileSync(sitePath, SITE_SOURCE);
  writeFileSync(loggingPath, LOGGING_SOURCE);
  const bundlePath = join(dir, "dist", "main.cjs");
  await build({
    entryPoints: [sitePath],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundlePath,
    sourcemap: "external",
    sourcesContent: false,
    logLevel: "silent",
  });
  return {
    dir,
    bundlePath,
    mapPath: `${bundlePath}.map`,
    sitePath,
    loggingPath,
  };
}
