import type { ServerResponse } from "node:http";
import type { Agent } from "../domain/types";
import type { Vfs } from "../vfs";
import { json } from "./deps";
import { serveArchive, serveFileDownload } from "./files-binary";
import { logMissingFile } from "./files-missing";
import type { OfficePreview } from "./files-office";
import { listWorkspace, readWorkspaceFile, workspaceRel } from "./files-ops";

export async function handleFileReads(
  vfs: Vfs,
  root: string,
  agent: Agent,
  rest: string,
  res: ServerResponse,
  query: URLSearchParams,
  officePreview?: OfficePreview,
): Promise<boolean> {
  if (rest === "files") {
    await json(res, 200, await listWorkspace(vfs, root));
    return true;
  }
  if (rest === "files/download") {
    await serveFileDownload(vfs, root, agent.id, query, res, officePreview);
    return true;
  }
  if (rest === "files/archive") {
    await serveArchive(vfs, root, agent.name, query, res);
    return true;
  }
  if (rest === "files/read") {
    const rel = workspaceRel(root, query.get("path") ?? "");
    const got = await readWorkspaceFile(vfs, root, rel);
    if (!got) {
      await logMissingFile(vfs, root, rel, agent.id);
      json(res, 404, { error: "file not found" });
      return true;
    }
    await json(res, 200, got);
    return true;
  }
  return false;
}
