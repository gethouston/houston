import { UPLOADS_DIR } from "@houston/domain/uploads-dir";
import {
  prepareFiles,
  type StagedUploads,
  type UploadFile,
} from "../uploads/commit";
import type { Vfs } from "../vfs";
import { AttachmentError } from "./attachment-error";

function safeFilename(name: string): string {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.startsWith(".")
  ) {
    throw new AttachmentError(400, `invalid attachment filename: ${name}`);
  }
  return name;
}

const MAX_RELPATH_SEGMENTS = 32;
const MAX_RELPATH_LENGTH = 1024;

function safeRelPath(relPath: string): string {
  const segments = relPath.split("/");
  if (
    segments.length < 2 ||
    segments.length > MAX_RELPATH_SEGMENTS ||
    relPath.length > MAX_RELPATH_LENGTH
  ) {
    throw new AttachmentError(400, `invalid attachment path: ${relPath}`);
  }
  for (const segment of segments) safeFilename(segment);
  return relPath;
}

const uploadsKey = (root: string) => `${root}/${UPLOADS_DIR}`;

export async function saveAttachments(
  vfs: Vfs,
  root: string,
  files: readonly UploadFile[],
  uploads?: StagedUploads,
): Promise<string[]> {
  const prefix = uploadsKey(root);
  const used = new Set<string>(
    (await vfs.list(prefix)).map((k) => k.slice(prefix.length + 1)),
  );
  const paths = files.map((f) => {
    const target = f.relPath ? safeRelPath(f.relPath) : safeFilename(f.name);
    return `${UPLOADS_DIR}/${dedupe(target, used)}`;
  });
  const staged = await prepareFiles(files, uploads);
  for (const [i, source] of staged.entries()) {
    await source.write(vfs, `${root}/${paths[i]}`);
  }
  for (const source of staged) await source.remove();
  return paths;
}

function dedupe(relPath: string, used: Set<string>): string {
  if (!used.has(relPath)) {
    used.add(relPath);
    return relPath;
  }
  const slash = relPath.lastIndexOf("/");
  const dir = slash >= 0 ? relPath.slice(0, slash + 1) : "";
  const name = slash >= 0 ? relPath.slice(slash + 1) : relPath;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${dir}${stem} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}
