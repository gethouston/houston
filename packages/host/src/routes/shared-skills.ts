import type { IncomingMessage, ServerResponse } from "node:http";
import {
  composeSkillMd,
  loadSkillDetailFromDir,
  loadSkillsFromDir,
  sharedSkillsDirKey,
  skillDirKeyInDir,
  skillKeyInDir,
  slugify,
} from "@houston/domain";
import { ownsWorkspace } from "../domain/access";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";

export interface SharedSkillsDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
}

/** Workspace-level shared skill CRUD. The workspace owner is the local authz seam. */
export async function handleSharedSkills(
  deps: SharedSkillsDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = path.match(
    /^\/v1\/workspaces\/([^/]+)\/shared-skills(?:\/([^/]+))?$/,
  );
  if (!match) return false;
  const workspaceId = decodeURIComponent(match[1] ?? "");
  const slug = match[2] ? decodeURIComponent(match[2]) : null;
  const workspace = await deps.store.getWorkspace(workspaceId);
  if (!ownsWorkspace(userId, workspace)) {
    json(res, workspace ? 403 : 404, {
      error: workspace ? "forbidden" : "workspace not found",
    });
    return true;
  }
  if (!workspace) return true;
  if (!deps.vfs) {
    json(res, 503, { error: "shared skills not configured" });
    return true;
  }

  const paths = deps.paths ?? new CloudPaths();
  const dir = sharedSkillsDirKey(paths.sharedRoot(workspace));
  const fireChange = () =>
    deps.events?.emit(workspace.ownerUserId, {
      type: "SharedSkillsChanged",
      workspaceId,
    });

  if (method === "GET" && !slug) {
    json(res, 200, await loadSkillsFromDir(deps.vfs, dir));
    return true;
  }
  if (method === "GET" && slug) {
    const detail = await loadSkillDetailFromDir(deps.vfs, dir, slug);
    json(
      res,
      detail ? 200 : 404,
      detail ?? { error: "shared skill not found" },
    );
    return true;
  }
  if (method === "POST" && !slug) {
    const fields = parseCreate(await readJson(req), res);
    if (!fields) return true;
    const newSlug = slugify(fields.name);
    if (!newSlug) {
      json(res, 400, { error: "name does not produce a usable slug" });
      return true;
    }
    if ((await deps.vfs.readText(skillKeyInDir(dir, newSlug))) !== null) {
      json(res, 409, { error: `shared skill '${newSlug}' already exists` });
      return true;
    }
    await deps.vfs.writeText(
      skillKeyInDir(dir, newSlug),
      composeSkillMd({
        ...fields,
        name: newSlug,
        createdIsoDate: new Date().toISOString().slice(0, 10),
      }),
    );
    fireChange();
    json(res, 201, await loadSkillDetailFromDir(deps.vfs, dir, newSlug));
    return true;
  }
  if (method === "PUT" && slug) {
    const body = await readJson(req);
    if (!body.content || typeof body.content !== "string") {
      json(res, 400, { error: "missing 'content'" });
      return true;
    }
    const key = skillKeyInDir(dir, slug);
    if ((await deps.vfs.readText(key)) === null) {
      json(res, 404, { error: "shared skill not found" });
      return true;
    }
    await deps.vfs.writeText(key, body.content);
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "DELETE" && slug) {
    if ((await deps.vfs.readText(skillKeyInDir(dir, slug))) === null) {
      json(res, 404, { error: "shared skill not found" });
      return true;
    }
    await deps.vfs.deletePrefix(skillDirKeyInDir(dir, slug));
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  json(res, 405, { error: "method not allowed" });
  return true;
}

function parseCreate(
  body: Record<string, unknown>,
  res: ServerResponse,
): { name: string; description: string; content: string } | null {
  for (const field of ["name", "description", "content"] as const) {
    if (!body[field] || typeof body[field] !== "string") {
      json(res, 400, { error: `missing '${field}'` });
      return null;
    }
  }
  return body as { name: string; description: string; content: string };
}
