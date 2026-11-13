import {
  MAX_UPLOAD_FILE_BYTES,
  openUploadRequestSchema,
} from "@houston/wire-types";
import { json, readJson } from "../routes/http";
import { defineRoute } from "../routes/registry";
import { serveUploadSink } from "./sink";
import { UploadError } from "./types";

defineRoute({
  group: "upload-sink",
  method: "PUT",
  path: "/v1/uploads/:uploadId",
  phase: "public",
  classification: "infra",
  reason:
    "The SDK reaches this byte sink only through the uploadUrl returned by openUpload; the upload id grants access.",
  source: "packages/host/src/uploads/routes.ts",
  handler: ({ deps, params, req, res }) =>
    serveUploadSink(deps.uploadSessions, params.uploadId ?? "", req, res),
});
defineRoute({
  group: "uploads",
  method: "POST",
  path: "/agents/:agentId/uploads",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/uploads/routes.ts",
  handler: async ({ deps, authz, userId, req, res }) => {
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      if (error instanceof SyntaxError)
        return json(res, 400, { error: "invalid upload request" });
      throw error;
    }
    const request = openUploadRequestSchema.safeParse(body);
    if (!request.success) {
      if (
        typeof body === "object" &&
        body !== null &&
        "size" in body &&
        typeof body.size === "number" &&
        body.size > MAX_UPLOAD_FILE_BYTES
      )
        return json(res, 413, {
          error: "upload too large",
          code: "upload_too_large",
        });
      return json(res, 400, { error: "invalid upload request" });
    }
    if (!deps.uploadSessions) return json(res, 404, { error: "not found" });
    try {
      json(
        res,
        200,
        await deps.uploadSessions.open(request.data, {
          agentId: authz.agent.id,
          workspace: authz.workspace.id,
          owner: userId,
        }),
      );
    } catch (error) {
      if (!(error instanceof UploadError)) throw error;
      json(
        res,
        error.status,
        { error: error.message, code: error.code },
        error.code === "too_many_uploads" ? { "Retry-After": "60" } : {},
      );
    }
  },
});
