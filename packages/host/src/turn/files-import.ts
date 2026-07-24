import type { Vfs } from "../vfs";
import { FileOpError, FilePathError, fileKey, safeRel } from "./files-ops";

/**
 * Uploads into an agent's workspace — the upload half of the Files tab
 * (drag-drop / Browse / folder pick; drag-moves live in `files-move.ts`).
 * Same path-safety wall as every other files op: nothing lands in the
 * internal top-level dot-dirs, and nothing escapes the workspace root.
 */

/**
 * Per-request upload cap. Matches the composer's per-file client limit
 * (`app/src/lib/attachment-validation.ts`), so a file the UI accepts is never
 * rejected here — the two limits drifting apart was a silent 413 trap.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * The raw HTTP body cap for an upload request. Files ride as base64 inside JSON,
 * which inflates the byte count ~4/3, so the transport body is larger than the
 * decoded payload `MAX_UPLOAD_BYTES` bounds. Cap the drained body at that
 * inflated size (plus a 1 MiB JSON-envelope allowance for field names and, on
 * files/import, several files' metadata) so a legitimately-sized upload is never
 * rejected by the transport cap — while an oversized body is still cut off DURING
 * draining, before it can OOM the process. The decoded-byte `MAX_UPLOAD_BYTES`
 * check in the body parsers remains the semantic limit shown to the user.
 */
export const MAX_UPLOAD_BODY_BYTES =
  Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 1024 * 1024;

/**
 * One uploaded file: original name + its base64-encoded bytes. `relPath` is
 * set for folder uploads (HOU-889): the file's slash-joined path INSIDE the
 * picked/dropped folder, including the filename (mirrors
 * `File.webkitRelativePath`, e.g. `docs/guide/intro.md`) — the file then lands
 * at `<dir>/<relPath>` so the folder's structure survives. Hosts predating
 * folder support ignore the field and store the flat `name`.
 */
export interface UploadFile {
  name: string;
  contentBase64: string;
  relPath?: string;
}

/** Validate an uploaded filename: one path segment, no traversal, no hidden files. */
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

/** Folder uploads can nest, but not absurdly: a runaway path is a client bug. */
const MAX_RELPATH_SEGMENTS = 32;
const MAX_RELPATH_LENGTH = 1024;

/**
 * Validate a folder-upload relative path: 2+ segments (a 1-segment path is a
 * plain filename and must arrive as `name`), every segment individually held
 * to the same rules as `safeUploadName` — so `..`, `\`, empty segments
 * (`a//b`) and hidden dot-segments are all rejected loudly, and the joined
 * path can never escape the workspace (or the target dir). Mirrors the
 * composer-attachment route's validation (`turn/attachments.ts`).
 */
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

/** Parse + validate the `files/import` body. Throws (→ 4xx) on malformed input. */
export function parseImportBody(body: Record<string, unknown>): {
  dir: string | null;
  files: UploadFile[];
} {
  const dir = typeof body.dir === "string" && body.dir !== "" ? body.dir : null;
  if (!Array.isArray(body.files) || body.files.length === 0) {
    throw new FileOpError(400, "missing 'files' array");
  }
  let total = 0;
  const files = body.files.map((raw, i) => {
    const f = raw as {
      name?: unknown;
      contentBase64?: unknown;
      relPath?: unknown;
    };
    if (typeof f.name !== "string" || typeof f.contentBase64 !== "string") {
      throw new FileOpError(
        400,
        `file[${i}] needs string 'name' and 'contentBase64'`,
      );
    }
    if (f.relPath !== undefined && typeof f.relPath !== "string") {
      throw new FileOpError(400, `file[${i}] 'relPath' must be a string`);
    }
    // base64 is ~4/3 the byte size; estimate to fail oversized uploads loudly.
    total += Math.floor((f.contentBase64.length * 3) / 4);
    if (total > MAX_UPLOAD_BYTES) {
      throw new FileOpError(413, "upload exceeds the size limit");
    }
    return { name: f.name, contentBase64: f.contentBase64, relPath: f.relPath };
  });
  return { dir, files };
}

/** Pick a unique rel path, appending " (n)" before the extension while taken. */
function dedupeRel(rel: string, taken: (r: string) => boolean): string {
  if (!taken(rel)) return rel;
  const slash = rel.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : rel.slice(0, slash + 1);
  const name = slash === -1 ? rel : rel.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${dirPart}${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Write each uploaded file into the workspace (under `dir` when given) and
 * return the relative paths stored. Folder uploads (`relPath` set) keep their
 * directory structure: `docs/a.md` lands at `<dir>/docs/a.md`. FILES are never
 * silently overwritten — colliding names get " (n)" suffixes, Finder-style —
 * while DIRECTORIES deliberately merge (`dedupeRel` only suffixes the
 * filename): the client uploads a folder across several size-batched
 * requests, so a per-request folder rename would scatter one folder over
 * many. The WHOLE batch is validated before anything is written, so one bad
 * path 400s the request without leaving earlier files half-persisted.
 */
export async function importWorkspaceFiles(
  vfs: Vfs,
  root: string,
  dir: string | null,
  files: readonly UploadFile[],
): Promise<string[]> {
  const target = dir === null ? "" : safeRel(dir);
  const existing = new Set((await vfs.listDetailed(root)).map((s) => s.key));
  const planned = files.map((f) => {
    const name = f.relPath
      ? safeUploadRelPath(f.relPath)
      : safeUploadName(f.name);
    const rel = dedupeRel(target ? `${target}/${name}` : name, (r) =>
      existing.has(fileKey(root, r)),
    );
    existing.add(fileKey(root, rel));
    return { file: f, rel };
  });
  for (const { file, rel } of planned) {
    await vfs.writeBytes(
      fileKey(root, rel),
      Buffer.from(file.contentBase64, "base64"),
    );
  }
  return planned.map((p) => p.rel);
}
