import type { ModuleContext } from "../../module-context";
import { FilesHttpError } from "../files/http";
import type { FileUpload } from "../files/types";
import { saveAttachments } from "../files/uploads";
import { moduleScope } from "../http";

/** One file to upload: original name, base64 bytes, and its folder path. */
export type AttachmentUpload = FileUpload;

/** Payload for the `turns/attachments/save` command. */
export interface TurnAttachmentsSaveInput {
  /** The agent whose workspace the files land in; the route exists only under one. */
  agentId: string;
  /**
   * Legacy per-conversation storage key. The current host ignores it (uploads
   * are durable workspace files), but clients still send it so a
   * not-yet-updated cloud pod keeps accepting the request.
   */
  scopeId: string;
  /** The files to upload; must be non-empty, each with a non-empty name. */
  files: AttachmentUpload[];
}

/** Result of a save: the workspace-relative paths the agent's Read tool opens. */
export interface TurnAttachmentsSaveResult {
  paths: string[];
}

/**
 * The upload exceeded the host's request cap (HTTP 413). Typed so a surface can
 * show a "files too large" message instead of a generic failure; the numeric
 * `status` rides the dispatch command result's `error.status` (see
 * `CommandRegistry.dispatch` → `toCommandError`). No silent failure — the op
 * throws this, never swallows an oversized upload.
 */
export class AttachmentTooLargeError extends Error {
  readonly status = 413;
  constructor(message = "Attachments exceed the upload size limit.") {
    super(message);
    this.name = "AttachmentTooLargeError";
  }
}

/** Untrusted-envelope guard for the `turns/attachments/save` payload. Throws on
 *  any bad shape (the registry turns the throw into `ok: false`). */
export function asAttachmentsSaveInput(
  payload: unknown,
): TurnAttachmentsSaveInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.agentId !== "string" || p.agentId === "")
    throw new Error("turns/attachments/save requires a string agentId");
  if (typeof p.scopeId !== "string")
    throw new Error("turns/attachments/save requires a string scopeId");
  if (!Array.isArray(p.files) || p.files.length === 0)
    throw new Error("turns/attachments/save requires a non-empty files array");
  const files: AttachmentUpload[] = p.files.map((raw, i) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    if (typeof f.name !== "string" || f.name === "")
      throw new Error(
        `turns/attachments/save file[${i}] needs a non-empty string name`,
      );
    if (typeof f.contentBase64 !== "string")
      throw new Error(
        `turns/attachments/save file[${i}] needs a string contentBase64`,
      );
    return {
      name: f.name,
      contentBase64: f.contentBase64,
      ...(typeof f.relPath === "string" ? { relPath: f.relPath } : {}),
    };
  });
  return { agentId: p.agentId, scopeId: p.scopeId, files };
}

/** The typed attachments operation — the SAME function backs the
 *  `turns/attachments/save` command and `sdk.turns.saveAttachments`. */
export interface AttachmentsOperation {
  save(input: TurnAttachmentsSaveInput): Promise<TurnAttachmentsSaveResult>;
}

export function createAttachmentsOperation(
  ctx: ModuleContext,
): AttachmentsOperation {
  const scope = moduleScope(ctx, "files", FilesHttpError);
  const save = async (
    input: TurnAttachmentsSaveInput,
  ): Promise<TurnAttachmentsSaveResult> => {
    let paths: unknown;
    try {
      paths = await saveAttachments(
        scope,
        input.agentId,
        input.scopeId,
        input.files,
      );
    } catch (err) {
      if (err instanceof FilesHttpError && err.status === 413)
        throw new AttachmentTooLargeError();
      throw err;
    }
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string"))
      throw new Error("attachments upload returned a malformed response");
    return { paths: paths as string[] };
  };
  return { save };
}
