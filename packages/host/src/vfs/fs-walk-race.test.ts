import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { FsVfs } from "./fs";

// HOU-1176: an agent workspace is written WHILE it is listed — the agent saves
// files during a turn, pi creates/removes its auth.json.lock dir on every
// credential refresh, and writeBytes renames a temp over its target. A walk that
// trusts readdir's answer to still be true by the time it stats/scans an entry
// 500s the whole request ("ENOENT … stat '…/activity.json.1.t67fze.tmp'"), which
// the user sees as an error toast on the Files tab. A vanished entry must simply
// be absent from the listing; every other error stays loud.

// Hooks fire INSIDE the fs call the walk is making, which is the only way to
// land a delete in the window between readdir and stat deterministically.
const hooks = vi.hoisted(() => ({
  beforeStat: (_path: string) => {},
  beforeReaddir: (_path: string) => {},
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: (path: string, ...rest: unknown[]) => {
      hooks.beforeStat(String(path));
      return (actual.stat as (...a: unknown[]) => unknown)(path, ...rest);
    },
    readdir: (path: string, ...rest: unknown[]) => {
      hooks.beforeReaddir(String(path));
      return (actual.readdir as (...a: unknown[]) => unknown)(path, ...rest);
    },
  };
});

beforeEach(() => {
  hooks.beforeStat = () => {};
  hooks.beforeReaddir = () => {};
});

const newVfs = () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-walk-race-"));
  return { root, vfs: new FsVfs(root) };
};
const names = (keys: string[]) => keys.map((k) => k.split("/").pop());

test("a file that vanishes between readdir and stat is skipped, not fatal", async () => {
  const { vfs } = newVfs();
  await vfs.writeText("a/keep.txt", "kept");
  await vfs.writeText("a/doomed.txt", "gone in a moment");

  hooks.beforeStat = (path) => {
    if (path.endsWith("doomed.txt")) rmSync(path);
  };

  expect(names(await vfs.list("a"))).toEqual(["keep.txt"]);
});

test("a subdirectory removed mid-walk is skipped, not fatal", async () => {
  const { root, vfs } = newVfs();
  await vfs.writeText("a/keep.txt", "kept");
  await vfs.writeText("a/lock/held", ""); // pi's auth.json.lock shape

  // The parent's readdir has already named `lock`; it disappears in the window
  // before the walk descends into it.
  hooks.beforeReaddir = (path) => {
    if (path === join(root, "a/lock")) rmSync(path, { recursive: true });
  };

  expect(names(await vfs.list("a"))).toEqual(["keep.txt"]);
});

test("a real failure still throws — only vanished entries are skipped", async () => {
  const { vfs } = newVfs();
  await vfs.writeText("a/f.txt", "x");

  hooks.beforeStat = (path) => {
    if (path.endsWith("f.txt"))
      throw Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      });
  };

  await expect(vfs.list("a")).rejects.toThrow(/EACCES/);
});

test("in-flight atomic-write temps never appear in a listing", async () => {
  const { root, vfs } = newVfs();
  await vfs.writeText("a/activity.json", "[]");

  // A concurrent writeBytes' scratch file, exactly as it exists mid-write…
  writeFileSync(join(root, "a/activity.json.1.t67fze.houston.tmp"), "[]");
  // …while a user file that merely ends in .tmp stays visible.
  writeFileSync(join(root, "a/backup.tmp"), "mine");

  expect(names(await vfs.list("a"))).toEqual(["activity.json", "backup.tmp"]);
});

test("listing a prefix deleted mid-request answers empty, never throws", async () => {
  const { root, vfs } = newVfs();
  await vfs.writeText("a/f.txt", "x");
  rmSync(join(root, "a"), { recursive: true });

  expect(await vfs.listDetailed("a")).toEqual([]);
});
