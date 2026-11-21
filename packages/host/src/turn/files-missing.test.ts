import { afterEach, expect, test, vi } from "vitest";
import { MemoryVfs } from "../vfs";
import {
  describeMissingFile,
  formatMissingFile,
  logMissingFile,
  noteFilesChanged,
  resetFilesChangedClock,
} from "./files-missing";

const ROOT = "ws/w1/agent-1/workspace";

afterEach(() => resetFilesChangedClock());

test("absent parent folder vs. present siblings, and the FilesChanged clock", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/out/a.html`, "a");
  await vfs.writeText(`${ROOT}/out/b.html`, "b");
  await vfs.writeText(`${ROOT}/out/deep/c.html`, "c");

  const noFolder = await describeMissingFile(vfs, ROOT, "nowhere/x.html", "a1");
  expect(noFolder).toEqual({
    rel: "nowhere/x.html",
    siblings: null,
    filesChangedAgoS: null,
  });

  noteFilesChanged({ type: "FilesChanged", agentPath: "a1" }, 10_000);
  noteFilesChanged({ type: "ContextChanged", agentPath: "a1" }, 50_000);
  const renamed = await describeMissingFile(
    vfs,
    ROOT,
    "out/z.html",
    "a1",
    14_000,
  );
  expect(renamed).toEqual({
    rel: "out/z.html",
    siblings: ["a.html", "b.html", "deep"],
    filesChangedAgoS: 4,
  });
  expect(formatMissingFile(renamed)).toBe(
    "[files] not found: out/z.html (3 sibling(s): a.html, b.html, deep; last FilesChanged 4s ago)",
  );

  const rootMiss = await describeMissingFile(vfs, ROOT, "game.html", "a2");
  expect(rootMiss.siblings).toEqual(["out"]);
  expect(rootMiss.filesChangedAgoS).toBeNull();
});

test("a failing listing still logs the miss instead of throwing", async () => {
  const vfs = new MemoryVfs();
  vi.spyOn(vfs, "list").mockRejectedValue(new Error("bucket unreachable"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    logMissingFile(vfs, ROOT, "x.html", "a1"),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    "[files] not found: x.html (diagnostic listing failed: bucket unreachable)",
  );
  warn.mockRestore();
});
