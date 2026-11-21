import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hydrate } from "./hydrate";
import { excluded, STORE_ROOT_PACKAGE_EXCLUDES } from "./hydrate-excludes";
import { LocalDirStore } from "./object-store";

const TOOLCHAINS = [
  "**/node_modules/",
  "**/.pnpm-store/",
  "**/venv/",
  "**/Cache/",
  "**/GPUCache/",
];

test("a toolchain pattern never matches the workspace or agent folder", () => {
  for (const rel of [
    "workspaces/Personal/Cache/CLAUDE.md",
    "workspaces/Personal/Cache/.houston/routines/routines.json",
    "workspaces/Cache/Bob/notes.md",
    "workspaces/venv/Bob/CLAUDE.md",
    "workspaces/Personal/GPUCache/report.md",
    "workspaces/node_modules/node_modules/CLAUDE.md",
  ]) {
    expect(excluded(rel, TOOLCHAINS), rel).toBe(false);
  }
});

test("a toolchain below the agent root is still excluded", () => {
  for (const rel of [
    "workspaces/Personal/Cache/render/node_modules/react/index.js",
    "workspaces/venv/Bob/tools/venv/bin/activate",
    "workspaces/Personal/Bob/node_modules/a.js",
    "workspaces/Personal/Bob/profile/Default/Cache/data_0",
    "workspaces/Personal/Bob/web/.pnpm-store/v3/files/00/a",
    "node_modules/a.js",
    ".pnpm-store/v3/files/00/a",
  ]) {
    expect(excluded(rel, TOOLCHAINS), rel).toBe(true);
  }
});

test("the store-root package store is excluded only at the root", () => {
  const list = [...STORE_ROOT_PACKAGE_EXCLUDES];
  expect(excluded(".pnpm-store/v3/files/00/abc-index.json", list)).toBe(true);
  for (const rel of [
    "workspaces/Personal/Bob/web/.pnpm-store/v3/files/00/a",
    "workspaces/Personal/.pnpm-store/CLAUDE.md",
    "workspaces/Personal/Bob/pnpm-lock.yaml",
    ".pnpm-store-notes.md",
  ]) {
    expect(excluded(rel, list), rel).toBe(false);
  }
});

test("an agent named like a toolchain still hydrates", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "toolchain-store-"));
  const agent = join(storeRoot, "workspaces", "Personal", "Cache");
  await mkdir(join(agent, "render", "node_modules"), { recursive: true });
  await writeFile(join(agent, "CLAUDE.md"), "# Cache\n");
  await writeFile(join(agent, "render", "node_modules", "a.js"), "x");
  const manifest = await hydrate(
    new LocalDirStore(storeRoot),
    "",
    await mkdtemp(join(tmpdir(), "toolchain-dest-")),
    { excludes: TOOLCHAINS },
  );
  expect([...manifest.keys()]).toEqual(["workspaces/Personal/Cache/CLAUDE.md"]);
});
