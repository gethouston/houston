import type { Vfs } from "../vfs";
import { FileOpError, FilePathError, fileKey, safeRel } from "./files-ops";

/**
 * Uploads into + moves within an agent's workspace — the write half of the
 * Files tab (drag-drop / Browse / drag-a-row-onto-a-folder). Same path-safety
 * wall as every other files op: nothing lands in (or moves into) the internal
 * top-level dot-dirs, and nothing escapes the workspace root.
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

/** One uploaded file: original name + its base64-encoded bytes. */
export interface UploadFile {
  name: string;
  contentBase64: string;
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
    const f = raw as { name?: unknown; contentBase64?: unknown };
    if (typeof f.name !== "string" || typeof f.contentBase64 !== "string") {
      throw new FileOpError(
        400,
        `file[${i}] needs string 'name' and 'contentBase64'`,
      );
    }
    // base64 is ~4/3 the byte size; estimate to fail oversized uploads loudly.
    total += Math.floor((f.contentBase64.length * 3) / 4);
    if (total > MAX_UPLOAD_BYTES) {
      throw new FileOpError(413, "upload exceeds the size limit");
    }
    return { name: f.name, contentBase64: f.contentBase64 };
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
 * return the relative paths stored. Existing files are never silently
 * overwritten — colliding names get " (n)" suffixes, Finder-style.
 */
export async function importWorkspaceFiles(
  vfs: Vfs,
  root: string,
  dir: string | null,
  files: readonly UploadFile[],
): Promise<string[]> {
  const target = dir === null ? "" : safeRel(dir);
  const existing = new Set((await vfs.listDetailed(root)).map((s) => s.key));
  const paths: string[] = [];
  for (const f of files) {
    const name = safeUploadName(f.name);
    const rel = dedupeRel(target ? `${target}/${name}` : name, (r) =>
      existing.has(fileKey(root, r)),
    );
    await vfs.writeBytes(
      fileKey(root, rel),
      Buffer.from(f.contentBase64, "base64"),
    );
    existing.add(fileKey(root, rel));
    paths.push(rel);
  }
  return paths;
}

/**
 * Move a file or folder into `toDir` (null = workspace root), keeping its name.
 * Refuses to clobber an existing target (409) and to move a folder into itself.
 * Returns the new relative path.
 */
export async function moveWorkspaceEntry(
  vfs: Vfs,
  root: string,
  rel: string,
  toDir: string | null,
): Promise<string> {
  const from = safeRel(rel);
  const target = toDir === null ? "" : safeRel(toDir);
  if (target === from || target.startsWith(`${from}/`)) {
    throw new FileOpError(400, "cannot move a folder into itself");
  }
  const name = from.split("/").pop() ?? "";
  const to = target ? `${target}/${name}` : name;
  if (to === from) return from;

  const fromKey = fileKey(root, from);
  const toKey = fileKey(root, to);
  const children = await vfs.listDetailed(fromKey); // non-empty ⇒ a directory
  const existing = new Set((await vfs.listDetailed(root)).map((s) => s.key));
  const targetTaken =
    existing.has(toKey) || [...existing].some((k) => k.startsWith(`${toKey}/`));
  if (targetTaken) {
    throw new FileOpError(409, `"${name}" already exists there`);
  }

  if (children.length > 0) {
    for (const c of children) {
      await vfs.move(c.key, `${toKey}${c.key.slice(fromKey.length)}`);
    }
    // Per-key moves leave the (now empty) source directory tree behind on a
    // real filesystem; sweep it.
    await vfs.deletePrefix(fromKey);
    await vfs.deleteKey(fromKey);
  } else {
    if (!existing.has(fromKey)) throw new FileOpError(404, "file not found");
    await vfs.move(fromKey, toKey);
  }
  return to;
}
