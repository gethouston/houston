import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { UploadCopyExistsError } from "@houston/runtime-client/object-sync";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import {
  type StagedUploads,
  StagedUploadUnavailableError,
  type UploadFile,
} from "../uploads/commit";
import { parseUploadFiles } from "../uploads/parse-files";
import { UploadError } from "../uploads/types";
import type { Vfs } from "../vfs";
import { AttachmentError } from "./attachment-error";
import { saveAttachments } from "./attachments-save";
import { json, methodNotAllowed, readJson } from "./deps";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES } from "./files-import";

export { AttachmentError } from "./attachment-error";
export { saveAttachments } from "./attachments-save";

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
 * `files/read` already uses) for small files; larger files reference a staged
 * upload. The body's `scopeId` is legacy: older hosts keyed
 * storage (and a DELETE route) on it. It is accepted and ignored so current
 * clients — which still send it to stay compatible with not-yet-updated cloud
 * pods — never 400.
 */

// A single request's decoded payload is capped at MAX_UPLOAD_BYTES (shared with
// files/import so the composer's client-side per-file limit and the host cap
// can't drift; the client uploads one request per file, so per-file =
// per-request). The RAW body is bounded during draining by MAX_UPLOAD_BODY_BYTES
// so an oversized upload can never buffer into the process.

/** Parse + validate the upload body. Throws AttachmentError (→ 4xx) on any malformed input. */
function parseUploadBody(body: Record<string, unknown>): UploadFile[] {
  // `scopeId` (legacy per-conversation storage key) is deliberately not read.
  if (!Array.isArray(body.files))
    throw new AttachmentError(400, "missing 'files' array");
  return parseUploadFiles(
    body.files,
    MAX_UPLOAD_BYTES,
    (status, message) =>
      new AttachmentError(
        status,
        status === 413 ? "attachments exceed the upload size limit" : message,
      ),
  );
}

/**
 * HTTP handler for `attachments` routes, intercepted by the host BEFORE the
 * runtime channel (the runtime has no /attachments route). Returns true when it
 * owns the request. A missing vfs 503s; malformed input 4xxs. Nothing swallowed.
 *
 *   POST attachments  { files: [{ name, contentBase64, relPath? }] } → { paths }
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
  uploads?: StagedUploads,
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
      const saved = await saveAttachments(vfs, root, files, uploads);
      if (saved.length > 0)
        emit?.({ type: "FilesChanged", agentPath: ctx.agent.id });
      json(res, 200, { paths: saved });
      return true;
    }
    methodNotAllowed(res);
    return true;
  } catch (err) {
    if (
      err instanceof UploadError ||
      err instanceof StagedUploadUnavailableError ||
      err instanceof UploadCopyExistsError
    ) {
      json(res, err.status, {
        error: err.message,
        ...("code" in err ? { code: err.code } : {}),
      });
      return true;
    }
    if (err instanceof AttachmentError) {
      json(res, err.status, { error: err.message });
      return true;
    }
    throw err;
  }
}
