import { existsSync } from "node:fs";
import path from "node:path";

export type ServeMode = "dev" | "bundle";

export function resolveServeMode(
  env: Record<string, string | undefined> = process.env,
): ServeMode {
  const value = env.HOUSTON_E2E_SERVE;
  if (value === "dev" || value === "bundle") return value;
  if (value) {
    throw new Error(
      `HOUSTON_E2E_SERVE must be "dev" or "bundle", got "${value}"`,
    );
  }
  return env.CI ? "bundle" : "dev";
}

export type BundleName = "shell" | "sign-in";
export const BUNDLE_NAMES: readonly BundleName[] = ["shell", "sign-in"];

const BUNDLE_ROOT = path.resolve(import.meta.dirname, "../../dist/e2e");

export function bundleDir(name: BundleName): string {
  return path.join(BUNDLE_ROOT, name);
}

export const STAMP_FILE = ".git-head";

export function assertBundleBuilt(name: BundleName): string {
  const dir = bundleDir(name);
  if (!existsSync(path.join(dir, "index.html"))) {
    throw new Error(
      `HOUSTON_E2E_SERVE=bundle but ${dir} has no build. Run \`pnpm --filter houston-web e2e:build\` first.`,
    );
  }
  return dir;
}
