import { posix } from "node:path";

/**
 * Path validation for the workspace files routes — the wall every UI- or
 * chat-supplied path passes before it touches storage. Split out of
 * `files-ops.ts` (which re-exports everything here) so the ops module stays
 * focused on storage operations.
 */

export class FilePathError extends Error {
  constructor(rel: string) {
    super(`invalid workspace path: ${rel}`);
    this.name = "FilePathError";
  }
}

/** A file operation that failed with a specific HTTP status (409 conflict, 413 too large, …). */
export class FileOpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FileOpError";
  }
}

/** Normalize a UI-supplied relative path; require it to stay inside the workspace and clear of internal dot-dirs. */
export function safeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, "/");
  // Absolute (POSIX or Windows-drive) paths are anomalous — reject, don't silently clamp.
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned))
    throw new FilePathError(rel);
  const norm = posix.normalize(cleaned);
  if (
    norm === "" ||
    norm === "." ||
    norm.startsWith("..") ||
    norm.split("/").includes("..")
  ) {
    throw new FilePathError(rel);
  }
  // Internal Houston state lives in top-level dot-dirs (.houston, .agents). The
  // Files tab must never read or write there.
  if (norm.split("/")[0]?.startsWith(".")) throw new FilePathError(rel);
  return norm;
}

/**
 * Resolve a chat-supplied path to workspace-relative, accepting the ABSOLUTE
 * paths agents drop in prose and tool summaries (`/data/workspaces/W/A/x.md`
 * on cloud pods, `C:\Users\...\workspaces\W\A\x.md` on Windows desktops).
 *
 * Cloud clients cannot strip these themselves — their agent key is an opaque
 * id, not the `<Workspace>/<Agent>` the path embeds — so every click on such a
 * link 400'd. The host DOES know its root: on the local/pod
 * layout the runtime's working directory is `<fsRoot>/<root>`, so the root
 * appears verbatim in every engine-emitted absolute path. Strip up to the
 * first `/<root>/` and validate the remainder; anything else falls through to
 * the strict relative validation.
 */
export function workspaceRel(root: string, raw: string): string {
  const cleaned = raw.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) {
    const marker = `/${root}/`;
    const at = cleaned.indexOf(marker);
    if (at !== -1) return safeRel(cleaned.slice(at + marker.length));
  }
  return safeRel(raw);
}

export const fileKey = (root: string, rel: string) => `${root}/${rel}`;
export const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
};
