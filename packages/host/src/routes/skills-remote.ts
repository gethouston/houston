import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent, RepoSkill } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CommunityDirectory } from "../skills/community";
import { listSkillsFromRepo } from "../skills/github";
import {
  installCommunitySkill,
  installSkillsFromRepo,
} from "../skills/install";
import { SkillRemoteError } from "../skills/remote-error";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";

/**
 * The marketplace half of the skills surface: skills.sh community search +
 * install and GitHub-repo discovery + install, feeding the same
 * `.agents/skills/<slug>/SKILL.md` folders the CRUD routes serve. One
 * directory instance per process so the skills.sh cache + request spacing are
 * global (mirrors the legacy Rust engine's static cache).
 */

const directory = new CommunityDirectory();

/** Typed errors answer `{error: {code, message, details: {kind}}}` so the
 *  engine-client's `HoustonEngineError.kind` (and the Add Skills dialog's
 *  plain-English error states) work identically against both engines. */
function fail(res: ServerResponse, err: unknown): void {
  if (err instanceof SkillRemoteError) {
    const code =
      err.httpStatus === 400
        ? "BAD_REQUEST"
        : err.httpStatus === 404
          ? "NOT_FOUND"
          : "UNAVAILABLE";
    json(res, err.httpStatus, {
      error: { code, message: err.message, details: { kind: err.kind } },
    });
    return;
  }
  json(res, 502, {
    error: err instanceof Error ? err.message : String(err),
  });
}

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
    const body = await readJson(req);
    if (typeof body.query !== "string") {
      json(res, 400, { error: "missing 'query'" });
      return true;
    }
    try {
      json(res, 200, await directory.search(body.query));
    } catch (err) {
      fail(res, err);
    }
    return true;
  }

  if (family === "community" && action === "popular") {
    try {
      json(res, 200, await directory.popular());
    } catch (err) {
      fail(res, err);
    }
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
      fail(res, err);
    }
    return true;
  }

  if (family === "repo" && action === "list") {
    const body = await readJson(req);
    if (typeof body.source !== "string") {
      json(res, 400, { error: "missing 'source'" });
      return true;
    }
    try {
      const { skills } = await listSkillsFromRepo(fetchImpl, body.source);
      json(res, 200, skills);
    } catch (err) {
      fail(res, err);
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
      fail(res, err);
    }
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}
