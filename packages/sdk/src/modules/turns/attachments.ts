import type { ModuleContext } from "../../module-context";
import { FilesHttpError } from "../files/http";
import type { FileUpload } from "../files/types";
import { saveAttachments } from "../files/uploads";
import { moduleScope } from "../http";

export type AttachmentUpload = FileUpload;

export interface TurnAttachmentsSaveInput {
  agentId: string;
  scopeId: string;
  files: AttachmentUpload[];
}

export interface TurnAttachmentsSaveResult {
  paths: string[];
}

export class AttachmentTooLargeError extends Error {
  readonly status = 413;
  constructor(message = "Attachments exceed the upload size limit.") {
    super(message);
    this.name = "AttachmentTooLargeError";
  }
}

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
