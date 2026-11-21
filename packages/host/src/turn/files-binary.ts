import type { ServerResponse } from "node:http";
import { OFFICE_MAX_BYTES } from "@houston/wire-types";
import { type Vfs, VfsReadLimitError } from "../vfs";
import { json } from "./deps";
import { archiveWorkspace } from "./files-archive";
import { contentDisposition, mimeFor } from "./files-mime";
import { logMissingFile } from "./files-missing";
import { type OfficePreview, serveOfficePreview } from "./files-office";
import { fileKey, safeRel, workspaceRel } from "./files-path";

export async function serveFileDownload(
  vfs: Vfs,
  root: string,
  agentId: string,
  query: URLSearchParams,
  res: ServerResponse,
  officePreview?: OfficePreview,
): Promise<void> {
  const rel = workspaceRel(root, query.get("path") ?? "");
  let buf: Buffer | null;
  try {
    buf = await vfs.readBytes(
      fileKey(root, rel),
      query.get("as") === "pdf" ? OFFICE_MAX_BYTES : undefined,
    );
  } catch (error) {
    if (!(error instanceof VfsReadLimitError)) throw error;
    json(res, 413, {
      code: "too_large",
      error: "Office preview input exceeds 30 MiB",
    });
    return;
  }
  if (buf === null) {
    await logMissingFile(vfs, root, rel, agentId);
    json(res, 404, { error: "file not found" });
    return;
  }
  const name = rel.split("/").pop() ?? "";
  if (query.get("as") === "pdf") {
    await serveOfficePreview(
      officePreview,
      buf,
      name,
      query.get("lang") || "en",
      res,
    );
    return;
  }
  const kind = query.get("disposition") === "inline" ? "inline" : "attachment";
  res.writeHead(200, {
    "Content-Type": mimeFor(name),
    "Content-Disposition": contentDisposition(kind, name),
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

export async function serveArchive(
  vfs: Vfs,
  root: string,
  agentName: string,
  query: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const rawFolder = query.get("path");
  const folder = rawFolder ? safeRel(rawFolder) : undefined;
  const zip = await archiveWorkspace(vfs, root, folder);
  const zipName = folder
    ? `${folder.split("/").pop()}.zip`
    : `${agentName} files.zip`;
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": contentDisposition("attachment", zipName),
    "Content-Length": zip.length,
    "Cache-Control": "no-store",
  });
  res.end(zip);
}
