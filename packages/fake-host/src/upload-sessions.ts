import { randomBytes } from "node:crypto";
import {
  MAX_UPLOAD_FILE_BYTES,
  type OpenUploadRequest,
  openUploadRequestSchema,
  UPLOAD_CHUNK_GRANULE_BYTES,
  UPLOAD_NO_308_HEADER,
  UPLOAD_STATUS_OVERRIDE_HEADER,
} from "@houston/wire-types";
import { CORS, json, parseBody } from "./http";
import { state } from "./state";

const TTL = 24 * 60 * 60 * 1000;
export const uploads = new Map<
  string,
  {
    request: OpenUploadRequest;
    owner: string;
    agentId: string;
    created: number;
    bytes: Buffer;
  }
>();
export function resetUploads(): void {
  uploads.clear();
}

export async function handleUploadSession(
  req: Request,
): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  for (const [id, upload] of uploads)
    if (Date.now() - upload.created >= TTL) uploads.delete(id);
  const sink = /^\/v1\/uploads\/([^/]+)$/.exec(path);
  if (sink && req.method === "PUT") {
    const id = sink[1] ?? "";
    const upload = uploads.get(id);
    if (!upload) return json({ error: "not found" }, 404);
    const range = req.headers.get("Content-Range") ?? "";
    const query = /^bytes \*\/(\d+)$/.exec(range);
    const chunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    if (query) {
      if (Number(query[1]) !== upload.request.size)
        return json({ error: "invalid upload range" }, 400);
    } else if (chunk) {
      const start = Number(chunk[1]),
        end = Number(chunk[2]),
        total = Number(chunk[3]);
      if (
        total !== upload.request.size ||
        end < start ||
        end >= total ||
        (end + 1 < total &&
          (end - start + 1) % UPLOAD_CHUNK_GRANULE_BYTES !== 0)
      )
        return json({ error: "invalid upload range" }, 400);
      if (start === upload.bytes.length) {
        const bytes = Buffer.from(await req.arrayBuffer());
        if (bytes.length > end - start + 1)
          return json({ error: "upload body exceeds range" }, 400);
        upload.bytes = Buffer.concat([upload.bytes, bytes]);
      }
    } else return json({ error: "invalid Content-Range" }, 400);
    if (upload.bytes.length === upload.request.size)
      return json({ uploadId: id, size: upload.request.size });
    const no308 = req.headers.get(UPLOAD_NO_308_HEADER) === "yes";
    return new Response(null, {
      status: no308 ? 200 : 308,
      headers: {
        ...CORS,
        ...(upload.bytes.length
          ? { Range: `bytes=0-${upload.bytes.length - 1}` }
          : {}),
        ...(no308 ? { [UPLOAD_STATUS_OVERRIDE_HEADER]: "308" } : {}),
      },
    });
  }
  const route = /^\/agents\/([^/]+)\/uploads$/.exec(path);
  if (!route || req.method !== "POST") return undefined;
  const agentId = decodeURIComponent(route[1] ?? "");
  const owner = req.headers.get("Authorization") ?? "local";
  if (!state.agents.some((agent) => agent.id === agentId))
    return json({ error: "agent not found" }, 404);
  const body: unknown = await parseBody(req);
  const parsed = openUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLarge =
      typeof body === "object" &&
      body !== null &&
      "size" in body &&
      typeof body.size === "number" &&
      body.size > MAX_UPLOAD_FILE_BYTES;
    return json(
      {
        error: "invalid upload request",
        ...(tooLarge ? { code: "upload_too_large" } : {}),
      },
      tooLarge ? 413 : 400,
    );
  }
  if ([...uploads.values()].filter((u) => u.owner === owner).length >= 16)
    return new Response(
      JSON.stringify({ error: "too many uploads", code: "too_many_uploads" }),
      {
        status: 429,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  const uploadId = randomBytes(24).toString("base64url");
  const created = Date.now();
  uploads.set(uploadId, {
    request: parsed.data,
    owner,
    agentId,
    created,
    bytes: Buffer.alloc(0),
  });
  return json({
    uploadId,
    uploadUrl: `/v1/uploads/${uploadId}`,
    chunkBytes: 8 * 1024 * 1024,
    expiresAt: new Date(created + TTL).toISOString(),
  });
}
