import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs } from "../vfs";
import { importWorkspaceFiles } from "./files-import";
import {
  createWorkspaceFolder,
  deleteWorkspaceFile,
  FileOpError,
  listWorkspace,
  readWorkspaceFile,
  renameWorkspaceFile,
} from "./files-ops";

const ROOT = "Houston/Bo";

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

test("a rename onto a name differing only in case never destroys the neighbour", async () => {
  const vfs = freshVfs();
  const folded = (await vfs.keyCase()).fold === "folded";
  await vfs.writeText(`${ROOT}/readme.md`, "kept");
  await vfs.writeText(`${ROOT}/notes.md`, "moved");

  const rename = renameWorkspaceFile(vfs, ROOT, "notes.md", "README.md");
  if (folded) {
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
  const folded = (await vfs.keyCase()).fold === "folded";
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

test("a new folder never takes a name something already has", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/report.pdf`, "kept");
  await vfs.writeText(`${ROOT}/Papers/a.txt`, "a");

  for (const taken of ["report.pdf", "Papers"]) {
    const refused = createWorkspaceFolder(vfs, ROOT, taken);
    await expect(refused).rejects.toBeInstanceOf(FileOpError);
    await expect(refused).rejects.toMatchObject({
      status: 409,
      code: "name_taken",
    });
  }
  expect(await readWorkspaceFile(vfs, ROOT, "report.pdf")).toEqual({
    content: "kept",
    base64: false,
  });
  expect(await createWorkspaceFolder(vfs, ROOT, "Archive")).toBe("Archive");
});

test("a new folder refuses a name the VOLUME resolves to an existing file", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/straße.txt`, "kept");
  const foldsSharpS = await vfs.exists(`${ROOT}/STRASSE.txt`);

  const created = createWorkspaceFolder(vfs, ROOT, "STRASSE.txt");
  if (foldsSharpS) {
    await expect(created).rejects.toMatchObject({
      status: 409,
      code: "name_taken",
    });
  } else {
    expect(await created).toBe("STRASSE.txt");
  }
  expect(await readWorkspaceFile(vfs, ROOT, "straße.txt")).toEqual({
    content: "kept",
    base64: false,
  });
});
