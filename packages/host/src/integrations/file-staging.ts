import { createHash } from "node:crypto";
import { mimeFor } from "../turn/files-mime";
import { type FileUploadSlot, hasFileArgs, mapFileArgs } from "./file-args";
import type { ActingContext, IntegrationProvider } from "./provider";

/**
 * Turns the workspace paths an agent passes for an action's file arguments into
 * the `{ name, mimetype, s3key }` objects the provider executes with: read the
 * file, reserve an upload slot, PUT the bytes, swap the value. Runs on the
 * engine host because only it can read the agent's workspace; the provider
 * (or the cloud gateway behind it) only describes actions and mints slots.
 */

/** Ceiling for one file argument, read whole into memory to hash and send.
 *  Composio documents none; Gmail itself refuses past 25 MB. */
export const MAX_FILE_ARG_BYTES = 50 * 1024 * 1024;

/** An action's schema rarely changes; looked up once per action per hour. */
const SCHEMA_TTL_MS = 60 * 60 * 1000;
const MAX_SCHEMA_ENTRIES = 500;

/**
 * A file argument the agent got wrong (missing, a folder, outside its
 * workspace, too large). Its message is written for the model, which reads it
 * as the action's failure reason and corrects the call or tells the user.
 */
export class FileArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileArgumentError";
  }
}

/** A workspace file read for upload; null when nothing is at the path. */
export interface WorkspaceFile {
  name: string;
  bytes: Buffer;
}

export interface StageFilesInput {
  provider: IntegrationProvider;
  userId: string;
  action: string;
  params: Record<string, unknown>;
  acting?: ActingContext;
  /** Reads one agent-supplied path; throws FileArgumentError when the path
   *  can never be a workspace file, null when nothing is there. */
  readFile: (path: string) => Promise<WorkspaceFile | null>;
}

/** A path, from the documented string form or the `{ s3key: <path> }` shape
 *  agents copy from the raw schema. A real Composio key there has no file
 *  behind it in the workspace and is forwarded untouched. */
function fileRef(value: unknown): { path: string; name?: string } | null {
  if (typeof value === "string") return value ? { path: value } : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { s3key, name } = value as { s3key?: unknown; name?: unknown };
  if (typeof s3key !== "string" || !s3key) return null;
  return { path: s3key, ...(typeof name === "string" && name ? { name } : {}) };
}

export function createFileStager(fetchImpl: typeof fetch = fetch) {
  const schemas = new Map<
    string,
    { at: number; toolkit: string; inputParams: unknown }
  >();

  async function fileSchema(input: StageFilesInput) {
    const { provider, action } = input;
    if (!provider.describeAction || !provider.reserveFileUpload) return null;
    const cacheKey = `${provider.id}:${action}`;
    const hit = schemas.get(cacheKey);
    if (hit && Date.now() - hit.at < SCHEMA_TTL_MS) return hit;
    const described = await provider.describeAction(
      input.userId,
      action,
      input.acting,
    );
    // Only file-bearing schemas are kept whole; the rest cache as "none".
    const entry = {
      at: Date.now(),
      toolkit: described?.toolkit ?? "",
      inputParams: hasFileArgs(described?.inputParams)
        ? described?.inputParams
        : null,
    };
    if (schemas.size >= MAX_SCHEMA_ENTRIES) schemas.clear();
    schemas.set(cacheKey, entry);
    return entry;
  }

  async function upload(slot: FileUploadSlot, bytes: Buffer): Promise<void> {
    const res = await fetchImpl(slot.uploadUrl, {
      method: "PUT",
      headers: slot.headers,
      body: new Uint8Array(bytes),
    });
    if (!res.ok) {
      throw new Error(`file upload for the app failed (HTTP ${res.status})`);
    }
  }

  /** `params` with every file argument staged; untouched when the action
   *  takes no file or the provider cannot stage one. */
  return async function stageFiles(
    input: StageFilesInput,
  ): Promise<Record<string, unknown>> {
    const schema = await fileSchema(input);
    if (!schema?.inputParams) return input.params;
    const { toolkit } = schema;
    const reserve = input.provider.reserveFileUpload;
    if (!reserve) return input.params;
    const staged = await mapFileArgs(
      input.params,
      schema.inputParams,
      async (value) => {
        const ref = fileRef(value);
        if (!ref) return value;
        // Composio keys are relative ("<project>/gmail/…"); an absolute s3key
        // can only be the agent's own path, so it gets the same guidance.
        const isPathForm =
          typeof value === "string" || ref.path.startsWith("/");
        let file: WorkspaceFile | null;
        try {
          file = await input.readFile(ref.path);
        } catch (err) {
          if (err instanceof FileArgumentError && !isPathForm) return value;
          throw err;
        }
        if (!file) {
          if (!isPathForm) return value;
          throw new FileArgumentError(
            `The file "${ref.path}" was not found in your workspace. A file parameter takes the path of a file in your workspace (for example "reports/q3.pdf"); save or download the file there first, then retry with its path.`,
          );
        }
        const name = ref.name ?? file.name;
        const mimetype = mimeFor(name).split(";")[0] ?? "";
        const slot = await reserve.call(
          input.provider,
          input.userId,
          {
            action: input.action,
            toolkit,
            filename: name,
            mimetype,
            md5: createHash("md5").update(file.bytes).digest("hex"),
          },
          input.acting,
        );
        await upload(slot, file.bytes);
        return { name, mimetype, s3key: slot.key };
      },
    );
    return staged as Record<string, unknown>;
  };
}
