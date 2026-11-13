import {
  committedUploadFileSchema,
  migrationImportCommitSchema,
} from "@houston/wire-types";
import { json, parseBody } from "./http";
import { handleUploadSession, uploads } from "./upload-sessions";

export { resetUploads } from "./upload-sessions";
export async function handleFakeUploads(
  req: Request,
  dispatch: (req: Request) => Promise<Response>,
): Promise<Response | undefined> {
  const session = await handleUploadSession(req);
  if (session) return session;
  const path = new URL(req.url).pathname;
  const route =
    /^\/agents\/([^/]+)\/(attachments|files\/import|migration\/import)$/.exec(
      path,
    );
  if (!route || req.method !== "POST") return undefined;
  const agentId = decodeURIComponent(route[1] ?? "");
  const owner = req.headers.get("Authorization") ?? "local";
  if (!req.headers.get("Content-Type")?.includes("application/json"))
    return undefined;
  const body: unknown = await parseBody(req.clone());
  const purpose =
    route[2] === "attachments"
      ? "attachment"
      : route[2] === "files/import"
        ? "files_import"
        : "migration_import";
  const ids: string[] = [];
  const resolve = (id: string): Buffer | Response => {
    const upload = uploads.get(id);
    if (
      !upload ||
      upload.owner !== owner ||
      upload.agentId !== agentId ||
      upload.request.purpose !== purpose
    )
      return json({ error: "upload not found", code: "upload_not_found" }, 404);
    if (upload.bytes.length !== upload.request.size)
      return json(
        { error: "upload incomplete", code: "upload_incomplete" },
        409,
      );
    ids.push(id);
    return upload.bytes;
  };
  let next: Request;
  if (purpose === "migration_import") {
    const parsed = migrationImportCommitSchema.safeParse(body);
    if (!parsed.success)
      return json({ error: "invalid migration upload" }, 400);
    const bytes = resolve(parsed.data.uploadId);
    if (bytes instanceof Response) return bytes;
    const headers = new Headers(req.headers);
    headers.set("Content-Type", "application/zip");
    next = new Request(req.url, {
      method: "POST",
      headers,
      body: new Uint8Array(bytes),
    });
  } else {
    if (
      typeof body !== "object" ||
      body === null ||
      !("files" in body) ||
      !Array.isArray(body.files)
    )
      return undefined;
    const files: unknown[] = [];
    for (const file of body.files) {
      if (typeof file !== "object" || file === null || !("uploadId" in file)) {
        files.push(file);
        continue;
      }
      const parsed = committedUploadFileSchema.safeParse(file);
      if (!parsed.success) return json({ error: "invalid staged upload" }, 400);
      const bytes = resolve(parsed.data.uploadId);
      if (bytes instanceof Response) return bytes;
      files.push({
        name: parsed.data.name,
        relPath: parsed.data.relPath,
        contentBase64: bytes.toString("base64"),
      });
    }
    if (!ids.length) return undefined;
    next = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ ...body, files }),
    });
  }
  const response = await dispatch(next);
  if (response.ok) for (const id of ids) uploads.delete(id);
  return response;
}
