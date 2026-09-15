import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "../vfs";
import { importWorkspaceFiles } from "./files-import";
import {
  deleteWorkspaceFile,
  FileOpError,
  listWorkspace,
  readWorkspaceFile,
  renameWorkspaceFile,
} from "./files-ops";

/**
 * Files-tab deletes and renames against the REAL filesystem adapter. This pins
 * the desktop regression the Memory-backed suite could not see: `rm` without
 * `recursive` refuses directories, and walking a plain file as a prefix used to
 * throw ENOTDIR — so on the TS desktop, deleting anything from the Files tab
 * 500'd. A rename collision is here for the same reason: POSIX `rename(2)`
 * overwrites an existing destination file without a word, so on disk the
 * clobber is silent unless the op refuses it first.
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

test("refuses to rename onto an existing name on disk", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/data/old.csv`, "old");
  await vfs.writeText(`${ROOT}/data/taken.csv`, "taken");
  const rejected = renameWorkspaceFile(vfs, ROOT, "data/old.csv", "taken.csv");
  await expect(rejected).rejects.toBeInstanceOf(FileOpError);
  await expect(rejected).rejects.toMatchObject({
    status: 409,
    code: "name_taken",
  });
  expect(await readWorkspaceFile(vfs, ROOT, "data/taken.csv")).toEqual({
    content: "taken",
    base64: false,
  });
  expect(await readWorkspaceFile(vfs, ROOT, "data/old.csv")).toEqual({
    content: "old",
    base64: false,
  });
});

/**
 * The case-fold cases below are TRUE on either kind of volume, because the
 * expectation is taken from the adapter's own probe rather than from
 * `process.platform`: a case-sensitive APFS volume on macOS and a case-folding
 * exFAT mount on Linux both exist, and the guard has to be right on the disk
 * it is actually running on.
 */
test("a rename onto a name differing only in case never destroys the neighbour", async () => {
  const vfs = freshVfs();
  const folded = (await vfs.keyCase()) === "folded";
  await vfs.writeText(`${ROOT}/readme.md`, "kept");
  await vfs.writeText(`${ROOT}/notes.md`, "moved");

  const rename = renameWorkspaceFile(vfs, ROOT, "notes.md", "README.md");
  if (folded) {
    // `fs.rename` would have unlinked `readme.md` without a word.
    await expect(rename).rejects.toBeInstanceOf(FileOpError);
    await expect(rename).rejects.toMatchObject({
      status: 409,
      code: "name_taken",
    });
    expect(await readWorkspaceFile(vfs, ROOT, "notes.md")).toEqual({
      content: "moved",
      base64: false,
    });
  } else {
    // A case-SENSITIVE volume holds both names: nothing is at risk.
    expect(await rename).toBe("renamed");
    expect(await readWorkspaceFile(vfs, ROOT, "README.md")).toEqual({
      content: "moved",
      base64: false,
    });
  }
  expect(await readWorkspaceFile(vfs, ROOT, "readme.md")).toEqual({
    content: "kept",
    base64: false,
  });
});

test("a case-ONLY rename re-spells the file on any volume", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/readme.md`, "doc");
  expect(await renameWorkspaceFile(vfs, ROOT, "readme.md", "README.md")).toBe(
    "renamed",
  );
  expect((await listWorkspace(vfs, ROOT)).map((f) => f.name)).toEqual([
    "README.md",
  ]);
});

test("an upload whose name differs only in case never replaces the file there", async () => {
  const vfs = freshVfs();
  const folded = (await vfs.keyCase()) === "folded";
  await vfs.writeText(`${ROOT}/Report.pdf`, "original");

  const saved = await importWorkspaceFiles(vfs, ROOT, null, [
    {
      name: "report.pdf",
      contentBase64: Buffer.from("upload").toString("base64"),
    },
  ]);

  expect(saved).toEqual([folded ? "report (1).pdf" : "report.pdf"]);
  expect(await readWorkspaceFile(vfs, ROOT, "Report.pdf")).toEqual({
    content: "original",
    base64: false,
  });
});
