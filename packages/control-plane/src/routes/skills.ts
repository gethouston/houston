import type { IncomingMessage, ServerResponse } from "node:http";
import {
  composeSkillMd,
  loadSkillDetail,
  loadSkills,
  skillDirKey,
  skillKey,
  slugify,
} from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { Vfs } from "../vfs";
import { workspaceRoot } from "./agent-data";
import { json, readJson } from "./http";

/**
 * Skills (.agents/skills/<slug>/SKILL.md — the same folders pi loads into the
 * agent's prompt) served by the host off the workspace Vfs. A created/edited
 * skill reaches the agent on its next session/turn with no extra plumbing:
 * locally the dir IS the agent's, in cloud it hydrates with the workspace.
 * Returns true when handled.
 */
export async function handleSkills(
  vfs: Vfs | undefined,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = rest.match(/^skills(?:\/([^/]+))?$/);
  if (!m) return false;
  const slug = m[1] ? decodeURIComponent(m[1]) : null;

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = workspaceRoot(ctx.workspace, ctx.agent);

  if (method === "GET" && !slug) {
    json(res, 200, await loadSkills(vfs, root));
    return true;
  }

  if (method === "GET" && slug) {
    const detail = await loadSkillDetail(vfs, root, slug);
    if (!detail) json(res, 404, { error: "skill not found" });
    else json(res, 200, detail);
    return true;
  }

  if (method === "POST" && !slug) {
    const body = await readJson(req);
    for (const field of ["name", "description", "content"]) {
      if (!body[field] || typeof body[field] !== "string") {
        json(res, 400, { error: `missing '${field}'` });
        return true;
      }
    }
    const newSlug = slugify(body.name);
    if (!newSlug) {
      json(res, 400, { error: "name does not produce a usable slug" });
      return true;
    }
    if ((await vfs.readText(skillKey(root, newSlug))) !== null) {
      json(res, 409, { error: `skill '${newSlug}' already exists` });
      return true;
    }
    const today = new Date().toISOString().slice(0, 10);
    await vfs.writeText(
      skillKey(root, newSlug),
      composeSkillMd({ name: newSlug, description: body.description, content: body.content, createdIsoDate: today }),
    );
    const detail = await loadSkillDetail(vfs, root, newSlug);
    json(res, 201, detail);
    return true;
  }

  if (method === "PUT" && slug) {
    const body = await readJson(req);
    if (!body.content || typeof body.content !== "string") {
      json(res, 400, { error: "missing 'content'" });
      return true;
    }
    if ((await vfs.readText(skillKey(root, slug))) === null) {
      json(res, 404, { error: "skill not found" });
      return true;
    }
    await vfs.writeText(skillKey(root, slug), body.content);
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "DELETE" && slug) {
    if ((await vfs.readText(skillKey(root, slug))) === null) {
      json(res, 404, { error: "skill not found" });
      return true;
    }
    await vfs.deletePrefix(skillDirKey(root, slug));
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 405, { error: "method not allowed" });
  return true;
}
