import type { ComposioHttp } from "./composio-http";
import { mapTool, type RawTool } from "./composio-wire";
import type {
  ActionDescription,
  FileUploadRequest,
  FileUploadSlot,
} from "./file-args";

export async function describeComposioAction(
  http: ComposioHttp,
  action: string,
  toolVersion: string,
): Promise<ActionDescription | null> {
  const body = await http.call<{ items?: RawTool[] }>("/api/v3/tools", {
    query: { tool_slugs: action, limit: "1", toolkit_versions: toolVersion },
  });
  const match = (body?.items ?? [])
    .map(mapTool)
    .find((tool) => tool.action.toLowerCase() === action.toLowerCase());
  return match
    ? {
        action: match.action,
        toolkit: match.toolkit,
        inputParams: match.inputParams,
      }
    : null;
}

export async function reserveComposioUpload(
  http: ComposioHttp,
  req: FileUploadRequest,
): Promise<FileUploadSlot> {
  const body = await http.call<{
    key?: string;
    new_presigned_url?: string;
    newPresignedUrl?: string;
    metadata?: { storage_backend?: string };
  }>("/api/v3.1/files/upload/request", {
    method: "POST",
    body: {
      filename: req.filename,
      mimetype: req.mimetype,
      md5: req.md5,
      tool_slug: req.action,
      toolkit_slug: req.toolkit,
    },
  });
  const uploadUrl = body?.new_presigned_url ?? body?.newPresignedUrl;
  if (!body?.key || !uploadUrl) {
    throw new Error("composio: upload request returned no key or upload url");
  }
  return {
    key: body.key,
    uploadUrl,
    headers: {
      "Content-Type": req.mimetype,
      ...(body.metadata?.storage_backend === "azure_blob_storage"
        ? { "x-ms-blob-type": "BlockBlob" }
        : {}),
    },
  };
}
