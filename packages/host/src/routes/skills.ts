import type { IncomingMessage, ServerResponse } from "node:http";
import {
  composeSkillMd,
  loadSkillDetail,
  loadSkills,
  skillDirKey,
  skillKey,
  slugify,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed, readJson } from "./http";
import { defineRouteFamily } from "./registry";

/**
 * Skills (.agents/skills/<slug>/SKILL.md — the same folders pi loads into the
 * agent's prompt) served by the host off the workspace Vfs. A created/edited
 * skill reaches the agent on its next session/turn with no extra plumbing:
 * locally the dir IS the agent's, in cloud it hydrates with the workspace.
 * Returns true when handled.
 */
export async function handleSkills(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  const m = rest.match(/^skills(?:\/([^/]+))?$/);
  if (!m) return false;
  const slug = m[1] ? decodeURIComponent(m[1]) : null;

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const fireChange = () =>
    emit?.({ type: "SkillsChanged", agentPath: ctx.agent.id });

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
    const fields: Record<"name" | "description" | "content", string> = {
      name: "",
      description: "",
      content: "",
    };
    for (const field of ["name", "description", "content"] as const) {
      const value = body[field];
      if (!value || typeof value !== "string") {
        json(res, 400, { error: `missing '${field}'` });
        return true;
      }
      fields[field] = value;
    }
    const newSlug = slugify(fields.name);
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
      composeSkillMd({
        name: newSlug,
        description: fields.description,
        content: fields.content,
        createdIsoDate: today,
      }),
    );
    fireChange();
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
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "DELETE" && slug) {
    if ((await vfs.readText(skillKey(root, slug))) === null) {
      json(res, 404, { error: "skill not found" });
      return true;
    }
    await vfs.deletePrefix(skillDirKey(root, slug));
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }

  methodNotAllowed(res);
  return true;
}

/**
 * The five pairs one regex serves. The family owns both of its paths for
 * every method, so a wrong verb still reaches the handler — which answers the
 * unwired-vfs 503 BEFORE its 405, an order the dispatcher's own 405 would skip.
 *
 * `skills/community/search` and friends are NOT in this family: the regex above
 * stops at one segment after `skills`, so the two-segment marketplace paths in
 * skills-remote.ts never collide with it despite the shared prefix.
 */
defineRouteFamily({
  group: "skills",
  members: [
    { method: "GET", path: "/agents/:agentId/skills" },
    { method: "POST", path: "/agents/:agentId/skills" },
    { method: "GET", path: "/agents/:agentId/skills/:slug" },
    { method: "PUT", path: "/agents/:agentId/skills/:slug" },
    { method: "DELETE", path: "/agents/:agentId/skills/:slug" },
  ],
  owns: ["/agents/:agentId/skills", "/agents/:agentId/skills/:slug"],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/skills.ts",
  handler: async ({ deps, authz, method, path, req, res, emit }) => {
    await handleSkills(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    );
  },
});
