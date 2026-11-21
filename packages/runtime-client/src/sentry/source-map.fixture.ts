import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

export const SITE_SOURCE = `import { emit } from "../observability/logging";
export function throwFromFixture(): never {
      throw new Error("fixture boom");
}
export function logFromFixture(sentry: { captureLog(level: "ERROR", values: unknown[]): void }): void {
  emit(sentry, "fixture log site");
}
`;
export const THROW_LINE = 3;
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
