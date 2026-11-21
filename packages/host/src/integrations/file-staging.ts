import { createHash } from "node:crypto";
import { mimeFor } from "../turn/files-mime";
import { ComposioApiError } from "./composio-http";
import {
  type FileUploadSlot,
  fileRef,
  hasFileArgs,
  mapFileArgs,
} from "./file-args";
import type { ActingContext, IntegrationProvider } from "./provider";
import {
  IntegrationSigninRequiredError,
  IntegrationUpstreamError,
} from "./types";

export const MAX_FILE_ARG_BYTES = 50 * 1024 * 1024;

const SCHEMA_TTL_MS = 60 * 60 * 1000;
const MAX_SCHEMA_ENTRIES = 500;

export class FileArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileArgumentError";
  }
}

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
  readFile: (path: string) => Promise<WorkspaceFile | null>;
  fetch?: typeof fetch;
}

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function isRefusal(err: unknown): boolean {
  if (err instanceof IntegrationSigninRequiredError) return true;
  const status =
    err instanceof IntegrationUpstreamError || err instanceof ComposioApiError
      ? err.status
      : undefined;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
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
    let described: Awaited<ReturnType<typeof provider.describeAction>>;
    try {
      described = await provider.describeAction(
        input.userId,
        action,
        input.acting,
      );
    } catch (err) {
      if (isRefusal(err)) throw err;
      console.warn(
        `[integrations] describing ${action} failed; executing without staging files: ${String(err)}`,
      );
      return null;
    }
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

  async function upload(
    slot: FileUploadSlot,
    bytes: Buffer,
    put: typeof fetch,
  ): Promise<void> {
    const res = await put(slot.uploadUrl, {
      method: "PUT",
      headers: slot.headers,
      body: bytes as Uint8Array<ArrayBuffer>,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`file upload for the app failed (HTTP ${res.status})`);
    }
  }

  return async function stageFiles(
    input: StageFilesInput,
  ): Promise<Record<string, unknown>> {
    const schema = await fileSchema(input);
    if (!schema?.inputParams) return input.params;
    const { toolkit } = schema;
    const reserve = input.provider.reserveFileUpload;
    if (!reserve) return input.params;
    let total = 0;
    const staged = await mapFileArgs(
      input.params,
      schema.inputParams,
      async (value) => {
        const ref = fileRef(value);
        if (!ref) return value;
        const file = await input.readFile(ref.path);
        if (!file) {
          throw new FileArgumentError(
            `The file "${ref.path}" was not found in your workspace. A file parameter takes the path of a file in your workspace (for example "reports/q3.pdf"); save or download the file there first, then retry with its path.`,
          );
        }
        total += file.bytes.length;
        if (total > MAX_FILE_ARG_BYTES) {
          throw new FileArgumentError(
            `The files for this action add up to more than ${MAX_FILE_ARG_BYTES / 1024 / 1024} MB, the most Houston can send to an app at once. Send fewer or smaller files.`,
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
        await upload(slot, file.bytes, input.fetch ?? fetchImpl);
        return { name, mimetype, s3key: slot.key };
      },
    );
    return staged as Record<string, unknown>;
  };
}
