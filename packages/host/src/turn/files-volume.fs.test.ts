import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FsVfs, MemoryVfs, VfsExistsError } from "../vfs";
import { importWorkspaceFiles } from "./files-import";
import { moveWorkspaceEntry } from "./files-move";
import {
  FileOpError,
  readWorkspaceFile,
  renameWorkspaceFile,
  WorkspaceKeys,
} from "./files-ops";

const ROOT = "Houston/Bo";
const NFD = "informe-españa.pdf";
const NFC = NFD.normalize("NFC");

const freshVfs = () =>
  new FsVfs(mkdtempSync(join(tmpdir(), "houston-volume-")));

const taken = (err: unknown) =>
  expect(err).toMatchObject({ status: 409, code: "name_taken" });

test("a rename onto a neighbour the VOLUME folds is refused, never completed", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/straße.txt`, "kept");
  const foldsSharpS = await vfs.exists(`${ROOT}/STRASSE.txt`);
  await vfs.writeText(`${ROOT}/notes.txt`, "moved");

  const rename = renameWorkspaceFile(vfs, ROOT, "notes.txt", "STRASSE.txt");
  if (foldsSharpS) {
    await expect(rename).rejects.toBeInstanceOf(FileOpError);
    await rename.catch(taken);
    expect(await readWorkspaceFile(vfs, ROOT, "notes.txt")).toEqual({
      content: "moved",
      base64: false,
    });
  } else {
    expect(await rename).toBe("renamed");
  }
  expect(await readWorkspaceFile(vfs, ROOT, "straße.txt")).toEqual({
    content: "kept",
    base64: false,
  });
});

test("a rename onto a neighbour spelled NFD is refused when the volume normalizes", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/${NFD}`, "kept");
  const { normalize } = await vfs.keyCase();
  await vfs.writeText(`${ROOT}/draft.pdf`, "moved");

  const rename = renameWorkspaceFile(vfs, ROOT, "draft.pdf", NFC);
  if (normalize) {
    await expect(rename).rejects.toBeInstanceOf(FileOpError);
    await rename.catch(taken);
  } else {
    expect(await rename).toBe("renamed");
  }
  expect(await readWorkspaceFile(vfs, ROOT, NFD)).toEqual({
    content: "kept",
    base64: false,
  });
});

test("re-spelling the file ITSELF still renames, however the volume folds", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/straße.txt`, "doc");
  expect(
    await renameWorkspaceFile(vfs, ROOT, "straße.txt", "STRASSE.txt"),
  ).toBe("renamed");
  expect(await readWorkspaceFile(vfs, ROOT, "STRASSE.txt")).toEqual({
    content: "doc",
    base64: false,
  });

  await vfs.writeText(`${ROOT}/${NFD}`, "informe");
  expect(await renameWorkspaceFile(vfs, ROOT, NFD, NFC)).toBe("renamed");
  expect(await readWorkspaceFile(vfs, ROOT, NFC)).toEqual({
    content: "informe",
    base64: false,
  });
});

test("a drag-move onto a neighbour the VOLUME folds is refused, never completed", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/docs/straße.txt`, "kept");
  const foldsSharpS = await vfs.exists(`${ROOT}/docs/STRASSE.txt`);
  await vfs.writeText(`${ROOT}/STRASSE.txt`, "moved");

  const move = moveWorkspaceEntry(vfs, ROOT, "STRASSE.txt", "docs");
  if (foldsSharpS) {
    await expect(move).rejects.toBeInstanceOf(FileOpError);
    await move.catch(taken);
  } else {
    expect(await move).toBe("docs/STRASSE.txt");
  }
  expect(await readWorkspaceFile(vfs, ROOT, "docs/straße.txt")).toEqual({
    content: "kept",
    base64: false,
  });
});

test("an upload the VOLUME would land on an existing file is deduped, not merged", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/straße.txt`, "original");
  await vfs.writeText(`${ROOT}/${NFD}`, "informe");
  const foldsSharpS = await vfs.exists(`${ROOT}/STRASSE.txt`);
  const { normalize } = await vfs.keyCase();

  const saved = await importWorkspaceFiles(vfs, ROOT, null, [
    { name: "STRASSE.txt", contentBase64: btoa("upload") },
    { name: NFC, contentBase64: btoa("upload") },
  ]);

  expect(saved).toEqual([
    foldsSharpS ? "STRASSE (1).txt" : "STRASSE.txt",
    normalize ? `${NFC.slice(0, -4)} (1).pdf` : NFC,
  ]);
  expect(await readWorkspaceFile(vfs, ROOT, "straße.txt")).toEqual({
    content: "original",
    base64: false,
  });
  expect(await readWorkspaceFile(vfs, ROOT, NFD)).toEqual({
    content: "informe",
    base64: false,
  });
});

test("a folded store refuses the move even when the key set said the name was free", async () => {
  const vfs = new MemoryVfs({ keyCase: { fold: "folded", normalize: true } });
  await vfs.writeText(`${ROOT}/readme.md`, "kept");
  await vfs.writeText(`${ROOT}/notes.md`, "moved");

  const blind = new WorkspaceKeys({ fold: "exact", normalize: false }, [
    `${ROOT}/readme.md`,
    `${ROOT}/notes.md`,
  ]);
  expect(blind.taken(`${ROOT}/README.md`)).toBe(false);

  await expect(
    vfs.move(`${ROOT}/notes.md`, `${ROOT}/README.md`),
  ).rejects.toBeInstanceOf(VfsExistsError);
  expect(await vfs.readText(`${ROOT}/readme.md`)).toBe("kept");
  expect(await vfs.readText(`${ROOT}/notes.md`)).toBe("moved");
});

test("the composed spelling finds the file a normalizing volume stored decomposed", async () => {
  const vfs = freshVfs();
  await vfs.writeText(`${ROOT}/${NFD}`, "doc");
  const { normalize } = await vfs.keyCase();

  const rename = renameWorkspaceFile(vfs, ROOT, NFC, "informe.pdf");
  if (normalize) {
    expect(await rename).toBe("renamed");
    expect(await readWorkspaceFile(vfs, ROOT, "informe.pdf")).toEqual({
      content: "doc",
      base64: false,
    });
  } else {
    await expect(rename).rejects.toMatchObject({ status: 404 });
  }
});
