import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./deps";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES } from "./files-import";

/**
 * Composer attachments — files the user drops on a chat message, uploaded INTO
 * the agent's workspace so the runtime's clamped file tools can Read them during
 * the turn.
 *
 * Storage: `<agentRoot>/uploads/<filename>`. `agentRoot` is
 * HOUSTON_WORKSPACE_DIR — the very root the runtime's WorkspaceGuard clamps to —
 * so the RELATIVE path we return (`uploads/<filename>`) is exactly what the
 * agent's Read tool resolves and is allowed to open. The frontend encodes that
 * path verbatim into the message text ("Read these attached files: …"), so what
 * we store and what we return MUST agree.
 *
 * `uploads` is a regular, VISIBLE workspace folder: uploads are permanent agent
 * context, not per-conversation scratch (HOU-706). The user sees them in the
 * Files tab, the agent can find them from ANY later conversation, and clearing
 * or deleting a chat never removes them. (The pre-HOU-706 layout — a hidden
 * `.attachments/<scopeId>/` dot-dir wiped on chat delete — made every upload
 * silently vanish from the user's point of view. Files already stored there
 * stay readable at their old paths; new uploads never land there.)
 *
 * Transport: base64 JSON (dependency-free, binary-safe — the same base64 path
 * `files/read` already uses). The body's `scopeId` is legacy: older hosts keyed
 * storage (and a DELETE route) on it. It is accepted and ignored so current
 * clients — which still send it to stay compatible with not-yet-updated cloud
 * pods — never 400.
 */

/** The on-disk dir name — a visible, durable folder in the agent's workspace. */
const UPLOADS_DIR = "uploads";

// A single request's decoded payload is capped at MAX_UPLOAD_BYTES (shared with
// files/import so the composer's client-side per-file limit and the host cap
// can't drift; the client uploads one request per file, so per-file =
// per-request). The RAW body is bounded during draining by MAX_UPLOAD_BODY_BYTES
// so an oversized upload can never buffer into the process.

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

const uploadsKey = (root: string) => `${root}/${UPLOADS_DIR}`;

/**
 * Write each uploaded file under `uploads/` and return the RELATIVE workspace
 * paths the agent will read. Names colliding with anything already in the
 * folder — or with each other within a batch — are disambiguated (`name.ext`,
 * `name (1).ext`, …) so an upload never silently overwrites an earlier one and
 * every returned path resolves to a distinct stored file.
 */
export async function saveAttachments(
  vfs: Vfs,
  root: string,
  files: readonly UploadFile[],
): Promise<string[]> {
  // Seed the dedup set with what the folder already holds: uploads are durable
  // across conversations, so "report.pdf" attached today must not clobber the
  // "report.pdf" attached last week.
  const prefix = uploadsKey(root);
  const used = new Set<string>(
    (await vfs.list(prefix)).map((k) => k.slice(prefix.length + 1)),
  );
  const paths: string[] = [];
  for (const f of files) {
    const filename = dedupe(safeFilename(f.name), used);
    const bytes = Buffer.from(f.contentBase64, "base64");
    const rel = `${UPLOADS_DIR}/${filename}`;
    await vfs.writeBytes(`${root}/${rel}`, bytes);
    paths.push(rel);
  }
  return paths;
}

/** Pick a unique filename within the folder, appending " (n)" before the extension. */
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

/** Parse + validate the upload body. Throws AttachmentError (→ 4xx) on any malformed input. */
function parseUploadBody(body: Record<string, unknown>): UploadFile[] {
  // `scopeId` (legacy per-conversation storage key) is deliberately not read.
  if (!Array.isArray(body.files)) {
    throw new AttachmentError(400, "missing 'files' array");
  }
  let total = 0;
  return body.files.map((raw, i) => {
    const f = raw as { name?: unknown; contentBase64?: unknown };
    if (typeof f.name !== "string" || typeof f.contentBase64 !== "string") {
      throw new AttachmentError(
        400,
        `file[${i}] needs string 'name' and 'contentBase64'`,
      );
    }
    // Semantic decoded-size limit (base64 is ~3/4 the byte size). The raw body
    // is already capped DURING draining by readJson(MAX_UPLOAD_BODY_BYTES) — the
    // OOM guard — so this estimate is now purely the user-facing size limit, not
    // the memory backstop it used to (wrongly) stand in for.
    total += Math.floor((f.contentBase64.length * 3) / 4);
    if (total > MAX_UPLOAD_BYTES) {
      throw new AttachmentError(
        413,
        "attachments exceed the upload size limit",
      );
    }
    return { name: f.name, contentBase64: f.contentBase64 };
  });
}

/**
 * HTTP handler for `attachments` routes, intercepted by the host BEFORE the
 * runtime channel (the runtime has no /attachments route). Returns true when it
 * owns the request. A missing vfs 503s; malformed input 4xxs. Nothing swallowed.
 *
 *   POST attachments  { files: [{ name, contentBase64 }] } → { paths }
 *
 * DELETE (the legacy per-scope wipe) is gone: uploads are permanent workspace
 * files the user manages through the Files tab. Old clients still fire a
 * best-effort DELETE when a chat is cleared; they get the 405 below and ignore
 * it — and, crucially, nothing they do can remove a stored upload.
 *
 * Every upload fires `FilesChanged` through `emit`: the files now land in a
 * visible folder, so Files tabs (this client's and everyone else's) must
 * refresh without a manual reload.
 */
export async function handleAttachments(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  if (rest !== "attachments") return false;
  if (!vfs) {
    json(res, 503, { error: "attachments not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  try {
    if (method === "POST") {
      const files = parseUploadBody(await readJson(req, MAX_UPLOAD_BODY_BYTES));
      const saved = await saveAttachments(vfs, root, files);
      if (saved.length > 0)
        emit?.({ type: "FilesChanged", agentPath: ctx.agent.id });
      json(res, 200, { paths: saved });
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
