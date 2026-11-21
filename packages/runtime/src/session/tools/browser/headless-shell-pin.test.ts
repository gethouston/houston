import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const dockerfile = readFileSync(join(REPO, "selfhost/Dockerfile"), "utf8");
const engineImageWorkflow = readFileSync(
  join(REPO, ".github/workflows/engine-pod-image.yml"),
  "utf8",
);

const playwrightDir = dirname(
  createRequire(import.meta.url).resolve("playwright-core/package.json"),
);
const headlessShell = (
  JSON.parse(readFileSync(join(playwrightDir, "browsers.json"), "utf8")) as {
    browsers: { name: string; revision: string; browserVersion: string }[];
  }
).browsers.find((b) => b.name === "chromium-headless-shell");

const pinnedRevision = dockerfile.match(
  /SHELL_DIR=\/app\/ms-playwright\/chromium_headless_shell-(\d+);/,
)?.[1];
const pinnedVersion = dockerfile.match(/CFT_VERSION=([\d.]+);/)?.[1];

function versionParts(version: string): number[] {
  return version.split(".").map(Number);
}

function isOlder(a: string, b: string): boolean {
  const [pa, pb] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

test("the swap targets the revision directory playwright-core installs", () => {
  expect(headlessShell).toBeDefined();
  expect(pinnedRevision).toBe(headlessShell?.revision);
});

test("the pinned Chrome for Testing build is newer than playwright-core's", () => {
  expect(pinnedVersion).toBeDefined();
  expect(
    isOlder(headlessShell?.browserVersion ?? "", pinnedVersion ?? ""),
    `playwright-core ships ${headlessShell?.browserVersion}; drop the Chrome for Testing swap in selfhost/Dockerfile and the version the smoke launch in .github/workflows/engine-pod-image.yml expects`,
  ).toBe(true);
});

test("the engine image smoke launch expects the pinned build", () => {
  expect(engineImageWorkflow.match(/if\(v!==\\"([\d.]+)\\"\)/)?.[1]).toBe(
    pinnedVersion,
  );
});
