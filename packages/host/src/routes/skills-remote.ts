import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent, RepoSkill } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import {
  installCommunitySkill,
  installSkillsFromRepo,
} from "../skills/install";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import {
  communityPopularAction,
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
    json(res, 405, { error: "method not allowed" });
    return true;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (family === "community" && action === "search") {
    await communitySearchAction(req, res);
    return true;
  }
  if (family === "community" && action === "popular") {
    await communityPopularAction(res);
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
