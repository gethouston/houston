import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { UploadCopyExistsError } from "@houston/runtime-client/object-sync";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import {
  type StagedUploads,
  StagedUploadUnavailableError,
} from "../uploads/commit";
import { UploadError } from "../uploads/types";
import type { Vfs } from "../vfs";
import { json, readJson } from "./deps";
import {
  importWorkspaceFiles,
  MAX_UPLOAD_BODY_BYTES,
  parseImportBody,
} from "./files-import";
import { moveWorkspaceEntry } from "./files-move";
import type { OfficePreview } from "./files-office";
import {
  createWorkspaceFolder,
  deleteWorkspaceFile,
  FileOpError,
  FilePathError,
  readOnlyRefusal,
  renameWorkspaceFile,
} from "./files-ops";
import { handleFileReads } from "./files-read";

export * from "./files-mime";
export * from "./files-ops";

export async function handleFiles(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams,
  emit?: (event: HoustonEvent) => void,
  officePreview?: OfficePreview,
  uploads?: StagedUploads,
): Promise<boolean> {
  if (rest !== "files" && !rest.startsWith("files/")) return false;
  if (!vfs) {
    json(res, 503, { error: "files not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const changed = () =>
    emit?.({ type: "FilesChanged", agentPath: ctx.agent.id });
  try {
    if (
      method === "GET" &&
      (await handleFileReads(
        vfs,
        root,
        ctx.agent,
        rest,
        res,
        query,
        officePreview,
      ))
    )
      return true;
    if (method === "DELETE" && rest === "files") {
      await deleteWorkspaceFile(vfs, root, query.get("path") ?? "");
      changed();
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/import") {
      const { dir, files } = parseImportBody(
        await readJson(req, MAX_UPLOAD_BODY_BYTES),
      );
      const saved = await importWorkspaceFiles(vfs, root, dir, files, uploads);
      changed();
      await json(res, 200, { paths: saved });
      return true;
    }
    if (method === "POST" && rest === "files/move") {
      const b = await readJson(req);
      const moved = await moveWorkspaceEntry(
        vfs,
        root,
        String(b.path ?? ""),
        typeof b.toDir === "string" && b.toDir !== "" ? b.toDir : null,
      );
      changed();
      await json(res, 200, { moved });
      return true;
    }
    if (method === "POST" && rest === "files/rename") {
      const b = await readJson(req);
      const outcome = await renameWorkspaceFile(
        vfs,
        root,
        String(b.path ?? ""),
        String(b.newName ?? ""),
      );
      if (outcome === "renamed") changed();
      await json(res, 200, { ok: true });
      return true;
    }
    if (method === "POST" && rest === "files/folder") {
      const b = await readJson(req);
      const created = await createWorkspaceFolder(
        vfs,
        root,
        String(b.path ?? b.folder_name ?? ""),
      );
      changed();
      await json(res, 200, { created });
      return true;
    }
    json(res, 404, { error: "not found" });
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
    if (err instanceof FilePathError) {
      json(res, 400, { error: err.message });
      return true;
    }
    const refusal = readOnlyRefusal(err) ?? err;
    if (refusal instanceof FileOpError) {
      json(res, refusal.status, {
        error: refusal.message,
        ...(refusal.code ? { code: refusal.code } : {}),
      });
      return true;
    }
    throw err;
  }
}
