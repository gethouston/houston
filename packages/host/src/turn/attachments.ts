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

function parseUploadBody(body: Record<string, unknown>): UploadFile[] {
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
