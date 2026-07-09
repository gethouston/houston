/**
 * Composer attachments — files the user drops on a chat message, uploaded INTO
 * the agent's workspace so the runtime's clamped Read tool can open them during
 * the turn. The write half of the attachment story; the marker that names the
 * saved paths in the turn's text lives in `attachment-text.ts`.
 *
 * The operation hits the host's `POST attachments` route through the SDK's
 * engine/http seam — the injected `ports.fetch` (which carries auth) against the
 * per-agent root (`/agents/<id>`), exactly how {@link HoustonEngineClient} is
 * built. The route stores each file under the agent's visible `uploads/` folder
 * and returns the RELATIVE paths the agent reads (HOU-706: durable uploads).
 */

import type { ModuleContext } from "../../module-context";

/** One file to upload: original name + its base64-encoded bytes. */
export interface AttachmentUpload {
  name: string;
  contentBase64: string;
}

/** Payload for the `turns/attachments/save` command. */
export interface TurnAttachmentsSaveInput {
  /** The agent whose workspace the files land in (omit for the single local runtime). */
  agentId?: string;
  /**
   * Legacy per-conversation storage key. The current host ignores it (uploads
   * are durable workspace files, HOU-706), but clients still send it so a
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
 * `status` rides the bridge command result's `error.status` (see
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
    return { name: f.name, contentBase64: f.contentBase64 };
  });
  return {
    scopeId: p.scopeId,
    files,
    agentId: typeof p.agentId === "string" ? p.agentId : undefined,
  };
}

/** The typed attachments operation — the SAME function backs the
 *  `turns/attachments/save` command and `sdk.turns.saveAttachments`. */
export interface AttachmentsOperation {
  save(input: TurnAttachmentsSaveInput): Promise<TurnAttachmentsSaveResult>;
}

/** Build the attachments operation over the module's `ports.fetch` seam. */
export function createAttachmentsOperation(
  ctx: ModuleContext,
): AttachmentsOperation {
  const save = async (
    input: TurnAttachmentsSaveInput,
  ): Promise<TurnAttachmentsSaveResult> => {
    // Mirror `clientFor`: the base URL for the flat local runtime, or the agent
    // sandbox root the host nests per-agent routes under (protocol v3).
    const base = ctx.config.baseUrl.replace(/\/+$/, "");
    const agentId = input.agentId ?? "";
    const root =
      agentId === "" ? base : `${base}/agents/${encodeURIComponent(agentId)}`;
    const res = await ctx.config.ports.fetch(`${root}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `scopeId` is forwarded for wire-compat; the current host ignores it.
      body: JSON.stringify({ scopeId: input.scopeId, files: input.files }),
    });
    if (res.status === 413) throw new AttachmentTooLargeError();
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `attachments upload failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    const body = (await res.json()) as { paths?: unknown };
    if (
      !Array.isArray(body.paths) ||
      !body.paths.every((p) => typeof p === "string")
    )
      throw new Error("attachments upload returned a malformed response");
    return { paths: body.paths as string[] };
  };
  return { save };
}
