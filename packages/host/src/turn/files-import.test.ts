import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import {
  importWorkspaceFiles,
  MAX_UPLOAD_BYTES,
  moveWorkspaceEntry,
  parseImportBody,
} from "./files-import";
import { FileOpError, FilePathError, listWorkspace } from "./files-ops";

/**
 * The write half of the Files tab: uploads (drag-drop / Browse) and drag-moves.
 * Uploads must never clobber, never escape the root, never touch internal
 * dot-dirs; moves must keep names, refuse conflicts, and take folders whole.
 */

const ROOT = "ws/w1/agent-1/workspace";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

test("parseImportBody validates shape and caps the request size", () => {
  expect(() => parseImportBody({})).toThrow(FileOpError);
  expect(() => parseImportBody({ files: [] })).toThrow("missing 'files'");
  expect(() => parseImportBody({ files: [{ name: 42 }] })).toThrow(
    "needs string",
  );
  const oversized = "A".repeat(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8);
  expect(() =>
    parseImportBody({ files: [{ name: "big.bin", contentBase64: oversized }] }),
  ).toThrow("size limit");
  const ok = parseImportBody({
    dir: "Reports",
    files: [{ name: "a.txt", contentBase64: b64("hi") }],
  });
  expect(ok.dir).toBe("Reports");
  expect(ok.files).toHaveLength(1);
});

test("imports land at the root or in a target folder, byte-exact", async () => {
  const vfs = new MemoryVfs();
  const paths = await importWorkspaceFiles(vfs, ROOT, null, [
    { name: "report.pdf", contentBase64: b64("PDF") },
  ]);
  expect(paths).toEqual(["report.pdf"]);
  const nested = await importWorkspaceFiles(vfs, ROOT, "Docs/2026", [
    { name: "notes.md", contentBase64: b64("# hi") },
  ]);
  expect(nested).toEqual(["Docs/2026/notes.md"]);
  expect((await vfs.readBytes(`${ROOT}/Docs/2026/notes.md`))?.toString()).toBe(
    "# hi",
  );
});

test("colliding names get Finder-style ' (n)' suffixes, never overwrite", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/report.pdf`, "original");
  const paths = await importWorkspaceFiles(vfs, ROOT, null, [
    { name: "report.pdf", contentBase64: b64("second") },
    { name: "report.pdf", contentBase64: b64("third") },
  ]);
  expect(paths).toEqual(["report (1).pdf", "report (2).pdf"]);
  expect(await vfs.readText(`${ROOT}/report.pdf`)).toBe("original");
});

test("upload names are single segments: traversal, separators, dot-files refused", async () => {
  const vfs = new MemoryVfs();
  for (const name of ["../evil.txt", "a/b.txt", ".env", "..", ""]) {
    await expect(
      importWorkspaceFiles(vfs, ROOT, null, [
        { name, contentBase64: b64("x") },
      ]),
    ).rejects.toThrow(FilePathError);
  }
  // Target dir goes through the same wall as every other path op.
  await expect(
    importWorkspaceFiles(vfs, ROOT, ".houston", [
      { name: "ok.txt", contentBase64: b64("x") },
    ]),
  ).rejects.toThrow(FilePathError);
});

test("move takes a file into a folder and back to the root", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/a.txt`, "a");
  expect(await moveWorkspaceEntry(vfs, ROOT, "a.txt", "Docs")).toBe(
    "Docs/a.txt",
  );
  expect(await vfs.readText(`${ROOT}/Docs/a.txt`)).toBe("a");
  expect(await moveWorkspaceEntry(vfs, ROOT, "Docs/a.txt", null)).toBe("a.txt");
  expect(await vfs.readText(`${ROOT}/a.txt`)).toBe("a");
});

test("move takes a folder whole (children + markers), leaving nothing behind", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/Docs/a.txt`, "a");
  await vfs.writeText(`${ROOT}/Docs/sub/b.txt`, "b");
  await vfs.writeText(`${ROOT}/Archive/.keep`, "");
  expect(await moveWorkspaceEntry(vfs, ROOT, "Docs", "Archive")).toBe(
    "Archive/Docs",
  );
  expect(await vfs.readText(`${ROOT}/Archive/Docs/a.txt`)).toBe("a");
  expect(await vfs.readText(`${ROOT}/Archive/Docs/sub/b.txt`)).toBe("b");
  const listed = (await listWorkspace(vfs, ROOT)).map((f) => f.path);
  expect(listed.some((p) => p === "Docs" || p.startsWith("Docs/"))).toBe(false);
});

test("move refuses conflicts (409), self-nesting (400), and ghosts (404)", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/a.txt`, "a");
  await vfs.writeText(`${ROOT}/Docs/a.txt`, "taken");
  await expect(moveWorkspaceEntry(vfs, ROOT, "a.txt", "Docs")).rejects.toThrow(
    "already exists",
  );
  await expect(
    moveWorkspaceEntry(vfs, ROOT, "Docs", "Docs/inner"),
  ).rejects.toThrow("into itself");
  await expect(
    moveWorkspaceEntry(vfs, ROOT, "ghost.txt", "Docs"),
  ).rejects.toThrow("file not found");
  await expect(
    moveWorkspaceEntry(vfs, ROOT, "a.txt", ".houston"),
  ).rejects.toThrow(FilePathError);
});
