import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { FsVfs } from "./fs";

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
  await vfs.writeText("a/lock/held", "");

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

  writeFileSync(join(root, "a/activity.json.1.t67fze.houston.tmp"), "[]");
  writeFileSync(join(root, "a/backup.tmp"), "mine");

  expect(names(await vfs.list("a"))).toEqual(["activity.json", "backup.tmp"]);
});

test("listing a prefix deleted mid-request answers empty, never throws", async () => {
  const { root, vfs } = newVfs();
  await vfs.writeText("a/f.txt", "x");
  rmSync(join(root, "a"), { recursive: true });

  expect(await vfs.listDetailed("a")).toEqual([]);
});
