import { UPLOADS_DIR } from "@houston/domain/uploads-dir";
import {
  prepareFiles,
  type StagedUploads,
  type UploadFile,
} from "../uploads/commit";
import type { Vfs } from "../vfs";
import { AttachmentError } from "./attachment-error";

/**
 * Validate a filename: a single path component, no traversal, no separators,
 * no leading dot (a dotfile would be invisible in the Files tab, defeating the
 * whole point of durable uploads). Rejected loudly.
 */
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

/** Folder uploads can nest, but not absurdly: a runaway path is a client bug. */
const MAX_RELPATH_SEGMENTS = 32;
const MAX_RELPATH_LENGTH = 1024;

/**
 * Validate a folder-upload relative path: 2+ segments (a 1-segment path is a
 * plain filename and must arrive as `name`), every segment individually held to
 * the same rules as `safeFilename` — so `..`, `\`, empty segments (`a//b`) and
 * hidden dot-segments are all rejected loudly, and the joined path can never
 * escape `uploads/`.
 */
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

/**
 * Write each uploaded file under `uploads/` and return the RELATIVE workspace
 * paths the agent will read. Folder uploads (`relPath` set) keep their
 * directory structure: `docs/a.md` lands at `uploads/docs/a.md`. FILES
 * colliding with anything already stored — or with each other within a batch —
 * are disambiguated (`name.ext`, `name (1).ext`, …) so an upload never
 * silently overwrites an earlier one and every returned path resolves to a
 * distinct stored file. DIRECTORIES deliberately merge instead of deduping:
 * the client uploads a folder across several requests (one per size-batch),
 * so a per-request folder rename would scatter one folder over many — and the
 * returned per-file paths stay exact either way.
 */
export async function saveAttachments(
  vfs: Vfs,
  root: string,
  files: readonly UploadFile[],
  uploads?: StagedUploads,
): Promise<string[]> {
  // Seed the dedup set with what the folder already holds: uploads are durable
  // across conversations, so "report.pdf" attached today must not clobber the
  // "report.pdf" attached last week. `vfs.list` is recursive, so the set holds
  // full `uploads/`-relative paths — nested folder-upload files included.
  const prefix = uploadsKey(root);
  const used = new Set<string>(
    (await vfs.list(prefix)).map((k) => k.slice(prefix.length + 1)),
  );
  // Validate the WHOLE batch before writing anything: one bad path must 400
  // the request without leaving earlier files half-persisted (their paths
  // would never be returned and no FilesChanged would fire).
  const paths = files.map((f) => {
    const target = f.relPath ? safeRelPath(f.relPath) : safeFilename(f.name);
    return `${UPLOADS_DIR}/${dedupe(target, used)}`;
  });
  const staged = await prepareFiles(files, uploads);
  // Path validation is lexical; the Vfs write resolves the path as the
  // filesystem sees it, symlinks included. A symlinked dir under uploads/
  // could redirect a write — but only something that already writes to the
  // workspace (the agent itself) can plant one there, and that principal can
  // already write wherever the symlink would point. Same posture as the
  // pre-existing flat uploads (where `uploads` itself could be a symlink).
  for (const [i, source] of staged.entries()) {
    await source.write(vfs, `${root}/${paths[i]}`);
  }
  for (const source of staged) await source.remove();
  return paths;
}

/**
 * Pick a unique path within `uploads/`, appending " (n)" before the FILENAME's
 * extension (the directory part never changes — see saveAttachments on merge).
 */
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
