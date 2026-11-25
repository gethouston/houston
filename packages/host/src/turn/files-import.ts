import {
  prepareFiles,
  type StagedUploads,
  type UploadFile,
} from "../uploads/commit";
import { parseUploadFiles } from "../uploads/parse-files";

import type { Vfs } from "../vfs";
import { loadWorkspaceKeys } from "./files-names";
import { FileOpError, FilePathError, fileKey, safeRel } from "./files-path";

export type { UploadFile } from "../uploads/commit";

// WHY: Mirrored by MAX_UPLOAD_FILE_BYTES and MAX_COMPOSER_ATTACHMENT_BYTES in app/src/lib; change all three. ADR-0065
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const MAX_UPLOAD_BODY_BYTES =
  Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 1024 * 1024;

function safeUploadName(name: string): string {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.startsWith(".")
  ) {
    throw new FilePathError(name);
  }
  return name;
}

const MAX_RELPATH_SEGMENTS = 32;
const MAX_RELPATH_LENGTH = 1024;

function safeUploadRelPath(relPath: string): string {
  const segments = relPath.split("/");
  if (
    segments.length < 2 ||
    segments.length > MAX_RELPATH_SEGMENTS ||
    relPath.length > MAX_RELPATH_LENGTH
  ) {
    throw new FilePathError(relPath);
  }
  for (const segment of segments) safeUploadName(segment);
  return relPath;
}

export function parseImportBody(body: Record<string, unknown>): {
  dir: string | null;
  files: UploadFile[];
} {
  const dir = typeof body.dir === "string" && body.dir !== "" ? body.dir : null;
  if (!Array.isArray(body.files) || body.files.length === 0) {
    throw new FileOpError(400, "missing 'files' array");
  }
  const files = parseUploadFiles(
    body.files,
    MAX_UPLOAD_BYTES,
    (status, message) => new FileOpError(status, message),
  );
  return { dir, files };
}

async function dedupeRel(
  rel: string,
  taken: (r: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(rel))) return rel;
  const slash = rel.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : rel.slice(0, slash + 1);
  const name = slash === -1 ? rel : rel.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${dirPart}${stem} (${n})${ext}`;
    if (!(await taken(candidate))) return candidate;
  }
}

export async function importWorkspaceFiles(
  vfs: Vfs,
  root: string,
  dir: string | null,
  files: readonly UploadFile[],
  uploads?: StagedUploads,
): Promise<string[]> {
  const target = dir === null ? "" : safeRel(dir);
  const existing = await loadWorkspaceKeys(vfs, root);
  const planned: { file: UploadFile; rel: string }[] = [];
  for (const file of files) {
    const name = file.relPath
      ? safeUploadRelPath(file.relPath)
      : safeUploadName(file.name);
    const rel = await dedupeRel(
      target ? `${target}/${name}` : name,
      async (r) =>
        existing.has(fileKey(root, r)) || (await vfs.exists(fileKey(root, r))),
    );
    existing.add(fileKey(root, rel));
    planned.push({ file, rel });
  }
  const staged = await prepareFiles(
    planned.map((p) => p.file),
    uploads,
  );
  const destinations = planned.map(({ rel }) => fileKey(root, rel));
  for (const [i, source] of staged.entries()) {
    await source.write(vfs, `${destinations[i]}`);
  }
  for (const source of staged) await source.remove();
  return planned.map((p) => p.rel);
}
