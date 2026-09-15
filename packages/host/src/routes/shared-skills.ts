import type { ServerResponse } from "node:http";
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
import { CloudPaths } from "../paths";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { defineRouteFamily, type UserCtx } from "./registry";

const COLLECTION = "/v1/workspaces/:workspaceId/shared-skills";
const ITEM = "/v1/workspaces/:workspaceId/shared-skills/:slug";

/**
 * Workspace-level shared skill CRUD. The workspace owner is the local authz
 * seam, and both paths are `owns`ed for every method because the 405 is written
 * BEHIND that seam: a stranger learns the workspace is not theirs, never which
 * methods it would have served.
 */
defineRouteFamily({
  group: "shared-skills",
  members: [
    { method: "GET", path: COLLECTION },
    { method: "POST", path: COLLECTION },
    { method: "GET", path: ITEM },
    { method: "POST", path: ITEM },
    { method: "PUT", path: ITEM },
    { method: "DELETE", path: ITEM },
  ],
  owns: [COLLECTION, ITEM],
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/shared-skills.ts",
  handler: serveSharedSkills,
});

async function serveSharedSkills(ctx: UserCtx): Promise<void> {
  const { deps, userId, method, params, req, res } = ctx;
  const workspaceId = params.workspaceId ?? "";
  const workspace = await deps.store.getWorkspace(workspaceId);
  if (!ownsWorkspace(userId, workspace)) {
    return json(res, workspace ? 403 : 404, {
      error: workspace ? "forbidden" : "workspace not found",
    });
  }
  if (!workspace) return;
  const vfs = deps.vfs;
  if (!vfs) return json(res, 503, { error: "shared skills not configured" });

  const paths = deps.paths ?? new CloudPaths();
  const dir = sharedSkillsDirKey(paths.sharedRoot(workspace));
  const fireChange = () =>
    deps.events?.emit(workspace.ownerUserId, {
      type: "SharedSkillsChanged",
      workspaceId,
    });

  const slug = params.slug;
  if (slug === undefined) {
    if (method === "GET")
      return json(res, 200, await loadSkillsFromDir(vfs, dir));
    if (method === "POST")
      return create(vfs, dir, await readJson(req), res, fireChange);
  } else {
    if (method === "GET") {
      const detail = await loadSkillDetailFromDir(vfs, dir, slug);
      return json(
        res,
        detail ? 200 : 404,
        detail ?? { error: "shared skill not found" },
      );
    }
    // Promote: place a FULL existing SKILL.md (frontmatter intact) into the
    // store at an exact slug — the explicit "Share to workspace" act that
    // replaced auto-migration (a skill becomes shared only when a user says
    // so). Unlike the compose-create above, content arrives verbatim.
    if (method === "POST")
      return promote(vfs, dir, slug, await readJson(req), res, fireChange);
    if (method === "PUT")
      return replace(vfs, dir, slug, await readJson(req), res, fireChange);
    if (method === "DELETE") return remove(vfs, dir, slug, res, fireChange);
  }
  json(res, 405, { error: "method not allowed" });
}

async function remove(
  vfs: Vfs,
  dir: string,
  slug: string,
  res: ServerResponse,
  fireChange: () => void,
): Promise<void> {
  if ((await vfs.readText(skillKeyInDir(dir, slug))) === null)
    return json(res, 404, { error: "shared skill not found" });
  await vfs.deletePrefix(skillDirKeyInDir(dir, slug));
  fireChange();
  json(res, 200, { ok: true });
}

async function create(
  vfs: Vfs,
  dir: string,
  body: Record<string, unknown>,
  res: ServerResponse,
  fireChange: () => void,
): Promise<void> {
  const fields = parseCreate(body, res);
  if (!fields) return;
  const newSlug = slugify(fields.name);
  if (!newSlug)
    return json(res, 400, { error: "name does not produce a usable slug" });
  if ((await vfs.readText(skillKeyInDir(dir, newSlug))) !== null)
    return json(res, 409, {
      error: `shared skill '${newSlug}' already exists`,
    });
  await vfs.writeText(
    skillKeyInDir(dir, newSlug),
    composeSkillMd({
      ...fields,
      name: newSlug,
      createdIsoDate: new Date().toISOString().slice(0, 10),
    }),
  );
  fireChange();
  json(res, 201, await loadSkillDetailFromDir(vfs, dir, newSlug));
}

async function promote(
  vfs: Vfs,
  dir: string,
  slug: string,
  body: Record<string, unknown>,
  res: ServerResponse,
  fireChange: () => void,
): Promise<void> {
  const content = readContent(body, res);
  if (content === null) return;
  if ((await vfs.readText(skillKeyInDir(dir, slug))) !== null)
    return json(res, 409, { error: `shared skill '${slug}' already exists` });
  await vfs.writeText(skillKeyInDir(dir, slug), content);
  fireChange();
  json(res, 201, await loadSkillDetailFromDir(vfs, dir, slug));
}

async function replace(
  vfs: Vfs,
  dir: string,
  slug: string,
  body: Record<string, unknown>,
  res: ServerResponse,
  fireChange: () => void,
): Promise<void> {
  const content = readContent(body, res);
  if (content === null) return;
  const key = skillKeyInDir(dir, slug);
  if ((await vfs.readText(key)) === null)
    return json(res, 404, { error: "shared skill not found" });
  await vfs.writeText(key, content);
  fireChange();
  json(res, 200, { ok: true });
}

/** The verbatim SKILL.md a promote/replace carries, or null once 400 is sent. */
function readContent(
  body: Record<string, unknown>,
  res: ServerResponse,
): string | null {
  if (!body.content || typeof body.content !== "string") {
    json(res, 400, { error: "missing 'content'" });
    return null;
  }
  return body.content;
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
