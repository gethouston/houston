import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent, RepoSkill } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import {
  installCommunitySkill,
  installSkillsFromRepo,
} from "../skills/install";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed, readJson } from "./http";
import { defineRouteFamily } from "./registry";
import {
  communityPopularAction,
  communityPreviewAction,
  communitySearchAction,
  failSkill,
  repoListAction,
} from "./skills-directory";

/**
 * The agent-scoped marketplace surface: installs write into the agent's
 * `.agents/skills/<slug>/SKILL.md` (the same folders pi loads), and the
 * read-only search/popular/list routes are also served here for the
 * engine-client wire (which scopes every call under /agents/:id). The shared
 * skills.sh cache + typed error shape live in skills-directory.ts.
 */

export interface RemoteSkillsDeps {
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

export async function handleSkillsRemote(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
  deps: RemoteSkillsDeps = {},
): Promise<boolean> {
  const m = rest.match(/^skills\/(community|repo)\/([a-z]+)$/);
  if (!m) return false;
  const [, family, action] = m;
  if (method !== "POST") {
    methodNotAllowed(res);
    return true;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (family === "community" && action === "search") {
    await communitySearchAction(req, res, fetchImpl);
    return true;
  }
  if (family === "community" && action === "popular") {
    await communityPopularAction(req, res, fetchImpl);
    return true;
  }
  if (family === "community" && action === "preview") {
    await communityPreviewAction(req, res, fetchImpl);
    return true;
  }
  if (family === "repo" && action === "list") {
    await repoListAction(req, res, fetchImpl);
    return true;
  }

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  const fireChange = () =>
    emit?.({ type: "SkillsChanged", agentPath: ctx.agent.id });

  if (family === "community" && action === "install") {
    const body = await readJson(req);
    if (typeof body.source !== "string" || typeof body.skillId !== "string") {
      json(res, 400, { error: "missing 'source' or 'skillId'" });
      return true;
    }
    try {
      const slug = await installCommunitySkill(
        fetchImpl,
        vfs,
        root,
        body.source,
        body.skillId,
      );
      fireChange();
      json(res, 200, slug);
    } catch (err) {
      failSkill(res, err);
    }
    return true;
  }

  if (family === "repo" && action === "install") {
    const body = await readJson(req);
    if (typeof body.source !== "string" || !Array.isArray(body.skills)) {
      json(res, 400, { error: "missing 'source' or 'skills'" });
      return true;
    }
    try {
      const installed = await installSkillsFromRepo(
        fetchImpl,
        vfs,
        root,
        body.source,
        body.skills as RepoSkill[],
      );
      fireChange();
      json(res, 200, installed);
    } catch (err) {
      failSkill(res, err);
    }
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}

/**
 * The six marketplace pairs as one family, plus the BOUNDARY the regex above
 * owns beyond them: any action under `skills/{community,repo}`, claimed for
 * every method so the handler is the one thing deciding what belongs here.
 * That is what keeps its three answers reachable and distinct — a blanket 405
 * for a wrong method, a 404 for a lower-case action nobody serves, and a
 * DECLINE for anything `[a-z]+` never matched (`skills/community/Search`, a
 * percent-escaped slug), which then reaches the agent's own engine.
 *
 * The `:action` boundary is deliberately WIDER than the regex; the handler's
 * own `return false` is what narrows it back, so the matcher needs no
 * character class it does not have.
 */
defineRouteFamily({
  group: "skills-remote",
  members: [
    { method: "POST", path: "/agents/:agentId/skills/community/search" },
    { method: "POST", path: "/agents/:agentId/skills/community/popular" },
    { method: "POST", path: "/agents/:agentId/skills/community/preview" },
    { method: "POST", path: "/agents/:agentId/skills/community/install" },
    { method: "POST", path: "/agents/:agentId/skills/repo/list" },
    { method: "POST", path: "/agents/:agentId/skills/repo/install" },
  ],
  owns: [
    "/agents/:agentId/skills/community/:action",
    "/agents/:agentId/skills/repo/:action",
  ],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/skills-remote.ts",
  handler: ({ deps, authz, method, path, req, res, emit }) =>
    handleSkillsRemote(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    ),
});
