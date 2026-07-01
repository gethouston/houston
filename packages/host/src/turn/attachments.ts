import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./deps";

/**
 * Composer attachments — files the user drops on a chat message, uploaded INTO
 * the agent's workspace so the runtime's clamped file tools can Read them during
 * the turn.
 *
 * Storage: `<agentRoot>/.attachments/<scopeId>/<filename>`. `agentRoot` is
 * HOUSTON_WORKSPACE_DIR — the very root the runtime's WorkspaceGuard clamps to —
 * so the RELATIVE path we return (`.attachments/<scopeId>/<filename>`) is exactly
 * what the agent's Read tool resolves and is allowed to open (a leading dot-dir
 * is fine: the clamp only blocks `..` / absolute / `~` escapes). The frontend
 * encodes that path verbatim into the message text ("Read these attached
 * files: …"), so what we store and what we return MUST agree.
 *
 * `.attachments` is a top-level dot-dir, so the Files tab (which hides + refuses
 * top-level dot-dirs) never shows or clobbers it — same wall that hides
 * `.houston` / `.agents`.
 *
 * Transport: base64 JSON (dependency-free, binary-safe — the same base64 path
 * `files/read` already uses). `scopeId` keys the per-message folder so
 * `deleteAttachments(scopeId)` can drop the whole batch.
 */

/** The on-disk dir name. Top-level dot-dir → invisible to + untouchable by the Files tab. */
const ATTACHMENTS_DIR = ".attachments";

/** Cap a single upload request so a runaway/oversized body fails loudly, not silently. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MiB across all files in one request

export class AttachmentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

/** One uploaded file: original name + its base64-encoded bytes. */
interface UploadFile {
  name: string;
  contentBase64: string;
}

/**
 * Validate a scopeId / filename segment: a single path component, no traversal,
 * no separators, no leading dot (the dot-dir is ours to add). Rejected loudly.
 */
function safeSegment(seg: string, kind: "scopeId" | "filename"): string {
  if (
    seg === "" ||
    seg === "." ||
    seg === ".." ||
    seg.includes("/") ||
    seg.includes("\\") ||
    seg.startsWith(".")
  ) {
    throw new AttachmentError(400, `invalid attachment ${kind}: ${seg}`);
  }
  return seg;
}

/** The relative path (under agentRoot) the agent's Read tool resolves. */
function relPath(scopeId: string, filename: string): string {
  return `${ATTACHMENTS_DIR}/${scopeId}/${filename}`;
}

const dirKey = (root: string, scopeId: string) =>
  `${root}/${ATTACHMENTS_DIR}/${scopeId}`;
const fileKey = (root: string, rel: string) => `${root}/${rel}`;

/**
 * Write each uploaded file under `.attachments/<scopeId>/` and return the
 * RELATIVE workspace paths the agent will read. Duplicate filenames in one batch
 * are disambiguated (`name.ext`, `name (1).ext`, …) so nothing is silently
 * overwritten and every returned path resolves to a distinct stored file.
 */
export async function saveAttachments(
  vfs: Vfs,
  root: string,
  scopeId: string,
  files: readonly UploadFile[],
): Promise<string[]> {
  safeSegment(scopeId, "scopeId");
  const used = new Set<string>();
  const paths: string[] = [];
  for (const f of files) {
    const filename = dedupe(safeSegment(f.name, "filename"), used);
    const bytes = Buffer.from(f.contentBase64, "base64");
    const rel = relPath(scopeId, filename);
    await vfs.writeBytes(fileKey(root, rel), bytes);
    paths.push(rel);
  }
  return paths;
}

/** Pick a unique filename within a batch, appending " (n)" before the extension. */
function dedupe(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** Drop every file stored for a scope (the whole `.attachments/<scopeId>` dir). */
export async function deleteAttachments(
  vfs: Vfs,
  root: string,
  scopeId: string,
): Promise<void> {
  safeSegment(scopeId, "scopeId");
  await vfs.deletePrefix(dirKey(root, scopeId));
}

/** Parse + validate the upload body. Throws AttachmentError (→ 4xx) on any malformed input. */
function parseUploadBody(body: Record<string, unknown>): {
  scopeId: string;
  files: UploadFile[];
} {
  const scopeId = body.scopeId;
  if (typeof scopeId !== "string" || scopeId === "") {
    throw new AttachmentError(400, "missing 'scopeId'");
  }
  if (!Array.isArray(body.files)) {
    throw new AttachmentError(400, "missing 'files' array");
  }
  let total = 0;
  const files: UploadFile[] = body.files.map((raw, i) => {
    const f = raw as { name?: unknown; contentBase64?: unknown };
    if (typeof f.name !== "string" || typeof f.contentBase64 !== "string") {
      throw new AttachmentError(
        400,
        `file[${i}] needs string 'name' and 'contentBase64'`,
      );
    }
    // base64 is ~4/3 the byte size; estimate to fail oversized uploads loudly.
    total += Math.floor((f.contentBase64.length * 3) / 4);
    if (total > MAX_UPLOAD_BYTES) {
      throw new AttachmentError(
        413,
        "attachments exceed the upload size limit",
      );
    }
    return { name: f.name, contentBase64: f.contentBase64 };
  });
  return { scopeId, files };
}

/**
 * HTTP handler for `attachments` routes, intercepted by the host BEFORE the
 * runtime channel (the runtime has no /attachments route). Returns true when it
 * owns the request. A missing vfs 503s; malformed input 4xxs. Nothing swallowed.
 *
 *   POST   attachments  { scopeId, files: [{ name, contentBase64 }] } → { paths }
 *   DELETE attachments?scopeId=<id>                                   → { ok }
 */
export async function handleAttachments(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams,
): Promise<boolean> {
  if (rest !== "attachments") return false;
  if (!vfs) {
    json(res, 503, { error: "attachments not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  try {
    if (method === "POST") {
      const { scopeId, files } = parseUploadBody(await readJson(req));
      const saved = await saveAttachments(vfs, root, scopeId, files);
      json(res, 200, { paths: saved });
      return true;
    }
    if (method === "DELETE") {
      const scopeId = query.get("scopeId") ?? "";
      if (!scopeId) {
        json(res, 400, { error: "missing 'scopeId'" });
        return true;
      }
      await deleteAttachments(vfs, root, scopeId);
      json(res, 200, { ok: true });
      return true;
    }
    json(res, 405, { error: "method not allowed" });
    return true;
  } catch (err) {
    if (err instanceof AttachmentError) {
      json(res, err.status, { error: err.message });
      return true;
    }
    throw err;
  }
}
