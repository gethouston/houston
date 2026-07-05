import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "../vfs";
import { deleteWorkspaceFile, listWorkspace } from "./files-ops";

/**
 * Files-tab deletes against the REAL filesystem adapter. This pins the desktop
 * regression the Memory-backed suite could not see: `rm` without `recursive`
 * refuses directories, and walking a plain file as a prefix used to throw
 * ENOTDIR — so on the TS desktop, deleting anything from the Files tab 500'd.
 */

const ROOT = "Houston/Bo"; // local layout: the agent dir IS the workspace root

function freshVfs(): FsVfs {
  return new FsVfs(mkdtempSync(join(tmpdir(), "houston-files-")));
}

test("deletes a plain file on disk", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/report.txt`, "x");
  await vfs.writeText(`${ROOT}/keep.txt`, "k");
  await deleteWorkspaceFile(vfs, ROOT, "report.txt");
  expect((await listWorkspace(vfs, ROOT)).map((f) => f.path)).toEqual([
    "keep.txt",
  ]);
});

test("deletes a folder with nested content on disk", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/trash/a.txt`, "a");
  await vfs.writeText(`${ROOT}/trash/sub/b.txt`, "b");
  await vfs.writeText(`${ROOT}/keep.txt`, "k");
  await deleteWorkspaceFile(vfs, ROOT, "trash");
  expect((await listWorkspace(vfs, ROOT)).map((f) => f.path)).toEqual([
    "keep.txt",
  ]);
});
